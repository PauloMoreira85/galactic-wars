// Nome padronizado de um planeta: "Planeta (Comandante)".
// Padrão único do jogo (pedido do Felipe) — antes umas telas mostravam só o
// planeta e outras só o comandante. Use sempre que exibir quem é um planeta.
// Se o comandante não vier, mostra só o planeta (degrada bem).
export function planetLabel(planet?: string | null, commander?: string | null): string {
  const p = (planet ?? "").trim();
  const c = (commander ?? "").trim();
  if (p && c) return `${p} (${c})`;
  return p || c || "?";
}

export function PlanetTag({ planet, commander, bold }: { planet?: string | null; commander?: string | null; bold?: boolean }) {
  const p = (planet ?? "").trim();
  const c = (commander ?? "").trim();
  const name = p || c || "?";
  return (
    <span>
      {bold ? <b>{name}</b> : name}
      {p && c && <span className="roid-count"> ({c})</span>}
    </span>
  );
}
