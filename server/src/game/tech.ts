// ===== Tecnologias e Construcoes =====
// Sistema unico de "upgrades" com niveis. Cada item e Pesquisa ou Construcao,
// numa categoria, com pre-requisitos, custo (escala por nivel) e efeito.
// O ciclo de naves: pesquisa a classe -> constroi a fabrica -> pode produzir;
// a fabrica libera a pesquisa da proxima classe.

import type { ShipClass } from "./ships.js";

export type TechCategory = "mineracao" | "tec" | "espionagem" | "sabotagem" | "naves";
export type TechKind = "research" | "building";

export interface Req { key: string; level: number }

export interface TechDef {
  key: string;
  name: string;
  category: TechCategory;
  kind: TechKind;
  max: number; // nivel maximo (1 = item de uma vez so)
  desc: string;
  requires: Req[];
  baseCost: { metalium: number; carbonum: number; plutonium: number };
  costGrowth: number; // multiplicador de custo por nivel
  baseTicks: number;
}

// Mapa classe de nave -> chave da fabrica que a habilita.
export const SHIP_FACTORY: Record<ShipClass, string> = {
  caca: "fabCaca", corveta: "fabCorveta", fragata: "fabFragata",
  destroyer: "fabDestroyer", cruzador: "fabCruzador", navemae: "fabNavemae",
};

const SHIP_CHAIN: { cls: ShipClass; nome: string }[] = [
  { cls: "caca", nome: "Caça" }, { cls: "corveta", nome: "Corveta" },
  { cls: "fragata", nome: "Fragata" }, { cls: "destroyer", nome: "Destroyer" },
  { cls: "cruzador", nome: "Cruzador" }, { cls: "navemae", nome: "Nave-mãe" },
];

