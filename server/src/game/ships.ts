// ===== Catalogo de naves =====
// 6 classes universais (Caca -> Nave-mae), em ordem crescente de poder.
// Cada raca tem nomes tematicos para as mesmas classes (cosmetico).
// Stats sao a base; modificadores de raca (hullModifier, shipCostModifier)
// sao aplicados em cima destes na hora de construir/combater.

import type { RaceKey } from "./races.js";

export type ShipClass =
  | "caca"
  | "corveta"
  | "fragata"
  | "destroyer"
  | "cruzador"
  | "navemae";

export const SHIP_CLASSES: ShipClass[] = [
  "caca",
  "corveta",
  "fragata",
  "destroyer",
  "cruzador",
  "navemae",
];

export interface ShipStats {
  // Combate (por unidade)
  attack: number;
  hull: number;
  shield: number;
  // Custo base de construir 1 unidade
  cost: { metalium: number; carbonum: number; plutonium: number };
  // Ticks para construir 1 unidade
  buildTicks: number;
  // Carga de roids que a nave consegue carregar ao roubar (capacidade de pilhagem)
  raidCapacity: number;
}

export const SHIP_STATS: Record<ShipClass, ShipStats> = {
  caca:      { attack: 5,   hull: 10,  shield: 2,   cost: { metalium: 1000,   carbonum: 400,    plutonium: 0      }, buildTicks: 1,  raidCapacity: 1 },
  corveta:   { attack: 12,  hull: 25,  shield: 8,   cost: { metalium: 2400,   carbonum: 1200,   plutonium: 200    }, buildTicks: 2,  raidCapacity: 3 },
  fragata:   { attack: 30,  hull: 60,  shield: 20,  cost: { metalium: 6000,   carbonum: 3000,   plutonium: 800    }, buildTicks: 3,  raidCapacity: 8 },
  destroyer: { attack: 70,  hull: 140, shield: 50,  cost: { metalium: 14000,  carbonum: 8000,   plutonium: 2400   }, buildTicks: 4,  raidCapacity: 18 },
  cruzador:  { attack: 150, hull: 320, shield: 110, cost: { metalium: 32000,  carbonum: 18000,  plutonium: 6000   }, buildTicks: 6,  raidCapacity: 45 },
  navemae:   { attack: 400, hull: 900, shield: 320, cost: { metalium: 100000, carbonum: 60000,  plutonium: 24000  }, buildTicks: 10, raidCapacity: 120 },
};

// Nomes tematicos por raca. Ordem = SHIP_CLASSES (Caca -> Nave-mae).
// Mech nao tem linha propria: constroi as naves das outras racas.
const SHIP_NAMES: Record<Exclude<RaceKey, "mech">, Record<ShipClass, string>> = {
  // Deuses gregos/romanos
  humanos: {
    caca: "Hermes", corveta: "Apolo", fragata: "Ares",
    destroyer: "Tânatos", cruzador: "Vulcano", navemae: "Hades",
  },
  // Deuses nordicos
  rakshasa: {
    caca: "Loki", corveta: "Heimdall", fragata: "Njord",
    destroyer: "Frigg", cruzador: "Thor", navemae: "Odin",
  },
  // Deuses egipcios
  daharan: {
    caca: "Bastet", corveta: "Tóth", fragata: "Hórus",
    destroyer: "Set", cruzador: "Anúbis", navemae: "Rá",
  },
  // Insetos
  insecta: {
    caca: "Formiga", corveta: "Vespa", fragata: "Gafanhoto",
    destroyer: "Louva-Deus", cruzador: "Escorpião", navemae: "Rainha",
  },
};

// Nome de exibicao da nave para uma raca + classe.
// Mech usa um rotulo generico mecanico (constroi de todas as racas no jogo).
const MECH_NAMES: Record<ShipClass, string> = {
  caca: "Autômato", corveta: "Sentinela", fragata: "Forja",
  destroyer: "Titã", cruzador: "Colosso", navemae: "Núcleo-Mãe",
};

export function shipName(race: RaceKey, cls: ShipClass): string {
  if (race === "mech") return MECH_NAMES[cls];
  return SHIP_NAMES[race][cls];
}

// Mapeia uma classe para o tier de pesquisa que a desbloqueia (1-based).
export function classTier(cls: ShipClass): number {
  return SHIP_CLASSES.indexOf(cls) + 1;
}

// Custo e tempo para pesquisar o proximo tier (targetTier = 1..6).
// Pesquisa puxa pesado no Plutonium (recurso de ciencia).
export function researchCost(targetTier: number) {
  const f = Math.pow(2, targetTier - 1);
  return {
    metalium: Math.round(120 * f),
    carbonum: Math.round(80 * f),
    plutonium: Math.round(100 * f),
  };
}
export function researchTicks(targetTier: number) {
  return targetTier * 2; // caca=2 ticks ... nave-mae=12 ticks
}

// Catalogo pronto pro front: classe + nome tematico + stats.
export function shipCatalog(race: RaceKey) {
  return SHIP_CLASSES.map((cls, i) => ({
    cls,
    order: i,
    name: shipName(race, cls),
    stats: SHIP_STATS[cls],
  }));
}
