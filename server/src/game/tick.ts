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
// Timestamp UTC (ms) da meia-noite de HOJE em Brasília.
function brasiliaMidnight(nowMs: number): number {
  const d = new Date(nowMs + tzMs());
  const asUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
  return asUtc - tzMs();
}
// Todos os horários de início candidatos (ontem, hoje, amanhã), em ms UTC.
function candidateStarts(nowMs: number): number[] {
  const mid = brasiliaMidnight(nowMs);
  const out: number[] = [];
  for (const off of [-1, 0, 1]) {
    for (const m of config.roundStartTimes) out.push(mid + off * DAY_MS + m * 60 * 1000);
  }
  return out.sort((a, b) => a - b);
}
// Início "armado": o maior horário de início cuja janela de reset já abriu
// (now >= início − lead). É o round que os dados devem representar AGORA.
function armedStart(nowMs: number): number {
  const leadMs = config.roundResetLeadMinutes * 60 * 1000;
  const starts = candidateStarts(nowMs);
  let armed = starts[0];
  for (const s of starts) {
    if (nowMs >= s - leadMs) armed = s;
    else break; // ordenado: o primeiro que não passa encerra a busca
  }
  return armed;
}

// Próximo horário de início DEPOIS de um dado início (pro contador "próximo round"
// no cliente). Respeita a agenda (1 ou N rounds/dia) em vez de assumir +24h.
export function nextScheduledStart(afterMs: number): number {
  const mid = brasiliaMidnight(afterMs);
  const cands: number[] = [];
  for (const off of [0, 1, 2]) {
    for (const m of config.roundStartTimes) cands.push(mid + off * DAY_MS + m * 60 * 1000);
  }
  cands.sort((a, b) => a - b);
  for (const c of cands) if (c > afterMs) return c;
  return cands[cands.length - 1];
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
  // Uma ÚNICA transação com todos os updates: o motor pega o lock de escrita 1x
  // (não 1x por planeta). Isso reduz drasticamente a disputa pelo lock com as
  // ações do jogador (build/pesquisa), que antes esperavam até o busy_timeout (5s).
  const updates = planets.map((p) => {
    const b = miningBonus(parseTech(p.tech));
    return prisma.planet.update({
      where: { id: p.id },
      data: {
        metalium: Math.min(RESOURCE_CAP, p.metalium + (p.roidMetalium * ROID_PRODUCTION_PER_TICK + b.metalium) * n),
        carbonum: Math.min(RESOURCE_CAP, p.carbonum + (p.roidCarbonum * ROID_PRODUCTION_PER_TICK + b.carbonum) * n),
        plutonium: Math.min(RESOURCE_CAP, p.plutonium + (p.roidPlutonium * ROID_PRODUCTION_PER_TICK + b.plutonium) * n),
      },
    });
  });
  if (updates.length) await prisma.$transaction(updates);
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

// ===== Modo CICLO AUTOMÁTICO (padrão) =====
// Cada horário de roundStartTimes inicia um round de roundTicks; antes de cada
// início (lead) zera (soft) o anterior. Suporta 1 ou N rounds por dia.
async function advanceScheduled() {
  const state = await ensureGameState();
  if (!state) return;
  const now = Date.now();
  const intervalMs = config.tickIntervalSeconds * 1000;
  const armed = armedStart(now);

  // Bootstrap: alinha ao round atual SEM zerar (preserva dados ao migrar/deployar).
  if (state.roundStartAt == null) {
    await prisma.gameState.update({ where: { id: 1 }, data: { roundStartAt: new Date(armed) } });
    return; // próxima checada já processa os ticks
  }

  const roundStart = new Date(state.roundStartAt).getTime();

  // RESET: a janela de reset de um novo início abriu (armed mudou) → zera (soft)
  // e arma o novo início. Idempotente (só dispara quando o carregado difere).
  if (roundStart !== armed) {
    await softResetRound(new Date(armed));
    console.log(`[tick] reset agendado — novo round armado para ${new Date(armed).toISOString()}`);
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
