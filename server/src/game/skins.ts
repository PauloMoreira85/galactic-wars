// Catálogo de skins (aparência) de planeta. NEUTRAS quanto à raça — o jogador
// escolhe a sua no início do round; não pode revelar a raça no mapa.
// As imagens ficam em client/public/art/planets/<key>.jpg
export const PLANET_SKINS = [
  { key: "terra", name: "Terra" },
  { key: "oceanico", name: "Oceânico" },
  { key: "deserto", name: "Deserto" },
  { key: "gelo", name: "Gelo" },
  { key: "vulcanico", name: "Vulcânico" },
  { key: "gas", name: "Gasoso" },
  { key: "anelado", name: "Anelado" },
  { key: "toxico", name: "Tóxico" },
  { key: "cidade", name: "Metrópole" },
  { key: "purpura", name: "Cristal" },
  { key: "lunar", name: "Lunar" },
] as const;

export const SKIN_KEYS: string[] = PLANET_SKINS.map((s) => s.key);
export const DEFAULT_SKIN = "terra";

export function isSkinKey(k: unknown): k is string {
  return typeof k === "string" && SKIN_KEYS.includes(k);
}
