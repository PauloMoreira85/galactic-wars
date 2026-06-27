import { prisma } from "../db.js";
import { config } from "../config.js";
import { ROID_PRODUCTION_PER_TICK, RESOURCE_CAP } from "./constants.js";
import { processBuildOrders, parseTech } from "./fleet.js";
import { miningBonus } from "./tech.js";
import { processFleets } from "./galaxy.js";
import { processTax } from "./governance.js";
import { processEffects } from "./sabotage.js";
import { softResetRound } from "./round.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

const DAY_MS = 24 * 3600 * 1000;

// ===== Horário de Brasília (UTC-3, sem horário de verão) =====
// Deslocamento em ms: somar ao "agora" UTC dá um Date cujos campos UTC são a
// hora de parede de Brasília.
function tzMs() { return config.roundTzOffsetHours * 3600 * 1000; }
// Hora-do-dia de Brasília em horas decimais (ex.: 7.5 = 07:30).
function brasiliaHourOfDay(nowMs: number): number {
  const d = new Date(nowMs + tzMs());
  return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}
// Timestamp UTC (ms) do horário de parede HH:MM de HOJE em Brasília.
function brasiliaBoundary(nowMs: number, hour: number, minute: number): number {
  const d = new Date(nowMs + tzMs());
  const asUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute, 0, 0);
  return asUtc - tzMs();
}
// Início (08:00) do round que está/deveria estar carregado AGORA.
// >= 07:30 → o início é hoje 08:00 (já passou/está no reset); senão (00:00–07:29)
// o round ativo/congelado começou ONTEM às 08:00.
function currentRoundStart(nowMs: number): number {
  const today0800 = brasiliaBoundary(nowMs, config.roundStartHour, config.roundStartMinute);
  const resetHod = config.roundResetHour + config.roundResetMinute / 60;
  return brasiliaHourOfDay(nowMs) >= resetHod ? today0800 : today0800 - DAY_MS;
}

// Garante que a linha singleton de GameState existe.
async function ensureGameState() {
  const existing = await prisma.gameState.findUnique({ where: { id: 1 } });
  if (!existing) {
    await prisma.gameState.create({ data: { id: 1, tickNumber: 0 } });
  }
  return prisma.gameState.findUnique({ where: { id: 1 } });
}

// Processa `n` ticks de uma vez. Produção por recurso = roids×PROD + bônus FLAT
// das construções de mineração. Produção é linear, então multiplicamos por n.
async function processTicks(n: number) {
  if (n <= 0) return;
  const planets = await prisma.planet.findMany();
  for (const p of planets) {
    const b = miningBonus(parseTech(p.tech));
    await prisma.planet.update({
      where: { id: p.id },
      data: {
        metalium: Math.min(RESOURCE_CAP, p.metalium + (p.roidMetalium * ROID_PRODUCTION_PER_TICK + b.metalium) * n),
        carbonum: Math.min(RESOURCE_CAP, p.carbonum + (p.roidCarbonum * ROID_PRODUCTION_PER_TICK + b.carbonum) * n),
        plutonium: Math.min(RESOURCE_CAP, p.plutonium + (p.roidPlutonium * ROID_PRODUCTION_PER_TICK + b.plutonium) * n),
      },
    });
  }
}

// Aplica os ticks de `fromTick` até `toTick` (produção em lote + combate 1 a 1).
async function applyTicks(fromTick: number, toTick: number) {
  const due = toTick - fromTick;
  if (due <= 0) return;
  await processTicks(due);
  await processTax(due);
  await processEffects(due, toTick);
  // Resolve construções/pesquisas até o tick atingido (concluir, pode em lote).
  await processBuildOrders(toTick);
  // Frotas/combate: UM tick por vez. Assim o combate avança 1 rodada por tick,
  // mesmo num catch-up após deploy/downtime — dando chance de reagir entre ticks.
  for (let t = fromTick + 1; t <= toTick; t++) {
    await processFleets(t);
  }
}

