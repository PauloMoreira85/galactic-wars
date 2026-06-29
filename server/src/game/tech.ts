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

// Lista ORDENADA de itens (pesquisa/construção). Regras de dependência (2 trilhas):
//  - pesquisa exige só a PESQUISA anterior (flui sozinha).
//  - construção exige a pesquisa imediatamente ANTES dela. Se NÃO houver pesquisa
//    antes (categoria que começa construindo, ex.: Mineração), a 1ª construção é LIVRE.
// Ticks/custos pelo "tier" da construção: a pesquisa que libera a construção N usa
// os mesmos ticks/custo da construção N (assim Naves e Mineração casam por tier:
// pesquisa de Caça = 1ª construção de Mineração = 8 ticks).
interface TItem { key: string; name: string; kind: TechKind; desc: string }
function track(category: TechCategory, items: TItem[]): TechDef[] {
  let lastResearch: string | null = null;
  let buildTier = 0;
  return items.map((it) => {
    const requires: Req[] = lastResearch ? [{ key: lastResearch, level: 1 }] : [];
    const tier = Math.min(buildTier, STEP_TICKS.length - 1);
    if (it.kind === "research") lastResearch = it.key; else buildTier++;
    const cost = it.kind === "research" ? STEP_RESEARCH_COST[tier] : STEP_BUILD_COST[tier];
    return {
      key: it.key, name: it.name, category, kind: it.kind, max: 1, desc: it.desc,
      requires, baseCost: { metalium: cost, carbonum: cost, plutonium: 0 },
      costGrowth: 1, baseTicks: STEP_TICKS[tier],
    };
  });
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

// ===== Mineração — COMEÇA CONSTRUINDO (Centro de Mineração é livre, sem pesquisa) =====
const MINERACAO = track("mineracao", [
  { key: "centroMineracao", name: "Centro de Mineração", kind: "building", desc: "+1500 de produção de Metalium por tick." },
  { key: "extracaoCristal", name: "Extração de Carbonum", kind: "research", desc: "Libera a Mina de Carbonum." },
  { key: "minaCristal", name: "Mina de Carbonum", kind: "building", desc: "+1500 de produção de Carbonum por tick." },
  { key: "fusaoEonio", name: "Fusão de Plutonium", kind: "research", desc: "Libera o Laboratório de Plutonium." },
  { key: "labEonio", name: "Laboratório de Plutonium", kind: "building", desc: "+1500 de produção de Plutonium por tick." },
  { key: "recursosProfundidade", name: "Recursos em Profundidade", kind: "research", desc: "Libera a Mina Profunda de Metalium." },
  { key: "minaProfundaMetal", name: "Mina Profunda de Metalium", kind: "building", desc: "+10000 de produção de Metalium por tick." },
  { key: "armasPlasma", name: "Sondas de Carbonum Profundo", kind: "research", desc: "Libera a Mina Profunda de Carbonum." },
  { key: "minaProfundaCristal", name: "Mina Profunda de Carbonum", kind: "building", desc: "+10000 de produção de Carbonum por tick." },
  { key: "materiaisReforcados", name: "Materiais Reforçados", kind: "research", desc: "Libera o Laboratório Reforçado." },
  { key: "labReforcado", name: "Laboratório Reforçado", kind: "building", desc: "+10000 de produção de Plutonium por tick." },
]);

// ===== Deslocamento — COMEÇA NA PESQUISA =====
const DESLOCAMENTO = track("tec", [
  { key: "mecanicaQuantica", name: "Mecânica Quântica", kind: "research", desc: "Libera o Gerador de Subvácuo." },
  { key: "geradorSubvacuo", name: "Gerador de Subvácuo", kind: "building", desc: "−1 tick no tempo de viagem das suas frotas." },
  { key: "geracaoPortais", name: "Geração de Portais", kind: "research", desc: "Libera o Regulador de Portais." },
  { key: "reguladorPortais", name: "Regulador de Portais", kind: "building", desc: "−1 tick adicional no tempo de viagem (total −2)." },
  { key: "dobrasEspaciais", name: "Dobras Espaciais", kind: "research", desc: "Libera o Estabilizador de Vórtex." },
  { key: "estabilizadorVortex", name: "Estabilizador de Vórtex", kind: "building", desc: "−1 tick adicional (total −3)." },
  { key: "hiperespaco", name: "Hiperespaço", kind: "research", desc: "Libera o Reator de Hiperespaço." },
  { key: "reatorHiperespaco", name: "Reator de Hiperespaço", kind: "building", desc: "−1 tick adicional (total −4)." },
]);

// ===== Naves — COMEÇA NA PESQUISA (caça exige "Tecnologia de Caças" antes) =====
const NAVES = track("naves", [
  { key: "tecnologiaCacas", name: "Tecnologia de Caças", kind: "research", desc: "Libera a Fundição de Caças." },
  { key: "fundicaoCacas", name: "Fundição de Caças", kind: "building", desc: "Permite produzir Caças." },
  { key: "lancadoresTorpedos", name: "Lançadores de Torpedos", kind: "research", desc: "Libera a Produção de Corvetas." },
  { key: "producaoCorvetas", name: "Produção de Corvetas", kind: "building", desc: "Permite produzir Corvetas." },
  { key: "disparosRapidos", name: "Disparos Rápidos", kind: "research", desc: "Libera a Montagem de Fragatas." },
  { key: "montagemFragatas", name: "Montagem de Fragatas", kind: "building", desc: "Permite produzir Fragatas." },
  { key: "resistenciaTorpedos", name: "Resistência a Torpedos", kind: "research", desc: "Libera a Fábrica de Destróiers." },
  { key: "fabricaDestroyers", name: "Fábrica de Destróiers", kind: "building", desc: "Permite produzir Destróiers." },
  { key: "fuselagensAltaResist", name: "Fuselagens de Alta Resistência", kind: "research", desc: "Libera a Indústria de Cruzadores." },
  { key: "industriaCruzadores", name: "Indústria de Cruzadores", kind: "building", desc: "Permite produzir Cruzadores." },
  { key: "armamentoPesado", name: "Armamento Pesado", kind: "research", desc: "Libera os Estaleiros Orbitais." },
  { key: "estaleirosOrbitais", name: "Estaleiros Orbitais", kind: "building", desc: "Permite produzir Naves-Mãe." },
]);

// ===== Inteligência — COMEÇA CONSTRUINDO (Central é livre, sem pesquisa) =====
// Os prédios definem o nível de espionagem (INTEL_TIERS). Igual à Mineração:
// 1ª construção livre, as próximas exigem a pesquisa que as libera.
const INTELIGENCIA = track("espionagem", [
  { key: "centralInteligencia", name: "Central de Inteligência", kind: "building", desc: "Produz Coordenadores de Operações e Agentes de Contra-Espionagem. Permite espionar (revela a raça do alvo)." },
  { key: "pesqServicoSecreto", name: "Pesquisa: Serviço Secreto", kind: "research", desc: "Libera a Formação de Serviço Secreto." },
  { key: "servicoSecreto", name: "Formação de Serviço Secreto", kind: "building", desc: "Agentes Padrão: revelam raça, pontuação, recursos em estoque, roids e qtd de naves + status online." },
  { key: "pesqAgentesMilitares", name: "Pesquisa: Agentes Militares", kind: "research", desc: "Libera os Agentes Militares." },
  { key: "agentesMilitares", name: "Agentes Militares", kind: "building", desc: "Revelam QUAIS e quantas naves o alvo tem (em Rakshasa, só as roiders aparecem)." },
  { key: "pesqTransmissao", name: "Pesquisa: Transmissão", kind: "research", desc: "Libera a Equipe de Transmissão." },
  { key: "transmissao", name: "Equipe de Transmissão", kind: "building", desc: "Agentes de Transmissão: notícias do alvo e tráfego (ataques/defesas chegando)." },
  { key: "pesqAgentesDuplos", name: "Pesquisa: Agentes Duplos", kind: "research", desc: "Libera os Agentes Duplos." },
  { key: "agentesDuplos", name: "Agentes Duplos", kind: "building", desc: "Revelam todas as frotas do alvo (quais/quantas naves, missão, ticks p/ chegar). Enxergam até os Rakshasa." },
]);

export const TECHS: TechDef[] = [
  ...MINERACAO,
  ...DESLOCAMENTO,
  ...INTELIGENCIA,
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
