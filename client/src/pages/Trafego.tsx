import { useEffect, useState } from "react";
import { api, REFRESH_MS } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

const STATUS: Record<string, string> = { outbound: "indo", engaged: "em combate", returning: "voltando", garrison: "defendendo" };

// Tráfego: frotas chegando na sua galáxia. Ataque = ⚔️, defesa/transporte = 🛡️.
export function Trafego({ onGoto }: { onGoto?: (coords: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.traffic>> | null>(null);
  const [error, setError] = useState("");

  // Coordenada clicável → abre a galáxia daquele planeta (quando onGoto existe).
  const Coord = ({ c }: { c: string }) =>
    onGoto
      ? <button className="coord-link" title={`Ver a galáxia ${c}`} onClick={() => onGoto(c)}>{c}</button>
      : <span className="roid-count">{c}</span>;

  async function load() {
    try {
      setData(await api.traffic());
    } catch (e: any) {
      setError(e.message ?? "Falha");
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  if (error) return <div className="panel"><div className="error">{error}</div></div>;
  if (!data) return <div className="panel"><div className="roid-count">Carregando tráfego...</div></div>;

  return (
    <>
    <div className="panel">
      <h2>Tráfego — frotas chegando na galáxia {data.galaxy}</h2>
      <div className="cost" style={{ marginBottom: 10 }}>
        ⚔️ ataque · 🛡️ defesa · linha destacada = chegando no SEU planeta.
        {data.incomingToMe > 0 && (
          <span style={{ color: "var(--danger)", marginLeft: 8 }}>⚠ {data.incomingToMe} ataque(s) vindo para você!</span>
        )}
      </div>
      {data.fleets.length === 0 ? (
        <div className="roid-count">Nenhuma frota em trânsito para a sua galáxia.</div>
      ) : (() => {
        // Estilo GW original: ATAQUES em cima, DEFESAS embaixo — cada grupo por TEC.
        const ataques = data.fleets.filter((f) => f.mission === "attack").sort((a, b) => a.ticks - b.ticks);
        const defesas = data.fleets.filter((f) => f.mission !== "attack").sort((a, b) => a.ticks - b.ticks);
        // atk=true → tabela de ataque (vermelho); false → defesa (verde).
        // Layout fiel ao GW original: Origem ("- Planeta de Comandante (coord)") |
        // Frota | Naves | TEC. Ataque com "-" em vermelho, defesa com "+" em verde.
        const Tabela = ({ cor, rows, atk }: { cor: string; rows: typeof data.fleets; atk: boolean }) =>
          rows.length === 0 ? null : (
            <div style={{ marginBottom: 14 }}>
              <table className="traffic-table">
                <thead><tr><th>Origem</th><th>Alvo</th><th>Frota</th><th>Naves</th><th>TEC</th></tr></thead>
                <tbody>
                  {rows.map((f, i) => (
                    <tr key={i} style={{ color: cor, ...(f.toMe ? { background: atk ? "rgba(255,80,80,0.14)" : "rgba(69,230,165,0.14)", fontWeight: 700 } : undefined) }}>
                      <td>
                        <span style={{ fontFamily: "var(--mono)" }}>{atk ? "− " : "+ "}</span>
                        {f.originName ? <>{f.originName} <span style={{ opacity: 0.85 }}>de {f.owner}</span> </> : <>{f.owner} </>}
                        (<Coord c={f.origin} />)
                      </td>
                      <td>
                        {f.toMe ? <b>{atk ? "⚔️ VOCÊ" : "🛡️ você"} (<Coord c={f.target} />)</b>
                          : <>{f.targetName ? <>{f.targetName} </> : null}(<Coord c={f.target} />)</>}
                      </td>
                      <td>{f.fleetName}</td>
                      <td>{fmt(f.ships)}</td>
                      <td>{f.status === "engaged" ? "em combate" : f.status === "garrison" ? "✓ no local" : `${f.ticks}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return (
          <>
            {ataques.length > 0 && <div className="combat-ini" style={{ color: "var(--danger)" }}>⚔️ Ataques chegando ({ataques.length})</div>}
            <Tabela cor="var(--danger)" rows={ataques} atk={true} />
            {defesas.length > 0 && <div className="combat-ini" style={{ color: "var(--carbonum)" }}>🛡️ Defesas chegando ({defesas.length})</div>}
            <Tabela cor="var(--carbonum)" rows={defesas} atk={false} />
          </>
        );
      })()}
    </div>

    <div className="panel">
      <h2>Movimentação da galáxia {data.galaxy}</h2>
      <div className="cost" style={{ marginBottom: 10 }}>Todas as frotas em movimento dos planetas da sua galáxia (ataque ou defesa).</div>
      {data.movements.length === 0 ? (
        <div className="roid-count">Nenhuma frota em movimento na galáxia.</div>
      ) : data.movements.map((m, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div className="combat-ini"><b>{m.planet}</b> <span className="roid-count">({m.owner}) · <Coord c={m.coords} /></span></div>
          <table>
            <thead><tr><th>Frota</th><th>Tipo</th><th>Destino</th><th>Naves</th><th>Espólio (M/C/P)</th><th>Estado</th></tr></thead>
            <tbody>
              {m.fleets.map((f, j) => {
                const atk = f.mission === "attack";
                const c = f.captured; const has = c.metalium || c.carbonum || c.plutonium;
                return (
                  <tr key={j}>
                    <td>{f.name}</td>
                    <td style={{ color: atk ? "var(--danger)" : "var(--carbonum)" }}>{atk ? "⚔️ ataque" : "🛡️ defesa"}</td>
                    <td><Coord c={f.target} /></td>
                    <td>{fmt(f.ships)}</td>
                    <td className="roid-count" style={has ? { color: "var(--carbonum)" } : undefined}>{has ? `${fmt(c.metalium)}/${fmt(c.carbonum)}/${fmt(c.plutonium)}` : "—"}</td>
                    <td>{STATUS[f.status] ?? f.status}{f.status !== "engaged" && f.ticks > 0 ? ` · ${f.ticks}t` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
    </>
  );
}
