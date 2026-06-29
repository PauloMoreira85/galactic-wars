// Geometria do mapa: coordenadas e tempo de viagem (compartilhado por galaxy/combat).
//
// Coordenada do jogador = SETOR:SISTEMA:SLOT.
//   - SETOR   (campo `galaxy`)  → 1..NUM_SETORES
//   - SISTEMA (campo `system`)  → 1..NUM_SISTEMAS
//   - SLOT    (campo `slot`)    → 1..SLOTS (jogador dentro da galáxia)
// A GALÁXIA (unidade de aliança/governo) = o par (setor, sistema). Os 5 slots
// de uma galáxia são aliados entre si. galaxyId() colapsa o par num inteiro
// único usado SÓ internamente (governo, votos, tratados, ranking, fórum/chat).

export const NUM_SETORES = 5;
export const NUM_SISTEMAS = 6;
export const PUBLIC_GALAXIES = NUM_SETORES * NUM_SISTEMAS; // 30

export interface Coords {
  galaxy: number;
  system: number;
  slot: number;
}

// id único de uma galáxia a partir do par (setor, sistema). Funciona também para
// galáxias privadas (setor >= 100), gerando ids altos que não colidem com os 1..30.
export function galaxyId(setor: number, sistema: number): number {
  return (setor - 1) * NUM_SISTEMAS + sistema;
}

// Inverso de galaxyId: volta o par (setor, sistema) a partir do id.
export function galaxyDecompose(id: number): { setor: number; sistema: number } {
  return { setor: Math.floor((id - 1) / NUM_SISTEMAS) + 1, sistema: ((id - 1) % NUM_SISTEMAS) + 1 };
}

// `where` do Prisma para achar os planetas de uma galáxia (pelo id).
export function galaxyWhere(id: number): { galaxy: number; system: number } {
  const { setor, sistema } = galaxyDecompose(id);
  return { galaxy: setor, system: sistema };
}

// Tempo de viagem em ticks entre duas coordenadas.
export function travelTicks(a: Coords, b: Coords): number {
  const dg = Math.abs(a.galaxy - b.galaxy);
  if (dg > 0) return 8 + dg * 4;
  const ds = Math.abs(a.system - b.system);
  if (ds > 0) return 3 + Math.min(ds, 6);
  return a.slot === b.slot ? 1 : 2; // mesmo sistema
}