// Monta a cadeia de naves: pesquisa(N) requer fabrica(N-1); fabrica(N) requer pesquisa(N).
function buildShipChain(): TechDef[] {
  const out: TechDef[] = [];
  SHIP_CHAIN.forEach((s, i) => {
    const prevFab = i > 0 ? `fab${cap(SHIP_CHAIN[i - 1].cls)}` : null;
    const pesqKey = `pesq${cap(s.cls)}`;
    const fabKey = `fab${cap(s.cls)}`;
    const scale = Math.pow(2.2, i); // classes avancadas custam muito mais
    out.push({
      key: pesqKey, name: `Pesquisa: ${s.nome}`, category: "naves", kind: "research", max: 1,
      desc: `Desbloqueia a construcao da Fabrica de ${s.nome}.`,
      requires: prevFab ? [{ key: prevFab, level: 1 }] : [],
      baseCost: { metalium: Math.round(3000 * scale), carbonum: Math.round(1800 * scale), plutonium: Math.round(2400 * scale) },
      costGrowth: 1, baseTicks: 2 + i,
    });
    out.push({
      key: fabKey, name: `Fábrica de ${s.nome}`, category: "naves", kind: "building", max: 1,
      desc: `Permite produzir ${s.nome}.`,
      requires: [{ key: pesqKey, level: 1 }],
      baseCost: { metalium: Math.round(5000 * scale), carbonum: Math.round(3000 * scale), plutonium: Math.round(1200 * scale) },
      costGrowth: 1, baseTicks: 3 + i,
    });
  });
  return out;
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Cadeia sequencial pesquisa->construcao para uma categoria (Inteligencia, Sabotagem).
// Cada construcao exige sua pesquisa; cada pesquisa exige a construcao anterior.
interface ChainItem { key: string; name: string; desc: string }
function pesqConstrChain(
  category: TechCategory,
  pesqBase: { metalium: number; carbonum: number; plutonium: number },
  fabBase: { metalium: number; carbonum: number; plutonium: number },
  items: ChainItem[]
): TechDef[] {
  const out: TechDef[] = [];
  items.forEach((it, i) => {
    const scale = Math.pow(1.8, i);
    const prevBuild = i > 0 ? items[i - 1].key : null;
    const pesqKey = "pesq_" + it.key;
    const sc = (b: { metalium: number; carbonum: number; plutonium: number }) => ({
      metalium: Math.round(b.metalium * scale), carbonum: Math.round(b.carbonum * scale), plutonium: Math.round(b.plutonium * scale),
    });
    out.push({
      key: pesqKey, name: `Pesquisa: ${it.name}`, category, kind: "research", max: 1,
      desc: `Desbloqueia a construção de ${it.name}.`,
      requires: prevBuild ? [{ key: prevBuild, level: 1 }] : [],
      baseCost: sc(pesqBase), costGrowth: 1, baseTicks: 3 + i,
    });
    out.push({
      key: it.key, name: it.name, category, kind: "building", max: 1, desc: it.desc,
      requires: [{ key: pesqKey, level: 1 }],
      baseCost: sc(fabBase), costGrowth: 1, baseTicks: 4 + i,
    });
  });
  return out;
}

// Tiers sequenciais de Inteligencia (definem o nível de espionagem).
export const INTEL_TIERS = ["centralInteligencia", "servicoSecreto", "agentesMilitares", "transmissao", "agentesDuplos"];

export const TECHS: TechDef[] = [
  // --- Mineracao (pesquisa -> construcao; pesquisa ja vem feita no inicio) ---
  {
    key: "pesqMineracao", name: "Pesquisa: Mineração", category: "mineracao", kind: "research", max: 1,
    desc: "Desbloqueia o Complexo de Mineração.",
    requires: [], baseCost: { metalium: 3000, carbonum: 1800, plutonium: 0 }, costGrowth: 1, baseTicks: 2,
  },
  {
    key: "mineracao", name: "Complexo de Mineração", category: "mineracao", kind: "building", max: 20,
    desc: "+5% na produção de TODOS os roids por nível.",
    requires: [{ key: "pesqMineracao", level: 1 }], baseCost: { metalium: 4000, carbonum: 2400, plutonium: 0 }, costGrowth: 1.5, baseTicks: 2,
  },
  // --- TEC (velocidade de frota) ---
  {
    key: "pesqPropulsao", name: "Pesquisa: Propulsão", category: "tec", kind: "research", max: 1,
    desc: "Desbloqueia os Motores de Dobra.",
    requires: [], baseCost: { metalium: 6000, carbonum: 4000, plutonium: 3000 }, costGrowth: 1, baseTicks: 4,
  },
  {
    key: "propulsao", name: "Motores de Dobra", category: "tec", kind: "building", max: 4,
    desc: "-1 TEC no tempo de viagem de TODAS as suas naves por nível (até -4).",
    requires: [{ key: "pesqPropulsao", level: 1 }], baseCost: { metalium: 8000, carbonum: 5000, plutonium: 2000 }, costGrowth: 1.6, baseTicks: 3,
  },
  // --- Inteligencia (cadeia de agentes; todos comecam com Informantes: raca da galaxia) ---
  ...pesqConstrChain("espionagem",
    { metalium: 4000, carbonum: 3000, plutonium: 3000 },
    { metalium: 4000, carbonum: 2500, plutonium: 2000 },
    [
      { key: "centralInteligencia", name: "Central de Inteligência", desc: "Produz Coordenadores de Operações e Agentes de Contra-Espionagem. Permite espionar (revela a raça do alvo)." },
      { key: "servicoSecreto", name: "Formação de Serviço Secreto", desc: "Agentes Padrão: revelam raça, pontuação, moral, qtd de cada roid e qtd de naves (não quais) + status online." },
      { key: "agentesMilitares", name: "Agentes Militares", desc: "Revelam QUAIS e quantas naves o alvo tem (em Rakshasa, só as roiders aparecem)." },
      { key: "transmissao", name: "Equipe de Transmissão", desc: "Agentes de Transmissão: notícias do alvo e tráfego (ataques/defesas chegando)." },
      { key: "agentesDuplos", name: "Agentes Duplos", desc: "Revelam todas as frotas do alvo (quais/quantas naves, missão, ticks p/ chegar). Enxergam até os Rakshasa." },
    ]
  ),
  // --- Sabotagem (cada nivel libera sabotagens; executadas na tela de Sabotagem) ---
  ...pesqConstrChain("sabotagem",
    { metalium: 5000, carbonum: 3500, plutonium: 4000 },
    { metalium: 7000, carbonum: 5000, plutonium: 5000 },
    [
      { key: "sabSistemasMineracao", name: "Sistemas de Mineração", desc: "Sabotagens: Explosão de Mina (−100% produção por 1 tick) e Intrigas Internas (−5 moral, −20 prontidão)." },
      { key: "sabEquipeProducao", name: "Equipe de Produção", desc: "Blackout Industrial (+4 ticks na produção de naves) e Suborno de Agentes (−30% inteligência por 10 ticks)." },
      { key: "sabInfiltracao", name: "Infiltração na Inteligência", desc: "Roubo de Recursos (destrói 1/3 da pontuação em recurso, rouba 1/6) e Isolamento Militar (alvo sem defesa por 3 ticks)." },
      { key: "sabEquipeMineracao", name: "Equipe de Mineração", desc: "Vazamento Radioativo (−75% produção por 4 ticks) e Boatos (+25% pontuação do alvo por 12 ticks)." },
      { key: "sabProducaoAvancada", name: "Equipe Avançada de Produção", desc: "Vírus Industrial (+16 ticks na produção de naves) e Forjar Ordem (todas as frotas do alvo recuam)." },
      { key: "sabAssimiladora", name: "Equipe Assimiladora", desc: "Roubo de Tecnologia (rouba uma tecnologia do alvo)." },
    ]
  ),
  // --- Roider avancado (libera o roider de tier 2; o tier 1 vem desde o inicio) ---
  {
    key: "pesqRoiderAvancado", name: "Pesquisa: Roider Avançado", category: "naves", kind: "research", max: 1,
    desc: "O roider básico já vem desbloqueado. Esta pesquisa libera o roider de categoria SUPERIOR (maior capacidade).",
    requires: [], baseCost: { metalium: 8000, carbonum: 5000, plutonium: 4000 }, costGrowth: 1, baseTicks: 4,
  },
  // --- Naves (cadeia pesquisa -> fabrica) ---
  ...buildShipChain(),
];

export const TECH_BY_KEY: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.key, t]));

