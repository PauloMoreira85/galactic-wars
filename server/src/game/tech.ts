// ===== Tecnologias e Construcoes (arvore canonica) =====
// Cada item e Pesquisa ou Construcao, numa categoria, com pre-requisitos.
// Mineracao/Deslocamento/Naves seguem a arvore oficial (cadeia sequencial:
// cada item requer o anterior). Inteligencia e Sabotagem mantem suas cadeias.

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
  costGrowth: number;
  baseTicks: number;
}

// Mapa classe de nave -> chave da FABRICA (construcao) que a habilita.
export const SHIP_FACTORY: Record<ShipClass, string> = {
  caca: "fundicaoCacas", corveta: "producaoCorvetas", fragata: "montagemFragatas",
  destroyer: "fabricaDestroyers", cruzador: "industriaCruzadores", navemae: "estaleirosOrbitais",
};

interface ChainItem { key: string; name: string; kind: TechKind; desc: string; m: number; c: number; ticks: number; max?: number }

// Cadeia sequencial: cada item requer o ANTERIOR (level 1). Custo só em M/C
// (plutônio é exclusivo de combustível). max=1 salvo indicado.
function chain(category: TechCategory, items: ChainItem[]): TechDef[] {
  return items.map((it, i) => ({
    key: it.key, name: it.name, category, kind: it.kind, max: it.max ?? 1, desc: it.desc,
    requires: i > 0 ? [{ key: items[i - 1].key, level: 1 }] : [],
    baseCost: { metalium: it.m, carbonum: it.c, plutonium: 0 }, costGrowth: 1, baseTicks: it.ticks,
  }));
}

