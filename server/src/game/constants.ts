// ===== Balanceamento do jogo =====
// Mexa aqui para ajustar a economia. Tudo centralizado de proposito.

export type ResourceKey = "metalium" | "carbonum" | "plutonium";

export const RESOURCES: ResourceKey[] = ["metalium", "carbonum", "plutonium"];

// Quanto cada roid produz do seu recurso por tick (canon: 200 com moral 100).
// Quando a Moral existir, a produção efetiva será 140 + 0.6*moral.
export const ROID_PRODUCTION_PER_TICK = 450;

// Custo de PRODUZIR um novo roid. Escala com o total de roids do planeta:
//   custo = base * (growth ^ totalRoids)
// Ex.: base 100 / growth 1.12 -> 1o roid 100, 10o ~310, 20o ~965...
// Custo de INICIAR a mineração de um roid: paga SÓ no recurso do roid.
// Começa no base do recurso e sobe +250 a cada roid DESSE recurso que você já tem.
export const ROID_BASE_COST: Record<ResourceKey, number> = { metalium: 1250, carbonum: 1000, plutonium: 1000 };
export const ROID_COST_STEP = 250;

// Mercado Negro: troca um recurso por outro com taxa (você recebe 1 - taxa).
export const MARKET_FEE = 0.20; // 20%

// Recursos iniciais de um planeta novo.
export const STARTING = {
  metalium: 20000,
  carbonum: 12000,
  plutonium: 4000,
  // Roids iniciais (pra nao comecar do zero absoluto)
  roidMetalium: 3,
  roidCarbonum: 2,
  roidPlutonium: 1,
};

// Slots (planetas) por sistema/galáxia. Galáxias pequenas = melhor jogabilidade
// com poucos jogadores.
export const SLOTS_PER_SYSTEM = 5;

// Número de galáxias no universo.
export const GALAXIES = 9;

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
// já tem. Paga apenas no recurso correspondente (os outros vêm 0).
export function nextRoidCost(resource: ResourceKey, countOfResource: number) {
  const amount = ROID_BASE_COST[resource] + ROID_COST_STEP * Math.max(0, countOfResource);
  return {
    metalium: resource === "metalium" ? amount : 0,
    carbonum: resource === "carbonum" ? amount : 0,
    plutonium: resource === "plutonium" ? amount : 0,
  };
}
