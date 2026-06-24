// Pontuação (canon: 1.000.000 de metalium+carbonum em naves = 100.000 pontos = ×0.1).
import { unitByName } from "./catalog.js";
import { type UnitMap } from "./unitmap.js";

export function scoreOfUnits(units: UnitMap): number {
  let s = 0;
  for (const n of Object.keys(units)) {
    const u = unitByName(n);
    if (u) s += units[n] * (u.m + u.c) * 0.1;
  }
  return Math.floor(s);
}
