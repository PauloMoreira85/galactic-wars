type LogEntry = {
  side: "a" | "d";
  ini: number;
  ship: string;
  count: number;
  target: string;
  shots: number;
  action: "pem" | "destroy" | "assim";
  amount: number;
  chance: number;
  assimCost?: number;
};

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

/**
 * Estatísticas do combate a partir do log tiro-a-tiro: totais de cada lado +
 * tabela por nave (tiros, chance média, abatidos, eficiência). Puramente
 * derivado do `log` — sem mudança no servidor.
 */
export function CombatStats({ log }: { log: LogEntry[] }) {
  if (!log || log.length === 0) return null;

  // ---- Totais por lado ----
  const side = (s: "a" | "d") => {
    const rows = log.filter((e) => e.side === s);
    const shots = rows.reduce((a, e) => a + e.shots, 0);
    const destroyed = rows.filter((e) => e.action === "destroy").reduce((a, e) => a + e.amount, 0);
    const pem = rows.filter((e) => e.action === "pem").reduce((a, e) => a + e.amount, 0);
    const assim = rows.filter((e) => e.action === "assim").reduce((a, e) => a + e.amount, 0);
    const hits = destroyed + pem + assim;
    const rate = shots > 0 ? Math.round((hits / shots) * 100) : 0;
    return { shots, destroyed, pem, assim, hits, rate };
  };
  const atk = side("a");
  const def = side("d");

  // ---- Tabela por nave (atirador) ----
  type Row = { side: "a" | "d"; ship: string; count: number; shots: number; abatidos: number; chanceSum: number; chanceN: number };
  const map = new Map<string, Row>();
  for (const e of log) {
    const k = `${e.side}|${e.ship}`;
    const r = map.get(k) ?? { side: e.side, ship: e.ship, count: 0, shots: 0, abatidos: 0, chanceSum: 0, chanceN: 0 };
    r.count = Math.max(r.count, e.count); // nº de naves atirando (mesma frota no tick)
    r.shots += e.shots;
    r.abatidos += e.amount;
    r.chanceSum += e.chance;
    r.chanceN += 1;
    map.set(k, r);
  }
  const rows = Array.from(map.values()).sort((a, b) => (a.side === b.side ? b.abatidos - a.abatidos : a.side === "a" ? -1 : 1));

  const Tot = ({ t, label, color }: { t: typeof atk; label: string; color: string }) => (
    <div style={{ flex: 1, minWidth: 180, background: "#0a0e1a", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
      <div style={{ color, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div className="stat-line"><span>Tiros disparados</span><b>{fmt(t.shots)}</b></div>
      <div className="stat-line"><span>Taxa de acerto</span><b>{t.rate}%</b></div>
      <div className="stat-line"><span>Destruídas</span><b style={{ color: "var(--danger)" }}>{fmt(t.destroyed)}</b></div>
      {t.pem > 0 && <div className="stat-line"><span>Paralisadas (PEM)</span><b style={{ color: "var(--plutonium)" }}>{fmt(t.pem)}</b></div>}
      {t.assim > 0 && <div className="stat-line"><span>Assimiladas</span><b style={{ color: "var(--accent)" }}>{fmt(t.assim)}</b></div>}
      <div className="stat-line" style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4 }}><span>Total abatido</span><b>{fmt(t.hits)}</b></div>
    </div>
  );

  return (
    <>
      <div className="panel">
        <h2>📊 Estatísticas do combate</h2>
        <div className="cost" style={{ marginBottom: 10 }}>Resumo da rodada: tiros, taxa de acerto e naves abatidas de cada lado.</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Tot t={atk} label="⚔️ Atacante" color="var(--danger)" />
          <Tot t={def} label="🛡️ Defensor" color="var(--carbonum)" />
        </div>
      </div>

      <div className="panel">
        <h2>Estatísticas por nave</h2>
        <div className="cost" style={{ marginBottom: 8 }}>Quantos tiros cada frota deu, a chance média de acerto, quantas naves abateu e a eficiência (abatidos por tiro).</div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>Lado</th><th>Nave</th><th>Naves</th><th>Tiros</th><th>Chance</th><th>Abatidos</th><th>Eficiência</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const chance = r.chanceN > 0 ? Math.round(r.chanceSum / r.chanceN) : 0;
                const efi = r.shots > 0 ? (r.abatidos / r.shots) : 0;
                return (
                  <tr key={i}>
                    <td style={{ color: r.side === "a" ? "var(--danger)" : "var(--carbonum)" }}>{r.side === "a" ? "⚔️" : "🛡️"}</td>
                    <td className="fg-name">{r.ship}</td>
                    <td>{fmt(r.count)}</td>
                    <td>{fmt(r.shots)}</td>
                    <td className="roid-count">{chance}%</td>
                    <td><b>{fmt(r.abatidos)}</b></td>
                    <td className="roid-count">{efi.toFixed(2)}/tiro</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
