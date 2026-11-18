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

// Chance de uma espionagem/sabotagem DAR CERTO (Fase 1 do rebalanceamento da
// inteligência — proposta do bgnweb no fórum). Disputa a força ofensiva do
// atacante (AE) contra a contra-espionagem EFETIVA do alvo (AC), ambas ajustadas
// pela quantidade de roids do alvo (quanto mais roids, mais CE o alvo precisa).
//
// Fórmula CÚBICA — a superioridade numérica pesa muito:
//   espionagem: chance = AE³ / (AE³ + CE_ef³)
//   sabotagem : chance = AE³ / (AE³ + 2 × CE_ef³)   (defesa pesa o dobro)
// onde CE_ef = contra-espionagem efetiva "escalada pelos roids" (≈ roids/2 pra
// cobertura cheia, + bônus de raça). Regras importantes:
//   • SEM AE (atacante com 0 agentes) → chance 0 (não dá pra operar no vácuo).
//   • SEM piso de 5%: defesa muito superior derruba a chance pra <1%.
//   • Com 10× mais CE que AE, o defensor barra ~99,9% das espionagens.
export function spySuccessChance(attackerAE: number, targetCE: number, targetRoids: number, targetRace: string, isSabotage = false): number {
  const ae = Math.max(0, attackerAE);
  if (ae <= 0) return 0; // sem agente de espionagem, não há operação
  // CE efetivo escalado pelos roids do alvo: a defesa "cheia" cobre roids/2.
  // Somamos a cobertura-base de roids pra que um alvo cheio de roids e sem CE
  // ainda ofereça alguma resistência proporcional ao tamanho (não é 100% fácil).
  const ceRaw = effectiveCE(targetCE, targetRace);
  const ceScaled = ceRaw + Math.max(0, targetRoids) / (ROIDS_POR_CE * 4); // roids dão defesa passiva leve
  const a3 = ae ** 3;
  const c3 = ceScaled ** 3;
  const weight = isSabotage ? 2 : 1; // sabotagem: CE pesa o dobro
  const chance = a3 / (a3 + weight * c3);
  // Teto 95% (nunca certeza absoluta); piso 0 (defesa pode blindar quase tudo).
  return Math.max(0, Math.min(0.95, chance));
}
