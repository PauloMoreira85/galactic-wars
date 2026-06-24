// ===== Racas jogaveis =====
// Cada raca tem um conjunto de "traits" (modificadores e flags) que as fases
// de frota (3) e combate (5) consomem. A escolha e feita no registro e e
// permanente. Descricoes baseadas no lore original do Galactic Wars.

export type RaceKey = "humanos" | "daharan" | "rakshasa" | "mech" | "insecta";

export interface RaceTraits {
  // Multiplicador no casco/resistencia das naves (combate). 1 = neutro.
  hullModifier: number;
  // Multiplicador no custo de construir naves. <1 = mais barato.
  shipCostModifier: number;
  // Atira primeiro na rodada de combate.
  firstStrike: boolean;
  // "destroy" = tiro destroi a nave; "disable" = paralisa (PEM) sem destruir.
  weaponMode: "destroy" | "disable";
  // Naves invisiveis no radar inimigo (exceto frotas que roubam roids).
  stealth: boolean;
  // Ao acertar uma nave inimiga, ha chance de clonar a propria nave.
  cloneOnHit: boolean;
  // Pode construir naves de todas as racas.
  canBuildAllRaces: boolean;
}

export interface RaceDef {
  key: RaceKey;
  name: string;
  tagline: string;
  lore: string;
  strengths: string[];
  weaknesses: string[];
  traits: RaceTraits;
}

const NEUTRAL: RaceTraits = {
  hullModifier: 1,
  shipCostModifier: 1,
  firstStrike: false,
  weaponMode: "destroy",
  stealth: false,
  cloneOnHit: false,
  canBuildAllRaces: false,
};

export const RACES: Record<RaceKey, RaceDef> = {
  humanos: {
    key: "humanos",
    name: "Humanos",
    tagline: "Naves resistentes",
    lore: "Engenharia robusta e blindagem pesada. As naves humanas aguentam muito mais castigo antes de cair — confiaveis na linha de frente. A raça mais equilibrada do universo, perfeita para quem está começando.",
    strengths: ["Naves resistentes e equilibradas", "Boas no ataque E na defesa", "Ideal para iniciantes"],
    weaknesses: ["Não se destaca em nenhuma frente extrema", "Sem 'truque' especial como as outras raças"],
    traits: { ...NEUTRAL, hullModifier: 1.3 },
  },
  daharan: {
    key: "daharan",
    name: "Daharan",
    tagline: "Pacíficos — PEM paralisante, atiram primeiro",
    lore: "Civilizacao pacifista que dominou o Pulso Eletro-Magnetico (PEM). Seus tiros nao destroem: paralisam as naves inimigas. Reflexos superiores garantem que disparam antes de qualquer outra raca.",
    strengths: ["PEM paralisa o inimigo antes dele atirar", "Os melhores defensores", "Excelentes roidadores"],
    weaknesses: ["NÃO destroem naves (só paralisam)", "Um Daharan sozinho é alvo cobiçado"],
    traits: { ...NEUTRAL, firstStrike: true, weaponMode: "disable" },
  },
  rakshasa: {
    key: "rakshasa",
    name: "Rakshasa",
    tagline: "Naves invisíveis",
    lore: "Mestres da furtividade. Suas frotas nao aparecem no radar inimigo — exceto as que saem para roubar roids, que se revelam ao atacar.",
    strengths: ["Naves invisíveis ao radar inimigo", "+30% de contra-espionagem", "Leves e rápidas"],
    weaknesses: ["A pesquisa 'Agentes Duplos' inimiga revela suas frotas", "Os roiders NÃO são invisíveis", "Cascos frágeis"],
    traits: { ...NEUTRAL, stealth: true },
  },
  mech: {
    key: "mech",
    name: "Mech",
    tagline: "Clonam a nave inimiga ao acertá-la em combate",
    lore: "Seres mecanicos auto-replicantes. Quando uma nave Mech acerta uma nave inimiga, ela e CLONADA para a frota Mech. E assim que os Mech acabam com naves de todas as racas: nao constroem, capturam replicando em pleno combate.",
    strengths: ["Assimilam (roubam) naves inimigas em combate", "Ganham pontuação assimilando", "Crescem com a frota do inimigo"],
    weaknesses: ["Difícil de dominar", "Perdem a própria nave ao assimilar"],
    traits: { ...NEUTRAL, cloneOnHit: true, canBuildAllRaces: false },
  },
  insecta: {
    key: "insecta",
    name: "Insecta",
    tagline: "Frágeis e baratas — vencem na quantidade",
    lore: "Enxames biologicos. Cada nave e fragil e descartavel, mas custa muito pouco: a forca esta no numero esmagador.",
    strengths: ["Naves baratíssimas e numerosas", "O terror dos Daharan (o PEM não dá conta do enxame)", "Boas defensoras e versáteis"],
    weaknesses: ["Naves muito frágeis", "Fracas individualmente — dependem da quantidade"],
    traits: { ...NEUTRAL, hullModifier: 0.6, shipCostModifier: 0.5 },
  },
};

export const RACE_KEYS = Object.keys(RACES) as RaceKey[];

export function isRaceKey(v: unknown): v is RaceKey {
  return typeof v === "string" && (RACE_KEYS as string[]).includes(v);
}

// Versao publica (sem expor nada sensivel) para o front listar no registro.
export function publicRaces() {
  return RACE_KEYS.map((k) => {
    const r = RACES[k];
    return { key: r.key, name: r.name, tagline: r.tagline, lore: r.lore, strengths: r.strengths, weaknesses: r.weaknesses };
  });
}
