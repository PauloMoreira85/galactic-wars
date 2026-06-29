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

// Árvore CANÔNICA (recuperada do site original, snapshot 2007). Cadeia
// ESTRITAMENTE SEQUENCIAL por categoria: cada item exige o item IMEDIATAMENTE
// ANTERIOR (construção ↔ pesquisa, alternando). O 1º item é LIVRE — e define se a
// categoria "começa construindo" (Mineração, Naves) ou "começa pesquisando"
// (Deslocamento, Inteligência, Sabotagem). Assim não dá pra pular a fábrica de
// caça pesquisando à frente: você constrói a fábrica → pesquisa → constrói a
// próxima → e assim por diante. Custo (M = C) e ticks explícitos por item;
// plutonium é só combustível (upgradeCost zera o plutonium das techs).
interface TItem { key: string; name: string; kind: TechKind; desc: string; cost: number; ticks: number }
function track(category: TechCategory, items: TItem[]): TechDef[] {
  return items.map((it, i) => ({
    key: it.key, name: it.name, category, kind: it.kind, max: 1, desc: it.desc,
    requires: i > 0 ? [{ key: items[i - 1].key, level: 1 }] : [],
    baseCost: { metalium: it.cost, carbonum: it.cost, plutonium: 0 },
    costGrowth: 1, baseTicks: it.ticks,
  }));
}

// Tiers sequenciais de Inteligencia (definem o nível de espionagem).
export const INTEL_TIERS = ["centralInteligencia", "servicoSecreto", "agentesMilitares", "transmissao", "agentesDuplos"];

// ===== Mineração — COMEÇA CONSTRUINDO (Fundição de Metalium é livre) =====
const MINERACAO = track("mineracao", [
  { key: "centroMineracao", name: "Fundição de Metalium", kind: "building", desc: "Extração e fundição de Metalium (+3.000 por tick).", cost: 2500, ticks: 12 },
  { key: "extracaoCristal", name: "Desenvolvimento de Carbonum", kind: "research", desc: "Estudo para extração de Carbonum da natureza.", cost: 7500, ticks: 12 },
  { key: "minaCristal", name: "Extração de Carbonum", kind: "building", desc: "Estruturas de extração de Carbonum (+3.000 por tick).", cost: 12500, ticks: 12 },
  { key: "fusaoEonio", name: "Estudo da Tecnologia Nuclear Taakh", kind: "research", desc: "Fissão nuclear Taakh, liberando resíduos de Plutônium.", cost: 20000, ticks: 24 },
  { key: "labEonio", name: "Reator de geração rápida", kind: "building", desc: "Produção de Plutônium por fissões nucleares (+3.000 por tick).", cost: 30000, ticks: 24 },
  { key: "recursosProfundidade", name: "Ruptura nuclear de baixo custo", kind: "research", desc: "Transmutação de metais comuns em Metalium.", cost: 45000, ticks: 36 },
  { key: "minaProfundaMetal", name: "Mini aceleradores de transmutação", kind: "building", desc: "Produção de Metalium em laboratórios (+25.000 por tick).", cost: 80000, ticks: 36 },
  { key: "armasPlasma", name: "Extrativismo de alto rendimento", kind: "research", desc: "Extração de grandes volumes de Carbonum.", cost: 135000, ticks: 48 },
  { key: "minaProfundaCristal", name: "Extração avançada", kind: "building", desc: "Extração de grandes quantidades de Carbonum (+25.000 por tick).", cost: 135000, ticks: 48 },
  { key: "materiaisReforcados", name: "Reatores auto-sustentáveis", kind: "research", desc: "Reatores alimentados por Plutônium com alto índice de resíduos.", cost: 150000, ticks: 60 },
  { key: "labReforcado", name: "Reator residual de Plutônium", kind: "building", desc: "Reatores auto-sustentáveis de Plutônium (+25.000 por tick).", cost: 250000, ticks: 60 },
]);

// ===== Deslocamento — COMEÇA NA PESQUISA =====
const DESLOCAMENTO = track("tec", [
  { key: "mecanicaQuantica", name: "Propulsores de alta velocidade", kind: "research", desc: "Melhoria no sistema de propulsão padrão.", cost: 2500, ticks: 12 },
  { key: "geradorSubvacuo", name: "Viagem de alta velocidade", kind: "building", desc: "Propulsores mais poderosos (−1 tick de viagem).", cost: 10000, ticks: 12 },
  { key: "geracaoPortais", name: "Queima de anti-plutônium", kind: "research", desc: "Amplia a capacidade dos propulsores neutralizando plutônium.", cost: 15000, ticks: 12 },
  { key: "reguladorPortais", name: "Propulsores de Anti-matéria", kind: "building", desc: "Queima matéria/anti-matéria (−2 ticks de viagem, total).", cost: 30000, ticks: 24 },
  { key: "dobrasEspaciais", name: "Hiper computadores", kind: "research", desc: "Calcula rotas para Saltos espaciais seguros.", cost: 50000, ticks: 36 },
  { key: "estabilizadorVortex", name: "Saltos espaciais", kind: "building", desc: "Dobras espaciais (−3 ticks de viagem, total).", cost: 75000, ticks: 48 },
  { key: "hiperespaco", name: "Estudo de buracos de minhoca", kind: "research", desc: "Controle de buracos de minhoca artificiais.", cost: 150000, ticks: 60 },
  { key: "reatorHiperespaco", name: "Travessia de buracos", kind: "building", desc: "Buracos de minhoca em frotas (−4 ticks de viagem, total).", cost: 250000, ticks: 60 },
]);

