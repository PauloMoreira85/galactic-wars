import { useEffect, useState } from "react";
import { api, REFRESH_MS } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

const STATUS: Record<string, string> = { outbound: "indo", engaged: "em combate", returning: "voltando", garrison: "defendendo" };

// Tráfego: frotas chegando na sua galáxia. Ataque = vermelho, defesa/transporte = verde.
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
        🔴 ataque · 🟢 defesa · linha destacada = chegando no SEU planeta.
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
        const Tabela = ({ titulo, cor, rows, atk }: { titulo: string; cor: string; rows: typeof data.fleets; atk: boolean }) =>
          rows.length === 0 ? null : (
            <div style={{ marginBottom: 14 }}>
              <div className="combat-ini" style={{ color: cor }}>{titulo} ({rows.length})</div>
              <table>
                <thead><tr><th>Origem</th><th>Comandante</th><th>Frota</th><th>Alvo</th><th>Naves</th><th>TEC</th></tr></thead>
                <tbody>
                  {rows.map((f, i) => (
                    <tr key={i} style={f.toMe ? { background: atk ? "rgba(255,80,80,0.12)" : "rgba(69,230,165,0.12)" } : undefined}>
                      <td><Coord c={f.origin} /></td>
                      <td>{f.owner}</td>
                      <td className="roid-count">{f.fleetName}</td>
                      <td>{f.toMe ? <b style={{ color: cor }}>{atk ? "🎯 você" : "🛡️ você"}</b> : <Coord c={f.target} />}</td>
                      <td>{fmt(f.ships)}</td>
                      <td>{f.status === "engaged" ? "em combate" : f.status === "garrison" ? "✓ no local" : `${f.ticks}t`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        return (
          <>
            <Tabela titulo="🔴 Ataques chegando" cor="var(--danger)" rows={ataques} atk={true} />
            <Tabela titulo="🟢 Defesas chegando" cor="var(--carbonum)" rows={defesas} atk={false} />
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
          <div className="combat-ini"><b>{m.planet}</b> <span className="roid-count">(<Coord c={m.coords} />) · {m.owner}</span></div>
          <table>
            <thead><tr><th>Frota</th><th>Tipo</th><th>Destino</th><th>Naves</th><th>Espólio (M/C/P)</th><th>Estado</th></tr></thead>
            <tbody>
              {m.fleets.map((f, j) => {
                const atk = f.mission === "attack";
                const c = f.captured; const has = c.metalium || c.carbonum || c.plutonium;
                return (
                  <tr key={j}>
                    <td>{f.name}</td>
                    <td style={{ color: atk ? "var(--danger)" : "var(--carbonum)" }}>{atk ? "🔴 ataque" : "🟢 defesa"}</td>
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
