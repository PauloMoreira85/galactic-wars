import { ShipIcon } from "./ShipIcon";
import type { QueueItem } from "../api";

// Linha do tempo HORIZONTAL da produção de naves. Cada lote vira um marco posicionado
// no tick em que fica pronto (0 = agora, à esquerda; futuro à direita). Mostra ícone da
// nave, quantidade e ticks restantes. Lotes que ficam prontos no mesmo tick empilham.
export function ShipTimeline({ items }: { items: QueueItem[] }) {
  const ships = items.filter((q) => q.kind === "ship");
  if (ships.length === 0) return null;

  // Ordena por conclusão (mais perto primeiro) e acha o horizonte (maior ticksRemaining).
  const sorted = [...ships].sort((a, b) => a.ticksRemaining - b.ticksRemaining);
  const maxT = Math.max(1, ...sorted.map((q) => q.ticksRemaining));

  // Marcas da régua: 0 (agora) + o horizonte; se couber, uma no meio.
  const marks = maxT >= 4 ? [0, Math.round(maxT / 2), maxT] : [0, maxT];

  return (
    <div style={{ margin: "4px 0 14px" }}>
      <div className="roid-count" style={{ marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <span>⏱️ Linha do tempo</span>
        <span>horizonte: <b style={{ color: "var(--accent)" }}>{maxT}t</b></span>
      </div>

      {/* Trilho com os marcos. Posição = ticksRemaining / maxT (0 = agora à esquerda). */}
      <div style={{ position: "relative", height: 86, marginTop: 6 }}>
        {/* linha base */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 58, height: 2, background: "var(--border)", borderRadius: 2 }} />
        {/* marco "agora" */}
        <div style={{ position: "absolute", left: 0, top: 52, width: 2, height: 14, background: "var(--accent)" }} />

        {sorted.map((q, i) => {
          const pct = maxT > 0 ? (q.ticksRemaining / maxT) * 100 : 0;
          // Empurra pra dentro pra não cortar nas bordas (clamp 2%..96%).
          const left = Math.max(2, Math.min(96, pct));
          const ready = q.ticksRemaining <= 0;
          return (
            <div key={q.id} title={`${q.quantity}x ${q.shipClass ?? q.label} — ${ready ? "pronto!" : `faltam ${q.ticksRemaining}t`}`}
              style={{ position: "absolute", left: `${left}%`, top: 0, transform: "translateX(-50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 60 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: ready ? "#37e07a" : "var(--accent)", lineHeight: 1 }}>
                {ready ? "✓" : `${q.ticksRemaining}t`}
              </span>
              <ShipIcon name={q.shipClass ?? ""} size={34} />
              <span className="roid-count" style={{ fontSize: 10, lineHeight: 1 }}>{q.quantity}x</span>
              {/* haste até a linha base */}
              <div style={{ width: 2, flex: 1, minHeight: 6, background: "var(--border)" }} />
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: ready ? "#37e07a" : "var(--accent)", marginTop: -4 }} />
            </div>
          );
        })}
      </div>

      {/* Régua de ticks embaixo */}
      <div style={{ position: "relative", height: 16 }}>
        {marks.map((m) => {
          const left = maxT > 0 ? Math.max(0, Math.min(100, (m / maxT) * 100)) : 0;
          return (
            <span key={m} className="roid-count" style={{ position: "absolute", left: `${left}%`,
              transform: left >= 96 ? "translateX(-100%)" : left <= 2 ? "none" : "translateX(-50%)", fontSize: 10 }}>
              {m === 0 ? "agora" : `+${m}t`}
            </span>
          );
        })}
      </div>
    </div>
  );
}