// ===== Inteligência — COMEÇA NA PESQUISA (Escola de Espionagem) =====
// Os prédios (Central, Serviço Secreto, Agentes Militares, Transmissão, Duplos)
// definem o nível de espionagem (INTEL_TIERS).
const INTELIGENCIA = track("espionagem", [
  { key: "pesqEscolaEspionagem", name: "Escola de Espionagem", kind: "research", desc: "Treinamento básico de agentes.", cost: 2500, ticks: 12 },
  { key: "centralInteligencia", name: "Central de Inteligência", kind: "building", desc: "Treina Coordenadores de Operações e Contra-Espionagem. Permite espionar (revela a raça do alvo).", cost: 10000, ticks: 12 },
  { key: "pesqTreinamentoPadrao", name: "Treinamento padrão", kind: "research", desc: "Treina agentes para infiltração em planetas inimigos.", cost: 15000, ticks: 24 },
  { key: "servicoSecreto", name: "Formação do Serviço Secreto", kind: "building", desc: "Agentes Padrão: raça, pontuação, recursos, roids e qtd de naves + status online.", cost: 20000, ticks: 36 },
  { key: "pesqEspecialistas", name: "Treinamento de especialistas", kind: "research", desc: "Escola de agentes especializados em capacidade militar.", cost: 35000, ticks: 48 },
  { key: "agentesMilitares", name: "Agentes Militares", kind: "building", desc: "Revelam QUAIS e quantas naves o alvo tem (Rakshasa: só roiders).", cost: 50000, ticks: 60 },
  { key: "pesqCaptacao", name: "Investimento em Captação", kind: "research", desc: "Interceptação de frequências de notícias militares.", cost: 75000, ticks: 72 },
  { key: "transmissao", name: "Equipe de Transmissão", kind: "building", desc: "Notícias do alvo e tráfego (ataques/defesas chegando).", cost: 100000, ticks: 72 },
  { key: "pesqInfiltracao", name: "Táticas de Infiltração", kind: "research", desc: "Engenharia social para infiltrar agentes em cargos de confiança.", cost: 150000, ticks: 96 },
  { key: "agentesDuplos", name: "Agentes Duplos", kind: "building", desc: "Revelam todas as frotas do alvo (composição/missão). Enxergam até Rakshasa.", cost: 250000, ticks: 96 },
]);

// ===== Sabotagem — COMEÇA NA PESQUISA =====
const SABOTAGEM = track("sabotagem", [
  { key: "pesqTaticasSabotagem", name: "Táticas de Sabotagem", kind: "research", desc: "Táticas básicas para sabotagens em planetas inimigos.", cost: 2500, ticks: 12 },
  { key: "sabSistemasMineracao", name: "Sistemas de Mineração", kind: "building", desc: "Explosão de Mina: zera a produção de roids do alvo por 1 tick.", cost: 7500, ticks: 12 },
  { key: "pesqEstudoProducao", name: "Estudo de produção", kind: "research", desc: "Métodos para interferir na produção de naves.", cost: 10000, ticks: 12 },
  { key: "sabEquipeProducao", name: "Equipe de Produção", kind: "building", desc: "Blackout Industrial: atrasa a produção de naves do alvo.", cost: 15000, ticks: 12 },
  { key: "pesqPistasFalsas", name: "Táticas de pistas falsas", kind: "research", desc: "Métodos para atrapalhar espionagem e contra-espionagem.", cost: 20000, ticks: 12 },
  { key: "sabInfiltracao", name: "Infiltração na Inteligência", kind: "building", desc: "Roubo de Recursos: rouba e destrói parte dos recursos do alvo.", cost: 30000, ticks: 24 },
  { key: "pesqNovasMineracao", name: "Novas táticas de mineração", kind: "research", desc: "Métodos mais eficazes para prejudicar a mineração.", cost: 40000, ticks: 24 },
  { key: "sabEquipeMineracao", name: "Equipe de Mineração", kind: "building", desc: "Vazamento Radioativo: −75% de produção por 4 ticks.", cost: 60000, ticks: 24 },
  { key: "pesqNovasProducao", name: "Novas táticas de Produção", kind: "research", desc: "Métodos mais eficazes para prejudicar a produção.", cost: 100000, ticks: 24 },
  { key: "sabProducaoAvancada", name: "Equipe Avançada de Produção", kind: "building", desc: "Vírus Industrial e Forjar Ordem (faz as frotas do alvo recuarem).", cost: 125000, ticks: 36 },
  { key: "pesqRouboTec", name: "Roubo tecnológico", kind: "research", desc: "Infiltra um cientista nos laboratórios do alvo.", cost: 150000, ticks: 36 },
  { key: "sabAssimiladora", name: "Equipe Assimiladora", kind: "building", desc: "Roubo de Tecnologia: rouba uma tecnologia do alvo.", cost: 250000, ticks: 48 },
  { key: "pesqGuerraPsicologica", name: "Guerra Psicológica", kind: "research", desc: "Técnicas para minar a moral de uma população inimiga.", cost: 180000, ticks: 48 },
  { key: "sabRedeBoatos", name: "Rede de Boatos", kind: "building", desc: "Boatos: espalha rumores e derruba a moral do alvo (−15).", cost: 300000, ticks: 48 },
  { key: "pesqAgitacao", name: "Agitação Social", kind: "research", desc: "Métodos para fomentar conflitos internos no alvo.", cost: 240000, ticks: 48 },
  { key: "sabIntrigas", name: "Célula de Intrigas", kind: "building", desc: "Intrigas Internas: instala conflito interno e derruba a moral do alvo (−30).", cost: 380000, ticks: 60 },
  { key: "pesqRedeSuborno", name: "Rede de Suborno", kind: "research", desc: "Contatos para comprar a lealdade de agentes inimigos.", cost: 320000, ticks: 60 },
  { key: "sabSuborno", name: "Equipe de Suborno", kind: "building", desc: "Suborno de Agentes: suborna metade da contra-espionagem (AC) do alvo.", cost: 480000, ticks: 60 },
  { key: "pesqBloqueioOrbital", name: "Bloqueio Orbital", kind: "research", desc: "Táticas para cercar e isolar um planeta inimigo.", cost: 420000, ticks: 72 },
  { key: "sabIsolamento", name: "Equipe de Bloqueio", kind: "building", desc: "Isolamento Militar: impede o alvo de enviar frotas por 8 ticks.", cost: 600000, ticks: 72 },
]);

