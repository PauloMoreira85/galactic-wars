import { prisma } from "../db.js";
import { config } from "../config.js";
import { ROID_PRODUCTION_PER_TICK } from "./constants.js";
import { processBuildOrders } from "./fleet.js";
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

// Processa `n` ticks de uma vez (produca de recursos pelos roids).
// Producao e linear, entao multiplicamos por n em um unico UPDATE.
async function processTicks(n: number) {
  if (n <= 0) return;
  const base = ROID_PRODUCTION_PER_TICK * n;
  // Producao = roids * base * prodMul/100 (prodMul vem do Complexo de Mineracao).
  await prisma.$executeRawUnsafe(
    `UPDATE Planet SET
       metalium  = metalium  + roidMetalium  * ${base} * prodMul / 100,
       carbonum  = carbonum  + roidCarbonum  * ${base} * prodMul / 100,
       plutonium = plutonium + roidPlutonium * ${base} * prodMul / 100`
  );
}

// Avanca o relogio: processa quantos ticks couberam desde lastTickAt.
async function advance() {
  if (running) return;
  running = true;
  try {
    const state = await ensureGameState();
    if (!state) return;

    const intervalMs = config.tickIntervalSeconds * 1000;
    const elapsed = Date.now() - new Date(state.lastTickAt).getTime();
    const due = Math.floor(elapsed / intervalMs);
    if (due <= 0) return;

    await processTicks(due);
    await processTax(due); // desvia o imposto da galaxia pro fundo
    await processEffects(due, state.tickNumber + due); // debuffs de sabotagem

    const newTickNumber = state.tickNumber + due;
    const newLastTick = new Date(
      new Date(state.lastTickAt).getTime() + due * intervalMs
    );
    await prisma.gameState.update({
      where: { id: 1 },
      data: { tickNumber: newTickNumber, lastTickAt: newLastTick },
    });
    // Resolve construcoes/pesquisas e chegadas de frota ate o tick atingido.
    await processBuildOrders(newTickNumber);
    await processFleets(newTickNumber);
    console.log(`[tick] +${due} tick(s) -> tick #${newTickNumber}`);
  } finally {
    running = false;
  }
}

export async function startTickEngine() {
  await ensureGameState();
  await advance(); // catch-up de ticks perdidos enquanto estava offline
  // Checa de tempos em tempos; processa quando um intervalo completo passou.
  const checkMs = Math.min(config.tickIntervalSeconds * 1000, 30_000);
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
