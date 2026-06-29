import { prisma } from "../db.js";

// ===== Moral =====
// 0–100, começa em 100 (cheia). Afeta a produção: ×(0.7 + 0.003×moral).
// moral 100 → ×1.0 (normal) · moral 0 → ×0.7 (−30%). É um medidor que você PERDE
// (decaimento + atacar fracos) e RECUPERA (roidar forte, pesquisar, criar frota,
// sabotar...), nunca passa do normal. Decai −1 a cada 5 ticks (motor de tick).
export const MORALE_START = 100;
export const MORALE_MIN = 0;
export const MORALE_MAX = 100;
export const MORALE_DECAY_EVERY = 5; // ticks por -1 de decaimento

export function clampMorale(m: number): number {
  return Math.max(MORALE_MIN, Math.min(MORALE_MAX, m));
}

// Multiplicador de produção pela moral (0.7 na moral 0 → 1.0 na moral 100).
export function moraleMult(morale: number): number {
  return 0.7 + 0.003 * clampMorale(morale);
}

// Ajusta a moral de um planeta (delta pode ser negativo). Os limites [0,200]
// são garantidos periodicamente pelo motor de tick (clampMoraleAll), então aqui
// só aplicamos o incremento — barato, sem leitura.
export async function addMorale(planetId: string, delta: number): Promise<void> {
  if (!delta) return;
  try { await prisma.planet.update({ where: { id: planetId }, data: { morale: { increment: delta } } }); } catch {}
}

// Decaimento + clamp de TODOS os planetas (chamado pelo motor a cada N ticks).
export async function decayAndClampMorale(): Promise<void> {
  await prisma.planet.updateMany({ data: { morale: { decrement: 1 } } });
  await prisma.planet.updateMany({ where: { morale: { lt: MORALE_MIN } }, data: { morale: MORALE_MIN } });
  await prisma.planet.updateMany({ where: { morale: { gt: MORALE_MAX } }, data: { morale: MORALE_MAX } });
}