// ===== Naves — COMEÇA CONSTRUINDO (Indústrias de Naves / caças é livre) =====
const NAVES = track("naves", [
  { key: "fundicaoCacas", name: "Indústrias de Naves", kind: "building", desc: "Cria indústrias que constroem naves. Permite produzir Caças.", cost: 2500, ticks: 12 },
  { key: "pesqMultiplosPropulsores", name: "Sistema de Múltiplos Propulsores", kind: "research", desc: "Permite que naves maiores naveguem pelo espaço.", cost: 7500, ticks: 12 },
  { key: "producaoCorvetas", name: "Fabricação de Corvetas", kind: "building", desc: "Permite produzir Corvetas.", cost: 10000, ticks: 24 },
  { key: "pesqFuselagem", name: "Ampliação de Fuselagem", kind: "research", desc: "Novas ligas: naves maiores e mais resistentes.", cost: 15000, ticks: 24 },
  { key: "montagemFragatas", name: "Fabricação de Fragatas", kind: "building", desc: "Permite produzir Fragatas.", cost: 25000, ticks: 36 },
  { key: "pesqMultiploArmas", name: "Sistema múltiplo de armas", kind: "research", desc: "Alocação e controle de várias armas em uma única nave.", cost: 45000, ticks: 36 },
  { key: "fabricaDestroyers", name: "Fabricação de Destroyers", kind: "building", desc: "Permite produzir Destroyers.", cost: 80000, ticks: 36 },
  { key: "pesqAltoImpacto", name: "Armas de alto impacto", kind: "research", desc: "Armas de alto impacto para naves maiores.", cost: 135000, ticks: 48 },
  { key: "industriaCruzadores", name: "Fabricação de Cruzadores", kind: "building", desc: "Permite produzir Cruzadores.", cost: 135000, ticks: 48 },
  { key: "pesqCidadesEspaciais", name: "Cidades espaciais", kind: "research", desc: "Naves gigantescas com numerosos sistemas de defesa.", cost: 150000, ticks: 60 },
  { key: "estaleirosOrbitais", name: "Fabricação de Naves Mãe", kind: "building", desc: "Permite produzir Naves-Mãe.", cost: 250000, ticks: 60 },
]);

export const TECHS: TechDef[] = [
  ...MINERACAO,
  ...DESLOCAMENTO,
  ...INTELIGENCIA,
  ...SABOTAGEM,
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
    metalium: (levelOf(levels, "centroMineracao") >= 1 ? 3000 : 0) + (levelOf(levels, "minaProfundaMetal") >= 1 ? 25000 : 0),
    carbonum: (levelOf(levels, "minaCristal") >= 1 ? 3000 : 0) + (levelOf(levels, "minaProfundaCristal") >= 1 ? 25000 : 0),
    plutonium: (levelOf(levels, "labEonio") >= 1 ? 3000 : 0) + (levelOf(levels, "labReforcado") >= 1 ? 25000 : 0),
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
