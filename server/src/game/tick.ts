import { prisma } from "../db.js";
import { config } from "../config.js";
import { ROID_PRODUCTION_PER_TICK, RESOURCE_CAP } from "./constants.js";
import { processBuildOrders, parseTech } from "./fleet.js";
import { miningBonus } from "./tech.js";
import { processFleets } from "./galaxy.js";
import { processTax } from "./governance.js";
import { processEffects } from "./sabotage.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

// Garante que a linha singleton de GameState existe.
async function ensureGameState() {
  const existing = await prisma.gameState.findUnique({ where: { id: 1 } });
  if (!existing) {
    await prisma.gameState.create({ data: { id: 1, tickNumber: 0 } });
  }
  return prisma.gameState.findUnique({ where: { id: 1 } });
}

// Processa `n` ticks de uma vez. Produção por recurso = roids×450 + bônus FLAT
// das construções de mineração. Produção é linear, então multiplicamos por n.
async function processTicks(n: number) {
  if (n <= 0) return;
  const planets = await prisma.planet.findMany();
  for (const p of planets) {
    const b = miningBonus(parseTech(p.tech));
    // Produção clampada ao teto (o que passar de RESOURCE_CAP é perdido).
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

// Avanca o relogio: processa quantos ticks couberam desde lastTickAt.
async function advance() {
  if (running) return;
  running = true;
  try {
    const state = await ensureGameState();
    if (!state) return;

    const intervalMs = config.tickIntervalSeconds * 1000;
    // Ticks ALINHADOS ao relógio: as fronteiras são múltiplos do intervalo desde
    // o epoch (ex.: 5min -> :00, :05, :10...). Assim os jogadores se guiam pelo
    // relógio do celular/PC e o tick nunca cai em segundo "quebrado".
    const now = Date.now();
    const nowBoundary = Math.floor(now / intervalMs) * intervalMs;
    const lastBoundary = Math.floor(new Date(state.lastTickAt).getTime() / intervalMs) * intervalMs;
    let due = Math.floor((nowBoundary - lastBoundary) / intervalMs);
    if (due <= 0) {
      // Sem tick novo; se o lastTickAt estava desalinhado (legado), realinha sem contar tick.
      if (new Date(state.lastTickAt).getTime() !== lastBoundary) {
        await prisma.gameState.update({ where: { id: 1 }, data: { lastTickAt: new Date(lastBoundary) } });
      }
      return;
    }

    // Round acabou: não processa mais ticks (jogo congela no roundTicks).
    const remaining = config.roundTicks - state.tickNumber;
    if (remaining <= 0) {
      await prisma.gameState.update({ where: { id: 1 }, data: { lastTickAt: new Date(nowBoundary) } });
      return;
    }
    if (due > remaining) due = remaining; // só avança até o fim do round

    await processTicks(due);
    await processTax(due); // desvia o imposto da galaxia pro fundo
    await processEffects(due, state.tickNumber + due); // debuffs de sabotagem

    const newTickNumber = state.tickNumber + due;
    // Mantém o lastTickAt alinhado: fronteira + nº de ticks aplicados.
    const newLastTick = new Date(lastBoundary + due * intervalMs);
    await prisma.gameState.update({
      where: { id: 1 },
      data: { tickNumber: newTickNumber, lastTickAt: newLastTick },
    });
    // Resolve construcoes/pesquisas ate o tick atingido (são "concluir", pode em lote).
    await processBuildOrders(newTickNumber);
    // Frotas/combate: UM tick por vez. Assim o combate avança 1 rodada por tick
    // (nunca "vários de uma vez"), mesmo num catch-up após deploy/downtime —
    // dando chance de reagir entre os ticks.
    for (let t = state.tickNumber + 1; t <= newTickNumber; t++) {
      await processFleets(t);
    }
    console.log(`[tick] +${due} tick(s) -> tick #${newTickNumber}`);
  } finally {
    running = false;
  }
}

export async function startTickEngine() {
  await ensureGameState();
  await advance(); // catch-up de ticks perdidos enquanto estava offline
  // Checa de tempos em tempos; processa quando um intervalo completo passou.
  // Checa com frequência pra processar logo na virada do relógio (tick alinhado).
  const checkMs = Math.min(config.tickIntervalSeconds * 1000, 5_000);
  timer = setInterval(() => {
    advance().catch((e) => console.error("[tick] erro:", e));
  }, checkMs);
  console.log(
    `[tick] motor iniciado (intervalo ${config.tickIntervalSeconds}s, checando a cada ${checkMs / 1000}s)`
  );
}

export function stopTickEngine() {
  if (timer) clearInterval(timer);
}
