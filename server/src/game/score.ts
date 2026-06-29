// Pontuação (canon original recuperado do manual).
import { unitByName } from "./catalog.js";
import { type UnitMap } from "./unitmap.js";
import { parseAgents } from "./agents.js";

// Valor das NAVES (usado tb p/ força de frota): 1 ponto / 10 de (M+C) e
// 0,75 / 10 de Plutonium gastos. (As naves da tabela custam 0 de plutonium.)
export function scoreOfUnits(units: UnitMap): number {
  let s = 0;
  for (const n of Object.keys(units)) {
    const u = unitByName(n);
    if (u) s += units[n] * ((u.m + u.c) * 0.1 + u.p * 0.075);
  }
  return Math.floor(s);
}

// Campos do planeta necessários p/ a pontuação canônica.
export interface ScorablePlanet {
  metalium: number; carbonum: number; plutonium: number;
  roidMetalium: number; roidCarbonum: number; roidPlutonium: number;
  agents: string; tech: string;
}

// Pontuação CANÔNICA do planeta (ranking / alcance de ataque):
//  - naves: scoreOfUnits
//  - estoque guardado: 1 ponto / 100 (M+C+P)
//  - asteroides iniciados: 250 cada
//  - agentes de inteligência: 50 cada
//  - evoluções (pesquisas+construções concluídas): nº² × 200
export function planetScore(p: ScorablePlanet, units: UnitMap): number {
  const ships = scoreOfUnits(units);
  const stored = Math.floor((p.metalium + p.carbonum + p.plutonium) / 100);
  const roids = (p.roidMetalium + p.roidCarbonum + p.roidPlutonium) * 250;
  let agents = 0;
  try { agents = Object.values(parseAgents(p.agents)).reduce((a, b) => a + (b || 0), 0); } catch {}
  let evolutions = 0;
  try { const t = JSON.parse(p.tech || "{}"); for (const k in t) evolutions += Number(t[k]) || 0; } catch {}
  const research = evolutions * evolutions * 200;
  return Math.floor(ships + stored + roids + agents * 50 + research);
}
