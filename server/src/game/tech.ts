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

// Duas TRILHAS PARALELAS por categoria, rodando ao mesmo tempo (2 slots: 1
// pesquisa + 1 construção):
//  - Pesquisa flui sozinha: cada pesquisa exige só a pesquisa ANTERIOR.
//  - Cada construção exige a SUA pesquisa (pesquisa → constrói; sem build grátis).
//  - Pesquisa e construção do MESMO passo têm os MESMOS ticks → terminam juntas
//    (você pesquisa o passo seguinte enquanto constrói o atual). Sem slot ocioso.
// Mineração e Naves usam o MESMO cronograma (casam passo a passo). Custo só em
// M/C (plutonium é exclusivo p/ combustível — upgradeCost zera o plutonium).
const STEP_TICKS = [8, 14, 22, 35, 50, 50];
const STEP_RESEARCH_COST = [2500, 5000, 10000, 20000, 40000, 80000];
const STEP_BUILD_COST = [3000, 6500, 13000, 26000, 52000, 100000];

interface Step { r: string; rName: string; rDesc: string; b: string; bName: string; bDesc: string }
function track(category: TechCategory, steps: Step[]): TechDef[] {
  const out: TechDef[] = [];
  steps.forEach((s, i) => {
    out.push({
      key: s.r, name: s.rName, category, kind: "research", max: 1, desc: s.rDesc,
      requires: i > 0 ? [{ key: steps[i - 1].r, level: 1 }] : [],
      baseCost: { metalium: STEP_RESEARCH_COST[i], carbonum: STEP_RESEARCH_COST[i], plutonium: 0 },
      costGrowth: 1, baseTicks: STEP_TICKS[i],
    });
    out.push({
      key: s.b, name: s.bName, category, kind: "building", max: 1, desc: s.bDesc,
      requires: [{ key: s.r, level: 1 }],
      baseCost: { metalium: STEP_BUILD_COST[i], carbonum: STEP_BUILD_COST[i], plutonium: 0 },
      costGrowth: 1, baseTicks: STEP_TICKS[i],
    });
  });
  return out;
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
    // Trilha paralela: a pesquisa exige só a PESQUISA anterior (flui sozinha);
    // a construção exige a sua própria pesquisa (logo abaixo).
    const prevResearch = i > 0 ? "pesq_" + items[i - 1].key : null;
    const pesqKey = "pesq_" + it.key;
    const sc = (b: { metalium: number; carbonum: number; plutonium: number }) => ({
      metalium: Math.round(b.metalium * scale), carbonum: Math.round(b.carbonum * scale), plutonium: Math.round(b.plutonium * scale),
    });
    out.push({
      key: pesqKey, name: `Pesquisa: ${it.name}`, category, kind: "research", max: 1,
      desc: `Desbloqueia a construção de ${it.name}.`,
      requires: prevResearch ? [{ key: prevResearch, level: 1 }] : [],
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
// COMEÇA com construção pronta: a 1ª pesquisa (prospeccaoBasica) já vem liberada
// de fábrica (ver tech inicial), então o Centro de Mineração é construível no t=0.
const MINERACAO = track("mineracao", [
  { r: "prospeccaoBasica", rName: "Prospecção Básica", rDesc: "Libera o Centro de Mineração.", b: "centroMineracao", bName: "Centro de Mineração", bDesc: "+1500 de produção de Metalium por tick." },
  { r: "extracaoCristal", rName: "Extração de Carbonum", rDesc: "Libera a Mina de Carbonum.", b: "minaCristal", bName: "Mina de Carbonum", bDesc: "+1500 de produção de Carbonum por tick." },
  { r: "fusaoEonio", rName: "Fusão de Plutonium", rDesc: "Libera o Laboratório de Plutonium.", b: "labEonio", bName: "Laboratório de Plutonium", bDesc: "+1500 de produção de Plutonium por tick." },
  { r: "recursosProfundidade", rName: "Recursos em Profundidade", rDesc: "Libera a Mina Profunda de Metalium.", b: "minaProfundaMetal", bName: "Mina Profunda de Metalium", bDesc: "+10000 de produção de Metalium por tick." },
  { r: "armasPlasma", rName: "Sondas de Carbonum Profundo", rDesc: "Libera a Mina Profunda de Carbonum.", b: "minaProfundaCristal", bName: "Mina Profunda de Carbonum", bDesc: "+10000 de produção de Carbonum por tick." },
  { r: "materiaisReforcados", rName: "Materiais Reforçados", rDesc: "Libera o Laboratório Reforçado.", b: "labReforcado", bName: "Laboratório Reforçado", bDesc: "+10000 de produção de Plutonium por tick." },
]);

// ===== Deslocamento (cada construção reduz 1 tick do tempo de viagem) =====
// COMEÇA na pesquisa (Mecânica Quântica) — só constrói depois de pesquisar.
const DESLOCAMENTO = track("tec", [
  { r: "mecanicaQuantica", rName: "Mecânica Quântica", rDesc: "Libera o Gerador de Subvácuo.", b: "geradorSubvacuo", bName: "Gerador de Subvácuo", bDesc: "−1 tick no tempo de viagem das suas frotas." },
  { r: "geracaoPortais", rName: "Geração de Portais", rDesc: "Libera o Regulador de Portais.", b: "reguladorPortais", bName: "Regulador de Portais", bDesc: "−1 tick adicional no tempo de viagem (total −2)." },
  { r: "dobrasEspaciais", rName: "Dobras Espaciais", rDesc: "Libera o Estabilizador de Vórtex.", b: "estabilizadorVortex", bName: "Estabilizador de Vórtex", bDesc: "−1 tick adicional (total −3)." },
  { r: "hiperespaco", rName: "Hiperespaço", rDesc: "Libera o Reator de Hiperespaço.", b: "reatorHiperespaco", bName: "Reator de Hiperespaço", bDesc: "−1 tick adicional (total −4)." },
]);

// ===== Naves (construir a fábrica habilita a classe) =====
// COMEÇA na pesquisa: caças exigem "Tecnologia de Caças" ANTES de construir a fundição.
const NAVES = track("naves", [
  { r: "tecnologiaCacas", rName: "Tecnologia de Caças", rDesc: "Libera a Fundição de Caças.", b: "fundicaoCacas", bName: "Fundição de Caças", bDesc: "Permite produzir Caças." },
  { r: "lancadoresTorpedos", rName: "Lançadores de Torpedos", rDesc: "Libera a Produção de Corvetas.", b: "producaoCorvetas", bName: "Produção de Corvetas", bDesc: "Permite produzir Corvetas." },
  { r: "disparosRapidos", rName: "Disparos Rápidos", rDesc: "Libera a Montagem de Fragatas.", b: "montagemFragatas", bName: "Montagem de Fragatas", bDesc: "Permite produzir Fragatas." },
  { r: "resistenciaTorpedos", rName: "Resistência a Torpedos", rDesc: "Libera a Fábrica de Destróiers.", b: "fabricaDestroyers", bName: "Fábrica de Destróiers", bDesc: "Permite produzir Destróiers." },
  { r: "fuselagensAltaResist", rName: "Fuselagens de Alta Resistência", rDesc: "Libera a Indústria de Cruzadores.", b: "industriaCruzadores", bName: "Indústria de Cruzadores", bDesc: "Permite produzir Cruzadores." },
  { r: "armamentoPesado", rName: "Armamento Pesado", rDesc: "Libera os Estaleiros Orbitais.", b: "estaleirosOrbitais", bName: "Estaleiros Orbitais", bDesc: "Permite produzir Naves-Mãe." },
]);

export const TECHS: TechDef[] = [
  ...MINERACAO,
  ...DESLOCAMENTO,
  // --- Inteligencia ---
  ...pesqConstrChain("espionagem",
    { metalium: 2500, carbonum: 2000, plutonium: 0 },
    { metalium: 2500, carbonum: 1700, plutonium: 0 },
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
    { metalium: 3500, carbonum: 2500, plutonium: 0 },
    { metalium: 4000, carbonum: 3000, plutonium: 0 },
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
    plutonium: 0, // plutonium é exclusivo para combustível
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
