import { useEffect, useState } from "react";
import { api, REFRESH_MS } from "../api";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }

function rewardLabel(r: { m?: number; c?: number; p?: number; roidM?: number; roidC?: number; roidP?: number }) {
  const parts: string[] = [];
  if (r.m) parts.push(`${fmt(r.m)} M`);
  if (r.c) parts.push(`${fmt(r.c)} C`);
  if (r.p) parts.push(`${fmt(r.p)} P`);
  if (r.roidM) parts.push(`${r.roidM} roid M`);
  if (r.roidC) parts.push(`${r.roidC} roid C`);
  if (r.roidP) parts.push(`${r.roidP} roid P`);
  return parts.join(" · ");
}

// Missões de novato: tarefas curtas que ensinam o jogo e dão recompensa automática
// ao cumprir. Pensadas pra entreter nos primeiros ticks (pouca coisa pra fazer).
export function Missoes() {
  const [missions, setMissions] = useState<Awaited<ReturnType<typeof api.missions>>["missions"]>([]);
  async function load() { try { setMissions((await api.missions()).missions); } catch {} }
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, []);

  const doneCount = missions.filter((m) => m.done).length;
  const total = missions.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="panel">
      <h2>🎖️ Missões do Comandante</h2>
      <div className="cost" style={{ marginBottom: 10 }}>
        Cumpra as tarefas pra <b>aprender o jogo</b> e ganhar recursos — a recompensa cai <b>automaticamente</b> quando você conclui. Dá pra fazer quase todas durante a proteção de novato.
      </div>
      {/* Barra de progresso */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
          <span className="roid-count">Progresso</span>
          <b style={{ color: "var(--accent)" }}>{doneCount}/{total} ({pct}%)</b>
        </div>
        <div style={{ height: 8, background: "rgba(0,0,0,0.4)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, var(--accent), var(--carbonum))", transition: "width 0.4s" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {missions.map((m) => (
          <div key={m.key} style={{
            display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
            border: "1px solid var(--border)", borderRadius: 10,
            background: m.done ? "rgba(69,230,165,0.07)" : "var(--panel)",
            opacity: m.done ? 0.75 : 1,
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{m.done ? "✅" : "⬜"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: m.done ? "var(--carbonum)" : "#eafcff", textDecoration: m.done ? "line-through" : undefined }}>
                {m.title}
              </div>
              <div className="roid-count" style={{ marginTop: 2 }}>{m.desc}</div>
              <div style={{ marginTop: 4, fontSize: 12 }}>
                🎁 Recompensa: <b style={{ color: "var(--accent)" }}>{rewardLabel(m.reward)}</b>
              </div>
            </div>
          </div>
        ))}
      </div>

      {doneCount === total && total > 0 && (
        <div className="cost" style={{ marginTop: 14, textAlign: "center", color: "var(--carbonum)" }}>
          🏆 Todas as missões concluídas! Agora é guerra de verdade. ⚔️
        </div>
      )}
    </div>
  );
}
