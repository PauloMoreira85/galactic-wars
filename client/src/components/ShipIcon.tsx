import { useState } from "react";

// Slug acento-seguro igual ao servidor (catalog.ts): "Deméter" -> "demeter".
function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function shipImg(name: string): string { return `/art/ships/${slug(name)}.png`; }

// Ícone pequeno da nave (com fallback 🚀 se a arte não existir). Usado nas tabelas.
export function ShipIcon({ name, size = 24 }: { name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) return <span style={{ fontSize: size * 0.7, lineHeight: 1 }}>🚀</span>;
  return (
    <img src={shipImg(name)} alt="" width={size} height={size} loading="lazy" onError={() => setErr(true)}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: 5, border: "1px solid var(--border)", verticalAlign: "middle", background: "rgba(0,0,0,0.3)" }} />
  );
}

// Nome da nave com ícone ao lado (inline), pra usar em células de tabela.
export function ShipName({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <ShipIcon name={name} size={size} /><b>{name}</b>
    </span>
  );
}
