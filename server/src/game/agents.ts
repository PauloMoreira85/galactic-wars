import { parseUnits, stringifyUnits, type UnitMap } from "./unitmap.js";

// ===== Agentes de inteligência =====
// P/M/T/D = espionagem OFENSIVA (cada um revela um tipo de intel). CE = contra-
// espionagem (DEFESA). Pesquisa (Central de Inteligência → ...) destrava cada tipo;
// o treino dá a QUANTIDADE. Espionar gasta 1 agente do tipo (dê certo ou não).

export const AGENT_KEYS = ["AE", "CE", "P", "M", "T", "D"] as const;
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
  AE: { key: "AE", name: "Agente de Espionagem (AE)", desc: "OFENSIVO. Força de espionagem: aumenta a chance de furar a contra-espionagem do alvo. Não é gasto por missão — é a sua potência (igual o AC). Custa plutônio.", level: 1, offensive: true, m: 0, c: 0, p: 1000, ticks: 4 },
  CE: { key: "CE", name: "Contra-Espionagem (AC)", desc: "DEFESA. Cada AC cobre ~2 roids; protegido quando AC ≥ roids ÷ 2 (nunca 100%). Custa plutônio.", level: 1, offensive: false, m: 0, c: 0, p: 1000, ticks: 4 },
  P:  { key: "P",  name: "Agente Padrão (P)",      desc: "Revela raça, pontuação, roids e total de naves do alvo.", level: 2, offensive: true, m: 800,  c: 600,  p: 100, ticks: 4 },
  M:  { key: "M",  name: "Agente Militar (M)",     desc: "Revela QUAIS e quantas naves o alvo tem.",                 level: 3, offensive: true, m: 1200, c: 1000, p: 200, ticks: 8 },
  T:  { key: "T",  name: "Agente de Transmissão (T)", desc: "Revela as notícias recentes do alvo.",                  level: 4, offensive: true, m: 1500, c: 1200, p: 300, ticks: 12 },
  D:  { key: "D",  name: "Agente Duplo (D)",       desc: "Revela todas as frotas do alvo (composição/missão).",      level: 5, offensive: true, m: 2500, c: 2000, p: 600, ticks: 16 },
};

// Nome completo de cada agente (para notícias/relatórios).
export const AGENT_FULL_NAME: Record<string, string> = {
  AE: "Agente de Espionagem",
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

// Chance de uma espionagem/sabotagem DAR CERTO: disputa entre a força ofensiva
// do atacante (AE) e a contra-espionagem efetiva do alvo (AC), medidas em
// "densidade por roid" — a cobertura cheia é roids ÷ 2 (cada agente cobre ~2 roids).
//   off = AE / (roids/2)   ·   def = AC_efetivo / (roids/2)   ·   net = off − def
//   chance = 50% + 45% × net  (limitada a 5%–95%, nunca 0 nem 100%)
// → quanto mais roids o alvo tem, mais AE você precisa pra furar (e mais AC ele
//   precisa pra blindar). Sem ninguém investindo, ~50%.
export function spySuccessChance(attackerAE: number, targetCE: number, targetRoids: number, targetRace: string): number {
  const cover = Math.max(1, targetRoids / ROIDS_POR_CE); // roids/2 = cobertura "cheia"
  const off = Math.max(0, attackerAE) / cover;
  const def = effectiveCE(targetCE, targetRace) / cover;
  const chance = 0.5 + 0.45 * (off - def);
  return Math.max(0.05, Math.min(0.95, chance));
}
