// Catálogo de unidades por raça, derivado da TABELA OFICIAL (unitTable.ts).
// Substitui o antigo modelo de 6 classes genéricas.

import { UNIT_TABLE, type UnitRow, type ClasseCode, type RaceTable } from "./unitTable.js";
import type { RaceKey } from "./races.js";
import { levelOf, type TechLevels } from "./tech.js";

// Mapeia a raça interna (RaceKey) para o rótulo da tabela.
const RACE_TO_TABLE: Record<RaceKey, RaceTable> = {
  humanos: "Humana", daharan: "Daharan", rakshasa: "Rakshasa", mech: "c-Mech", insecta: "Insecta",
};

// Ordem de "tamanho" das classes (para achar o roider de categoria mais baixa = nativo).
const CLASS_RANK: Record<ClasseCode, number> = { Ca: 1, Co: 2, Fr: 3, De: 4, Cr: 5, Na: 6, Ro: 0 };
// Classe da nave -> fábrica (tech) que a habilita.
const CLASS_FACTORY: Record<string, string> = {
  Ca: "fabCaca", Co: "fabCorveta", Fr: "fabFragata", De: "fabDestroyer", Cr: "fabCruzador", Na: "fabNavemae",
};
export const CLASS_LABEL: Record<ClasseCode, string> = {
  Ca: "Caça", Co: "Corveta", Fr: "Fragata", De: "Destroyer", Cr: "Cruzador", Na: "Nave-mãe", Ro: "Roider",
};

export function raceTable(race: RaceKey): RaceTable {
  return RACE_TO_TABLE[race];
}
export function unitsOfRace(race: RaceKey): UnitRow[] {
  const rt = RACE_TO_TABLE[race];
  return UNIT_TABLE.filter((u) => u.race === rt);
}
export function unitByName(name: string): UnitRow | undefined {
  return UNIT_TABLE.find((u) => u.nome === name);
}

// O roider de classe mais baixa de cada raça é NATIVO (construível desde o início).
export function nativeRoiderName(race: RaceKey): string | null {
  const roiders = unitsOfRace(race).filter((u) => u.roider);
  if (roiders.length === 0) return null;
  return roiders.slice().sort((a, b) => CLASS_RANK[a.classe] - CLASS_RANK[b.classe])[0].nome;
}

// Uma unidade está desbloqueada para construir?
export function isUnitUnlocked(race: RaceKey, u: UnitRow, levels: TechLevels): boolean {
  if (u.roider) {
    if (u.nome === nativeRoiderName(race)) return true; // roider nativo
    return levelOf(levels, "pesqRoiderAvancado") >= 1; // roider superior
  }
  return levelOf(levels, CLASS_FACTORY[u.classe] ?? "") >= 1; // precisa da fábrica da classe
}

export function factoryFor(classe: ClasseCode): string | null {
  return CLASS_FACTORY[classe] ?? null;
}

// Slug acento-seguro p/ nome de arquivo: "Deméter" -> "demeter", "Amon-Rá" -> "amon-ra".
export function slug(s: string): string {
  return s
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Caminho convencional da arte da nave (PNG em client/public/art/ships/<slug>.png).
export function shipImage(name: string): string {
  return `/art/ships/${slug(name)}.png`;
}
