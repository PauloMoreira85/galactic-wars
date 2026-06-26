import { parseUnits, stringifyUnits, type UnitMap } from "./unitmap.js";

// ===== Agentes de inteligência =====
// P/M/T/D = espionagem OFENSIVA (cada um revela um tipo de intel). CE = contra-
// espionagem (DEFESA). Pesquisa (Central de Inteligência → ...) destrava cada tipo;
// o treino dá a QUANTIDADE. Espionar gasta 1 agente do tipo (dê certo ou não).

export const AGENT_KEYS = ["CE", "P", "M", "T", "D"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export interface AgentDef {
  key: AgentKey;
  name: string;
  desc: string;
  level: number; // nível de Inteligência (espionageLevel) exigido p/ treinar
  offensive: boolean;
  m: number; c: number; p: number; // custo por agente
  ticks: number; // tempo de treino (independe da quantidade, como naves)
}

// Custos/tempo são AJUSTÁVEIS — calibrados pra que blindar um planeta com CE
// (CE ≥ roids/2) seja um investimento real, mas viável.
export const AGENTS: Record<AgentKey, AgentDef> = {
  CE: { key: "CE", name: "Contra-Espionagem", desc: "Defesa. Cada CE cobre ~2 roids; o planeta fica protegido quando CE ≥ roids ÷ 2.", level: 1, offensive: false, m: 1000, c: 1000, p: 0, ticks: 1 },
  P:  { key: "P",  name: "Agente Padrão (P)",      desc: "Revela raça, pontuação, roids e total de naves do alvo.", level: 2, offensive: true, m: 800,  c: 600,  p: 100, ticks: 1 },
  M:  { key: "M",  name: "Agente Militar (M)",     desc: "Revela QUAIS e quantas naves o alvo tem.",                 level: 3, offensive: true, m: 1200, c: 1000, p: 200, ticks: 1 },
  T:  { key: "T",  name: "Agente de Transmissão (T)", desc: "Revela as notícias recentes do alvo.",                  level: 4, offensive: true, m: 1500, c: 1200, p: 300, ticks: 2 },
  D:  { key: "D",  name: "Agente Duplo (D)",       desc: "Revela todas as frotas do alvo (composição/missão).",      level: 5, offensive: true, m: 2500, c: 2000, p: 600, ticks: 2 },
};

// Nome completo de cada agente (para notícias/relatórios).
export const AGENT_FULL_NAME: Record<string, string> = {
  P: "Agente Padrão",
  M: "Agente Militar",
  T: "Agente de Transmissão",
  D: "Agente Duplo",
  CE: "Contra-Espionagem",
};

// Quantos roids 1 agente de CE cobre. Alvo protegido se CE_efetivo × este nº ≥ roids.
export const ROIDS_POR_CE = 2;

export function isAgentKey(k: string): k is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(k);
}

export function parseAgents(json: string): UnitMap {
  return parseUnits(json);
}
export function stringifyAgents(map: UnitMap): string {
  return stringifyUnits(map);
}

// CE efetivo: Rakshasa tem contra-espionagem +30% (cada CE rende mais).
export function effectiveCE(ceCount: number, targetRace: string): number {
  const mult = targetRace === "rakshasa" ? 1.3 : 1;
  return ceCount * mult;
}

// Quantos CE o alvo precisa pra ficar 100% protegido (considerando a raça).
export function ceNeeded(targetRoids: number, targetRace: string): number {
  const mult = targetRace === "rakshasa" ? 1.3 : 1;
  return Math.ceil(targetRoids / (ROIDS_POR_CE * mult));
}

// O alvo está protegido contra espionagem? (cobertura "cheia" = CE×2 ≥ roids)
export function isShielded(targetCE: number, targetRoids: number, targetRace: string): boolean {
  return effectiveCE(targetCE, targetRace) * ROIDS_POR_CE >= targetRoids;
}

// Teto de bloqueio: a contra-espionagem NUNCA bloqueia 100% — sempre há chance
// de furar (mandando mais agentes). Mesmo totalmente coberto, ~15% passa.
export const MAX_BLOCK = 0.85;

// Chance de a espionagem/sabotagem ser BLOQUEADA. = cobertura (CE×2 / roids),
// limitada ao teto. Sem CE -> 0% (sempre passa). Coberto -> 85% (15% fura).
export function blockChance(targetCE: number, targetRoids: number, targetRace: string): number {
  const cov = (effectiveCE(targetCE, targetRace) * ROIDS_POR_CE) / Math.max(1, targetRoids);
  return Math.min(MAX_BLOCK, Math.max(0, cov));
}
