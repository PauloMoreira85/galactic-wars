// Geometria do mapa: coordenadas e tempo de viagem (compartilhado por galaxy/combat).

export interface Coords {
  galaxy: number;
  system: number;
  slot: number;
}

// Tempo de viagem em ticks entre duas coordenadas.
export function travelTicks(a: Coords, b: Coords): number {
  const dg = Math.abs(a.galaxy - b.galaxy);
  if (dg > 0) return 8 + dg * 4;
  const ds = Math.abs(a.system - b.system);
  if (ds > 0) return 3 + Math.min(ds, 6);
  return a.slot === b.slot ? 1 : 2; // mesmo sistema
}
