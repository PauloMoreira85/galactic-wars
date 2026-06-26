import { useEffect, useState } from "react";
import { api } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export function Combats() {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.combats>>["combats"]>([]);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.combat>> | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setList((await api.combats()).combats);
    } catch {}
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function open(id: string) {
    setLoading(true);
    try {
      setDetail(await api.combat(id));
    } catch {} finally {
      setLoading(false);
    }
  }

  if (detail) {
    const d = detail.detail;
    const cap = d.captured;
    const iAmAtk = detail.iAmAttacker;
    type Row = { name: string; before: number; lost: number; pem: number; assim: number; survivors: number };
    const defMap = new Map<string, Row>(d.defender.map((r) => [r.name, r]));
    const atkMap = new Map<string, Row>(d.attacker.map((r) => [r.name, r]));
    const names = Array.from(new Set([...d.defender.map((r) => r.name), ...d.attacker.map((r) => r.name)]));
    const cell = (r?: Row) => r
      ? <><td>{fmt(r.before)}</td><td style={{ color: r.lost > 0 ? "var(--danger)" : undefined }}>{fmt(r.lost)}{r.assim > 0 && <span title="dessas perdas, quantas foram assimiladas pelo inimigo" style={{ color: "var(--accent)" }}> ({fmt(r.assim)})</span>}</td><td style={{ color: r.pem > 0 ? "var(--plutonium)" : undefined }}>{r.pem ? fmt(r.pem) : "—"}</td></>
      : <><td className="fg-zero">·</td><td className="fg-zero">·</td><td className="fg-zero">·</td></>;
    const youDef = !iAmAtk ? { background: "rgba(37,211,255,0.06)" } : undefined;
    const youAtk = iAmAtk ? { background: "rgba(37,211,255,0.06)" } : undefined;

    return (
      <>
        <button className="link" onClick={() => setDetail(null)}>← voltar aos combates</button>
        <div className="panel" style={{ marginTop: 10 }}>
          <h2>Relatório de Combate</h2>
          <div className="cost">
            Combate ocorrido no tick <b>#{detail.tick}</b> ({d.ticks ?? 3} ticks), em órbita de <b>{detail.defenderName}</b> ({detail.defenderCoords}).
          </div>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 8 }}>
            <div><div className="roid-count">Atacante {iAmAtk && "(você)"}</div><b style={{ color: "var(--danger)" }}>{detail.attackerName}</b> <span className="roid-count">({detail.attackerCoords}) · {d.attackerRace}</span></div>
            <div><div className="roid-count">Defensor {!iAmAtk && "(você)"}</div><b style={{ color: "var(--carbonum)" }}>{detail.defenderName}</b> <span className="roid-count">({detail.defenderCoords}) · {d.defenderRace}</span></div>
          </div>
        </div>

        <div className="panel">
          <div style={{ overflowX: "auto" }}>
            <table className="fleet-grid">
              <thead>
                <tr>
                  <th rowSpan={2}>Nave</th>
                  <th colSpan={3} style={youDef}>🛡️ Defendendo</th>
                  <th colSpan={3} style={youAtk}>⚔️ Atacando</th>
                </tr>
                <tr>
                  <th style={youDef}>Total</th><th style={youDef}>Perdidas</th><th style={youDef}>PEM</th>
                  <th style={youAtk}>Total</th><th style={youAtk}>Perdidas</th><th style={youAtk}>PEM</th>
                </tr>
              </thead>
              <tbody>
                {names.map((n) => (
                  <tr key={n}>
                    <td className="fg-name"><b>{n}</b></td>
                    {cell(defMap.get(n))}
                    {cell(atkMap.get(n))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>Asteroides</h2>
          <table>
            <thead><tr><th>Recurso</th><th>Capturado pelo atacante</th></tr></thead>
            <tbody>
              <tr><td><span className="dot metalium" /> Metalium</td><td>{fmt(cap.metalium)}</td></tr>
              <tr><td><span className="dot carbonum" /> Carbonum</td><td>{fmt(cap.carbonum)}</td></tr>
              <tr><td><span className="dot plutonium" /> Plutonium</td><td>{fmt(cap.plutonium)}</td></tr>
            </tbody>
          </table>
          {!(cap.metalium || cap.carbonum || cap.plutonium) && <div className="roid-count" style={{ marginTop: 6 }}>Nenhum roid capturado neste combate.</div>}

          {d.raid && (
            <div style={{ marginTop: 10 }}>
              <div className="roid-count" style={{ marginBottom: 4 }}>
                Roiders ativos (não-paralisados) e capacidade de roubo:
              </div>
              {d.raid.rows.length > 0 ? (
                <table>
                  <thead><tr><th>Roider</th><th>Ativos</th><th>Roids/nave</th><th>Capacidade</th></tr></thead>
                  <tbody>
                    {d.raid.rows.map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td>{fmt(r.active)}</td>
                        <td>{r.cargo}</td>
                        <td>{fmt(r.capacity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="roid-count">Nenhum roider ativo neste tick (todos paralisados ou ausentes).</div>
              )}
              <div className="roid-count" style={{ marginTop: 6 }}>
                Capacidade total: <b>{fmt(d.raid.capacity)}</b> roids · limite do round: <b>{d.raid.ratePct}%</b> dos roids do alvo · capturado: <b>{fmt(d.raid.captured)}</b>
              </div>
            </div>
          )}
        </div>

        {d.log && d.log.length > 0 && (
          <div className="panel">
            <h2>Combate Completo</h2>
            <div className="cost" style={{ marginBottom: 8 }}>Última rodada, por ordem de iniciativa:</div>
            {Array.from(new Set(d.log.map((e) => e.ini))).sort((a, b) => a - b).map((ini) => (
              <div key={ini} style={{ marginBottom: 10 }}>
                <div className="combat-ini">Iniciativa {ini}</div>
                {d.log!.filter((e) => e.ini === ini).map((e, i) => {
                  const who = e.side === "a" ? "Atacante" : "Defensor";
                  const verbo = e.action === "pem" ? "paralisando" : e.action === "assim" ? "assimilando" : "destruindo";
                  const chanceLabel = e.action === "pem" ? "Chance de vencer a resistência ao PEM" : "Chance média de atingir";
                  const tirosPorNave = e.count > 0 ? Math.round(e.shots / e.count) : 0;
                  return (
                    <div key={i} className="combat-line">
                      <span style={{ color: e.side === "a" ? "var(--danger)" : "var(--carbonum)" }}>{who}:</span>{" "}
                      {fmt(e.count)} {e.ship} atirando {fmt(e.shots)} vez(es) ({fmt(e.count)} naves × {tirosPorNave} tiros) em {e.target}, {verbo} {fmt(e.amount)} naves
                      <span className="roid-count"> ({chanceLabel} — {e.chance}%)</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="panel">
      <h2>Combates — relatórios de batalha</h2>
      {loading && <div className="roid-count">Carregando...</div>}
      {list.length === 0 ? (
        <div className="roid-count">Nenhum combate ainda. Envie uma frota de ataque a outra galáxia!</div>
      ) : (
        <table>
          <thead>
            <tr><th>Tick</th><th>Papel</th><th>Oponente</th><th>Coord.</th><th>Perdi</th><th>Inimigo perdeu</th><th>Captura (M/C/P)</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td className="rank-num">#{c.tick}</td>
                <td>{c.role === "attacker" ? "⚔️ ataque" : "🛡️ defesa"}</td>
                <td>{c.opponent}</td>
                <td>{c.opponentCoords}</td>
                <td style={{ color: c.myLost > 0 ? "var(--danger)" : undefined }}>{fmt(c.myLost)}</td>
                <td style={{ color: c.oppLost > 0 ? "var(--carbonum)" : undefined }}>{fmt(c.oppLost)}</td>
                <td className="roid-count">{fmt(c.captured.metalium)}/{fmt(c.captured.carbonum)}/{fmt(c.captured.plutonium)}</td>
                <td><button onClick={() => open(c.id)}>ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
