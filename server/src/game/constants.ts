// ===== Balanceamento do jogo =====
// Mexa aqui para ajustar a economia. Tudo centralizado de proposito.

export type ResourceKey = "metalium" | "carbonum" | "plutonium";

export const RESOURCES: ResourceKey[] = ["metalium", "carbonum", "plutonium"];

// Quanto cada roid produz do seu recurso por tick.
export const ROID_PRODUCTION_PER_TICK = 250;

// Custo de INICIAR um roid (canon original): pago SEMPRE em METALIUM (não importa
// o recurso do roid), proporcional a quantos roids DAQUELE recurso você já tem.
// custo (metalium) = ROID_COST_PER × (roids daquele recurso + 1).
export const ROID_COST_PER = 1000;

// Mercado Negro: troca um recurso por outro com taxa FIXA (você recebe 1 - taxa).
export const MARKET_FEE = 0.25; // 25%

// Limite de estoque por recurso: 30 milhões. O que passar disso é perdido.
export const RESOURCE_CAP = 30_000_000;

// Recursos iniciais de um planeta novo.
export const STARTING = {
  metalium: 10000,
  carbonum: 10000,
  plutonium: 10000,
  // Roids iniciais (pra nao comecar do zero absoluto)
  roidMetalium: 3,
  roidCarbonum: 2,
  roidPlutonium: 1,
};

// Slots (planetas) por galáxia (= por par setor:sistema). Galáxias pequenas =
// melhor competitividade. Configurável por env (RUR usa 3).
export const SLOTS_PER_SYSTEM = Number(process.env.SLOTS_PER_SYSTEM ?? 5);

// Número de galáxias PÚBLICAS no universo = setores (5) × sistemas (6) = 30.
// Cada galáxia é o par (setor, sistema); os ids 1..30 vêm de galaxyId().
export const GALAXIES = 30;

// Auto-exílios por planeta.
export const MAX_AUTO_EXILES = 3;

// Proteção de novato: o planeta não pode ser atacado nos primeiros N ticks.
// Vale também no início do jogo: ninguém ataca enquanto tick < N.
export const NEWBIE_PROTECTION_TICKS = 72;

// Range de ataque: o alvo precisa ter pelo menos esta % da SUA pontuação
// (impede farmar planetas muito menores). Sem teto: pode atacar maiores.
export const ATTACK_RANGE_MIN_PCT = 50;

// Vagas de frota: compra permanente, custo ×5 a cada vaga (metalium = carbonum).
// 1a 5k, 2a 25k, 3a 125k, 4a 625k, 5a 3.125k. Maximo de 5 vagas.
export const MAX_FLEET_SLOTS = 5;
export const FLEET_SLOT_BASE = 5000;

// Custo da PROXIMA vaga de frota dado quantas o planeta ja tem (0..4).
// Retorna null se ja estiver no maximo.
export function nextFleetSlotCost(currentSlots: number) {
  if (currentSlots >= MAX_FLEET_SLOTS) return null;
  const amount = FLEET_SLOT_BASE * Math.pow(5, currentSlots);
  return { metalium: amount, carbonum: amount, plutonium: 0 };
}

// Custo do PRÓXIMO roid de `resource`, dado quantos roids DESSE recurso o planeta
// já tem. Pago SEMPRE em METALIUM (canon original), escalando com a quantidade.
export function nextRoidCost(_resource: ResourceKey, countOfResource: number) {
  return {
    metalium: ROID_COST_PER * (Math.max(0, countOfResource) + 1),
    carbonum: 0,
    plutonium: 0,
  };
}
