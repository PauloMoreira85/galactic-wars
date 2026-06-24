// ===== Unidades de combate =====
// Duas linhas: naves de ATAQUE (as 6 classes) e ROIDERS (2 por raça, só roubam).
// Roiders LUTAM (têm casco/escudo, podem morrer), mas só elas têm raidCapacity.

import { SHIP_CLASSES, SHIP_STATS, type ShipClass } from "./ships.js";
import type { RaceKey } from "./races.js";

export type RoiderKey = "roider1" | "roider2";
export const ROIDER_KEYS: RoiderKey[] = ["roider1", "roider2"];

// Categoria (classe) de cada roider por raça. tier1 = construível desde o início.
const ROIDER_CLS: Record<RaceKey, [ShipClass, ShipClass]> = {
  humanos: ["fragata", "cruzador"],
  daharan: ["corveta", "cruzador"],
  rakshasa: ["corveta", "destroyer"],
  mech: ["fragata", "cruzador"], // provisório
  insecta: ["corveta", "destroyer"], // provisório
};
// Nomes provisórios (o usuário vai refinar depois).
const ROIDER_NAME: Record<RaceKey, [string, string]> = {
  humanos: ["Saqueador", "Pilhador"],
  daharan: ["Saqueador", "Pilhador"],
  rakshasa: ["Saqueador", "Pilhador"],
  mech: ["Saqueador", "Pilhador"],
  insecta: ["Saqueador", "Pilhador"],
};

const ROIDER_CAPACITY: Record<RoiderKey, number> = { roider1: 60, roider2: 240 };

export interface RoiderDef {
  key: RoiderKey;
  tier: 1 | 2;
  cls: ShipClass; // categoria base (stats vêm dela)
  name: string;
}
export function roidersOf(race: RaceKey): RoiderDef[] {
  return [
    { key: "roider1", tier: 1, cls: ROIDER_CLS[race][0], name: ROIDER_NAME[race][0] },
    { key: "roider2", tier: 2, cls: ROIDER_CLS[race][1], name: ROIDER_NAME[race][1] },
  ];
}

// Todas as unidades que entram no combate.
export const COMBAT_UNITS: string[] = [...SHIP_CLASSES, ...ROIDER_KEYS];

export const PLANET_UNIT_FIELD: Record<string, string> = {
  caca: "shipCaca", corveta: "shipCorveta", fragata: "shipFragata",
  destroyer: "shipDestroyer", cruzador: "shipCruzador", navemae: "shipNavemae",
  roider1: "roider1", roider2: "roider2",
};
export const FLEET_UNIT_FIELD: Record<string, string> = {
  caca: "fCaca", corveta: "fCorveta", fragata: "fFragata",
  destroyer: "fDestroyer", cruzador: "fCruzador", navemae: "fNavemae",
  roider1: "fRoider1", roider2: "fRoider2",
};

export interface UnitStat { attack: number; hull: number; shield: number; raidCapacity: number }

// Stats de TODAS as unidades para uma raça (naves não roubam; roiders sim).
export function unitStats(race: RaceKey): Record<string, UnitStat> {
  const out: Record<string, UnitStat> = {};
  for (const c of SHIP_CLASSES) out[c] = { ...SHIP_STATS[c], raidCapacity: 0 };
  for (const r of roidersOf(race)) {
    const base = SHIP_STATS[r.cls];
    out[r.key] = {
      attack: Math.floor(base.attack * 0.25), // roiders atiram fraco
      hull: base.hull, shield: base.shield,
      raidCapacity: ROIDER_CAPACITY[r.key],
    };
  }
  return out;
}

export function isRoider(key: string): key is RoiderKey {
  return key === "roider1" || key === "roider2";
}

// Custo/tempo de construir 1 roider (baseado na categoria, +50%).
export function roiderCost(race: RaceKey, key: RoiderKey) {
  const def = roidersOf(race).find((r) => r.key === key)!;
  const b = SHIP_STATS[def.cls].cost;
  return {
    metalium: Math.ceil(b.metalium * 1.5),
    carbonum: Math.ceil(b.carbonum * 1.5),
    plutonium: Math.ceil(b.plutonium * 1.5),
  };
}
export function roiderBuildTicks(race: RaceKey, key: RoiderKey) {
  const def = roidersOf(race).find((r) => r.key === key)!;
  return SHIP_STATS[def.cls].buildTicks;
}
