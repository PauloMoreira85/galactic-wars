// Mapa de unidades de uma frota/hangar: { "NomeDaNave": quantidade }.
export type UnitMap = Record<string, number>;

export function parseUnits(json: string | null | undefined): UnitMap {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    if (o && typeof o === "object") {
      const out: UnitMap = {};
      for (const k of Object.keys(o)) {
        const n = Math.floor(Number(o[k]) || 0);
        if (n > 0) out[k] = n;
      }
      return out;
    }
  } catch {}
  return {};
}

export function stringifyUnits(m: UnitMap): string {
  const out: UnitMap = {};
  for (const k of Object.keys(m)) if (m[k] > 0) out[k] = m[k];
  return JSON.stringify(out);
}

export function totalUnits(m: UnitMap): number {
  return Object.values(m).reduce((a, b) => a + (b || 0), 0);
}

export function addUnits(a: UnitMap, b: UnitMap): UnitMap {
  const o: UnitMap = { ...a };
  for (const k of Object.keys(b)) o[k] = (o[k] || 0) + b[k];
  return o;
}