// ===== Modo CICLO DIÁRIO (padrão) =====
// Round começa 08:00, roda roundTicks (→ 04:00), congela até o reset das 07:30.
async function advanceScheduled() {
  const state = await ensureGameState();
  if (!state) return;
  const now = Date.now();
  const intervalMs = config.tickIntervalSeconds * 1000;

  // Bootstrap: alinha ao round atual SEM zerar (preserva dados ao migrar/deployar).
  if (state.roundStartAt == null) {
    const rs = currentRoundStart(now);
    await prisma.gameState.update({ where: { id: 1 }, data: { roundStartAt: new Date(rs) } });
    return; // próxima checada já processa os ticks
  }

  const roundStart = new Date(state.roundStartAt).getTime();
  const today0730 = brasiliaBoundary(now, config.roundResetHour, config.roundResetMinute);
  const today0800 = brasiliaBoundary(now, config.roundStartHour, config.roundStartMinute);

  // RESET DIÁRIO (07:30): já passou do horário e o round carregado é de um dia
  // anterior → zera (soft) e arma o início (08:00 de hoje). Idempotente.
  if (now >= today0730 && roundStart < today0800) {
    await softResetRound(new Date(today0800));
    console.log(`[tick] reset diário (07:30) — novo round armado para ${new Date(today0800).toISOString()}`);
    return;
  }

  // Tick-alvo derivado do relógio: 0 antes do início; capado em roundTicks no fim.
  const targetTick = now >= roundStart
    ? Math.min(config.roundTicks, Math.floor((now - roundStart) / intervalMs))
    : 0;
  if (targetTick <= state.tickNumber) return; // aguardando início ou round congelado

  await applyTicks(state.tickNumber, targetTick);
  await prisma.gameState.update({
    where: { id: 1 },
    data: { tickNumber: targetTick, lastTickAt: new Date(roundStart + targetTick * intervalMs) },
  });
  console.log(`[tick] +${targetTick - state.tickNumber} tick(s) -> tick #${targetTick}/${config.roundTicks}`);
}

// ===== Modo LIVRE (DAILY_SCHEDULE=false) — comportamento antigo, reset manual =====
async function advanceFree() {
  const state = await ensureGameState();
  if (!state) return;
  const intervalMs = config.tickIntervalSeconds * 1000;
  const now = Date.now();
  const nowBoundary = Math.floor(now / intervalMs) * intervalMs;
  const lastBoundary = Math.floor(new Date(state.lastTickAt).getTime() / intervalMs) * intervalMs;
  let due = Math.floor((nowBoundary - lastBoundary) / intervalMs);
  if (due <= 0) {
    if (new Date(state.lastTickAt).getTime() !== lastBoundary) {
      await prisma.gameState.update({ where: { id: 1 }, data: { lastTickAt: new Date(lastBoundary) } });
    }
    return;
  }
  const remaining = config.roundTicks - state.tickNumber;
  if (remaining <= 0) {
    await prisma.gameState.update({ where: { id: 1 }, data: { lastTickAt: new Date(nowBoundary) } });
    return;
  }
  if (due > remaining) due = remaining;
  const newTickNumber = state.tickNumber + due;
  await applyTicks(state.tickNumber, newTickNumber);
  await prisma.gameState.update({
    where: { id: 1 },
    data: { tickNumber: newTickNumber, lastTickAt: new Date(lastBoundary + due * intervalMs) },
  });
  console.log(`[tick] +${due} tick(s) -> tick #${newTickNumber}`);
}

// Avanca o relogio conforme o modo configurado.
async function advance() {
  if (running) return;
  running = true;
  try {
    if (config.dailySchedule) await advanceScheduled();
    else await advanceFree();
  } finally {
    running = false;
  }
}

export async function startTickEngine() {
  await ensureGameState();
  await advance(); // catch-up de ticks perdidos enquanto estava offline
  // Checa com frequência pra processar logo na virada do relógio (tick alinhado).
  const checkMs = Math.min(config.tickIntervalSeconds * 1000, 5_000);
  timer = setInterval(() => {
    advance().catch((e) => console.error("[tick] erro:", e));
  }, checkMs);
  console.log(
    `[tick] motor iniciado (modo ${config.dailySchedule ? "ciclo diário" : "livre"}, intervalo ${config.tickIntervalSeconds}s, checando a cada ${checkMs / 1000}s)`
  );
}

export function stopTickEngine() {
  if (timer) clearInterval(timer);
}
