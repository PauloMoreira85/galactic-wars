// Sistema de viagem (TEC) — canônico.
// TEC base por classe (dentro da galáxia); Propulsão reduz até -4.
// Distância: mesmo setor OU paralelo = +2; resto = +4. Frota viaja na nave mais lenta.

import type { ClasseCode } from "./unitTable.js";
import { unitByName } from "./catalog.js";
import type { UnitMap } from "./unitmap.js";
import { galaxyDecompose } from "./geo.js";

const BASE_TEC: Record<ClasseCode, number> = { Ca: 6, Co: 7, Fr: 8, De: 9, Cr: 9, Na: 10, Ro: 6 };
const MAX_PROPULSAO_REDUCTION = 4;

export function effectiveTec(classe: ClasseCode, propulsaoLevel: number): number {
  const red = Math.min(MAX_PROPULSAO_REDUCTION, Math.max(0, propulsaoLevel));
  return Math.max(1, BASE_TEC[classe] - red);
}

// Penalidade de distância entre duas galáxias (recebe os IDS de galaxyId()):
// mesma galáxia = 0 · mesmo setor OU mesmo paralelo (mesma linha/coluna da grade) = +2
// · resto do universo = +4.
export function galaxyPenalty(a: number, b: number): number {
  if (a === b) return 0; // mesma galáxia
  const A = galaxyDecompose(a), B = galaxyDecompose(b);
  if (A.setor === B.setor || A.paralelo === B.paralelo) return 2; // mesmo setor ou paralelo
  return 4;
}

// TEC da frota = da nave mais lenta (maior TEC efetivo).
export function fleetTec(units: UnitMap, propulsaoLevel: number): number {
  let max = 0;
  for (const name of Object.keys(units)) {
    if (units[name] <= 0) continue;
    const u = unitByName(name);
    if (!u) continue;
    max = Math.max(max, effectiveTec(u.classe, propulsaoLevel));
  }
  return max || 1;
}

// Tempo total de viagem (ticks) = TEC da frota + penalidade de distância.
export function travelTime(originGalaxy: number, targetGalaxy: number, units: UnitMap, propulsaoLevel: number): number {
  return Math.max(1, fleetTec(units, propulsaoLevel) + galaxyPenalty(originGalaxy, targetGalaxy));
}