export type TechLevels = Record<string, number>;

export function levelOf(levels: TechLevels, key: string): number {
  return levels[key] ?? 0;
}

// Custo para subir do nivel atual para o proximo.
export function upgradeCost(def: TechDef, currentLevel: number) {
  const f = Math.pow(def.costGrowth, currentLevel);
  return {
    metalium: Math.ceil(def.baseCost.metalium * f),
    carbonum: Math.ceil(def.baseCost.carbonum * f),
    plutonium: 0, // plutônio é exclusivo para combustível; pesquisas/construções não usam
  };
}
export function upgradeTicks(def: TechDef, currentLevel: number) {
  return def.baseTicks + currentLevel;
}

// Requisitos atendidos?
export function reqsMet(def: TechDef, levels: TechLevels): boolean {
  return def.requires.every((r) => levelOf(levels, r.key) >= r.level);
}

// ===== Efeitos =====
export function productionMultiplier(levels: TechLevels): number {
  return 100 + 5 * levelOf(levels, "mineracao"); // percent
}
export function travelMultiplier(levels: TechLevels): number {
  return Math.max(50, 100 - 4 * levelOf(levels, "propulsao")); // percent
}
export function canBuildShip(levels: TechLevels, cls: ShipClass): boolean {
  return levelOf(levels, SHIP_FACTORY[cls]) >= 1;
}
// Nível de espionagem = quantas construções de inteligência (em sequência) você tem.
// 1=Central (raça) · 2=Serviço Secreto (roids/pontuação) · 3=Militares (naves) · 4=Transmissão · 5=Duplos.
export function espionageLevel(levels: TechLevels): number {
  let n = 0;
  for (const k of INTEL_TIERS) {
    if (levelOf(levels, k) >= 1) n++;
    else break;
  }
  return n;
}
