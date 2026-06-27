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
  Ca: "fundicaoCacas", Co: "producaoCorvetas", Fr: "montagemFragatas",
  De: "fabricaDestroyers", Cr: "industriaCruzadores", Na: "estaleirosOrbitais",
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

// Naves Invisíveis (Rakshasa) NÃO aparecem no radar de tráfego para terceiros.
// Só as roiders (e demais tipos) são detectadas. A espionagem fura a invisibilidade.
const INVISIBLE_SHIPS = new Set(UNIT_TABLE.filter((u) => u.tipo === "Invisivel").map((u) => u.nome));
export function radarVisibleCount(units: Record<string, number>): number {
  let n = 0;
  for (const [name, count] of Object.entries(units)) {
    if (INVISIBLE_SHIPS.has(name)) continue;
    n += count;
  }
  return n;
}

// O roider de classe mais baixa de cada raça é NATIVO (construível desde o início).
export function nativeRoiderName(race: RaceKey): string | null {
  const roiders = unitsOfRace(race).filter((u) => u.roider);
  if (roiders.length === 0) return null;
  return roiders.slice().sort((a, b) => CLASS_RANK[a.classe] - CLASS_RANK[b.classe])[0].nome;
}

// Uma unidade está desbloqueada para construir?
export function isUnitUnlocked(race: RaceKey, u: UnitRow, levels: TechLevels): boolean {
  // Roider básico (classe mais baixa) já vem liberado.
  if (u.roider && u.nome === nativeRoiderName(race)) return true;
  // Todos os outros (incl. roider avançado) exigem a FÁBRICA da própria classe.
  return levelOf(levels, CLASS_FACTORY[u.classe] ?? "") >= 1;
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