// Cadeia Inteligencia/Sabotagem (pesquisa -> construcao alternadas).
function pesqConstrChain(
  category: TechCategory,
  pesqBase: { metalium: number; carbonum: number; plutonium: number },
  fabBase: { metalium: number; carbonum: number; plutonium: number },
  items: { key: string; name: string; desc: string }[]
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

// ===== Mineração (cada construção adiciona produção FLAT do recurso) =====
const MINERACAO = chain("mineracao", [
  { key: "centroMineracao", name: "Centro de Mineração", kind: "building", desc: "+1500 de produção de Metalium por tick.", m: 1250, c: 1250, ticks: 6 },
  { key: "extracaoCristal", name: "Extração de Carbonum", kind: "research", desc: "Desbloqueia a Mina de Carbonum.", m: 2500, c: 2500, ticks: 10 },
  { key: "minaCristal", name: "Mina de Carbonum", kind: "building", desc: "+1500 de produção de Carbonum por tick.", m: 5000, c: 5000, ticks: 13 },
  { key: "fusaoEonio", name: "Fusão de Plutônio", kind: "research", desc: "Desbloqueia o Laboratório de Plutônio.", m: 7500, c: 7500, ticks: 19 },
  { key: "labEonio", name: "Laboratório de Plutônio", kind: "building", desc: "+1500 de produção de Plutônio por tick.", m: 15000, c: 15000, ticks: 26 },
  { key: "recursosProfundidade", name: "Recursos em Profundidade", kind: "research", desc: "Desbloqueia minas mais profundas.", m: 22500, c: 22500, ticks: 26 },
  { key: "minaProfundaMetal", name: "Mina Profunda de Metalium", kind: "building", desc: "+10000 de produção de Metalium por tick.", m: 45000, c: 45000, ticks: 35 },
  { key: "armasPlasma", name: "Sondas de Carbonum Profundo", kind: "research", desc: "Desbloqueia a Mina Profunda de Carbonum.", m: 67500, c: 67500, ticks: 35 },
  { key: "minaProfundaCristal", name: "Mina Profunda de Carbonum", kind: "building", desc: "+10000 de produção de Carbonum por tick.", m: 135000, c: 135000, ticks: 50 },
  { key: "materiaisReforcados", name: "Materiais Reforçados", kind: "research", desc: "Desbloqueia o Laboratório Reforçado.", m: 135000, c: 135000, ticks: 50 },
  { key: "labReforcado", name: "Laboratório Reforçado", kind: "building", desc: "+10000 de produção de Plutônio por tick.", m: 135000, c: 135000, ticks: 50 },
]);

// ===== Deslocamento (cada construção reduz 1 tick do tempo de viagem) =====
const DESLOCAMENTO = chain("tec", [
  { key: "mecanicaQuantica", name: "Mecânica Quântica", kind: "research", desc: "Pesquisa rumo a propulsores mais potentes.", m: 1250, c: 1250, ticks: 6 },
  { key: "geradorSubvacuo", name: "Gerador de Subvácuo", kind: "building", desc: "−1 tick no tempo de viagem das suas frotas.", m: 2500, c: 2500, ticks: 10 },
  { key: "geracaoPortais", name: "Geração de Portais", kind: "research", desc: "Pesquisa rumo a propulsores mais potentes.", m: 5000, c: 5000, ticks: 13 },
  { key: "reguladorPortais", name: "Regulador de Portais", kind: "building", desc: "−1 tick adicional no tempo de viagem (total −2).", m: 10000, c: 10000, ticks: 19 },
  { key: "dobrasEspaciais", name: "Dobras Espaciais", kind: "research", desc: "Pesquisa rumo a propulsores mais potentes.", m: 15000, c: 15000, ticks: 26 },
  { key: "estabilizadorVortex", name: "Estabilizador de Vórtex", kind: "building", desc: "−1 tick adicional no tempo de viagem (total −3).", m: 45000, c: 45000, ticks: 35 },
  { key: "hiperespaco", name: "Hiperespaço", kind: "research", desc: "Pesquisa rumo a propulsores mais potentes.", m: 50000, c: 50000, ticks: 50 },
  { key: "reatorHiperespaco", name: "Reator de Hiperespaço", kind: "building", desc: "−1 tick adicional no tempo de viagem (total −4).", m: 150000, c: 150000, ticks: 50 },
]);

// ===== Naves (construir a fábrica habilita a classe; pesquisa libera a próxima) =====
const NAVES = chain("naves", [
  { key: "fundicaoCacas", name: "Fundição de Caças", kind: "building", desc: "Permite produzir Caças.", m: 1250, c: 1250, ticks: 6 },
  { key: "lancadoresTorpedos", name: "Lançadores de Torpedos", kind: "research", desc: "Desbloqueia a Produção de Corvetas.", m: 2500, c: 2500, ticks: 10 },
  { key: "producaoCorvetas", name: "Produção de Corvetas", kind: "building", desc: "Permite produzir Corvetas.", m: 5000, c: 5000, ticks: 13 },
  { key: "disparosRapidos", name: "Disparos Rápidos", kind: "research", desc: "Desbloqueia a Montagem de Fragatas.", m: 7500, c: 7500, ticks: 19 },
  { key: "montagemFragatas", name: "Montagem de Fragatas", kind: "building", desc: "Permite produzir Fragatas.", m: 15000, c: 15000, ticks: 26 },
  { key: "resistenciaTorpedos", name: "Resistência a Torpedos", kind: "research", desc: "Desbloqueia a Fábrica de Destróiers.", m: 22500, c: 22500, ticks: 26 },
  { key: "fabricaDestroyers", name: "Fábrica de Destróiers", kind: "building", desc: "Permite produzir Destróiers.", m: 45000, c: 45000, ticks: 35 },
  { key: "fuselagensAltaResist", name: "Fuselagens de Alta Resistência", kind: "research", desc: "Desbloqueia a Indústria de Cruzadores.", m: 67500, c: 67500, ticks: 35 },
  { key: "industriaCruzadores", name: "Indústria de Cruzadores", kind: "building", desc: "Permite produzir Cruzadores.", m: 135000, c: 135000, ticks: 50 },
  { key: "armamentoPesado", name: "Armamento Pesado", kind: "research", desc: "Desbloqueia os Estaleiros Orbitais.", m: 135000, c: 135000, ticks: 50 },
  { key: "estaleirosOrbitais", name: "Estaleiros Orbitais", kind: "building", desc: "Permite produzir Naves-Mãe.", m: 135000, c: 135000, ticks: 50 },
]);

export const TECHS: TechDef[] = [
  ...MINERACAO,
  ...DESLOCAMENTO,
  // --- Inteligencia ---
  ...pesqConstrChain("espionagem",
    { metalium: 1500, carbonum: 1200, plutonium: 800 },
    { metalium: 1500, carbonum: 1000, plutonium: 600 },
    [
      { key: "centralInteligencia", name: "Central de Inteligência", desc: "Produz Coordenadores de Operações e Agentes de Contra-Espionagem. Permite espionar (revela a raça do alvo)." },
      { key: "servicoSecreto", name: "Formação de Serviço Secreto", desc: "Agentes Padrão: revelam raça, pontuação, moral, qtd de cada roid e qtd de naves (não quais) + status online." },
      { key: "agentesMilitares", name: "Agentes Militares", desc: "Revelam QUAIS e quantas naves o alvo tem (em Rakshasa, só as roiders aparecem)." },
      { key: "transmissao", name: "Equipe de Transmissão", desc: "Agentes de Transmissão: notícias do alvo e tráfego (ataques/defesas chegando)." },
      { key: "agentesDuplos", name: "Agentes Duplos", desc: "Revelam todas as frotas do alvo (quais/quantas naves, missão, ticks p/ chegar). Enxergam até os Rakshasa." },
    ]
  ),
  // --- Sabotagem ---
  ...pesqConstrChain("sabotagem",
    { metalium: 2000, carbonum: 1500, plutonium: 1200 },
    { metalium: 2500, carbonum: 1800, plutonium: 1500 },
    [
      { key: "sabSistemasMineracao", name: "Sistemas de Mineração", desc: "Sabotagens: Explosão de Mina (−100% produção por 1 tick) e Intrigas Internas (−5 moral, −20 prontidão)." },
      { key: "sabEquipeProducao", name: "Equipe de Produção", desc: "Blackout Industrial (+4 ticks na produção de naves) e Suborno de Agentes (−30% inteligência por 10 ticks)." },
      { key: "sabInfiltracao", name: "Infiltração na Inteligência", desc: "Roubo de Recursos (destrói 1/3 da pontuação em recurso, rouba 1/6) e Isolamento Militar (alvo sem defesa por 3 ticks)." },
      { key: "sabEquipeMineracao", name: "Equipe de Mineração", desc: "Vazamento Radioativo (−75% produção por 4 ticks) e Boatos (+25% pontuação do alvo por 12 ticks)." },
      { key: "sabProducaoAvancada", name: "Equipe Avançada de Produção", desc: "Vírus Industrial (+16 ticks na produção de naves) e Forjar Ordem (todas as frotas do alvo recuam)." },
      { key: "sabAssimiladora", name: "Equipe Assimiladora", desc: "Roubo de Tecnologia (rouba uma tecnologia do alvo)." },
    ]
  ),
  ...NAVES,
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
    plutonium: 0, // plutônio é exclusivo para combustível
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
// Bônus FLAT de produção por recurso (das construções de mineração).
export function miningBonus(levels: TechLevels): { metalium: number; carbonum: number; plutonium: number } {
  return {
    metalium: (levelOf(levels, "centroMineracao") >= 1 ? 1500 : 0) + (levelOf(levels, "minaProfundaMetal") >= 1 ? 10000 : 0),
    carbonum: (levelOf(levels, "minaCristal") >= 1 ? 1500 : 0) + (levelOf(levels, "minaProfundaCristal") >= 1 ? 10000 : 0),
    plutonium: (levelOf(levels, "labEonio") >= 1 ? 1500 : 0) + (levelOf(levels, "labReforcado") >= 1 ? 10000 : 0),
  };
}
// Redução do tempo de viagem (em ticks): 1 por construção de deslocamento (até 4).
export function travelReductionTicks(levels: TechLevels): number {
  return ["geradorSubvacuo", "reguladorPortais", "estabilizadorVortex", "reatorHiperespaco"]
    .filter((k) => levelOf(levels, k) >= 1).length;
}
export function canBuildShip(levels: TechLevels, cls: ShipClass): boolean {
  return levelOf(levels, SHIP_FACTORY[cls]) >= 1;
}
// Nível de espionagem = quantas construções de inteligência (em sequência) você tem.
export function espionageLevel(levels: TechLevels): number {
  let n = 0;
  for (const k of INTEL_TIERS) {
    if (levelOf(levels, k) >= 1) n++;
    else break;
  }
  return n;
}
