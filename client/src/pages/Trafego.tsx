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
        Separado por planeta (slot): <span style={{ color: "var(--danger)" }}>− ataques</span> em cima, <span style={{ color: "var(--carbonum)" }}>+ defesas</span> embaixo — cada um por TEC.
        {data.incomingToMe > 0 && (
          <span style={{ color: "var(--danger)", marginLeft: 8 }}>⚠ {data.incomingToMe} ataque(s) vindo para você!</span>
        )}
      </div>
      {data.fleets.length === 0 ? (
        <div className="roid-count">Nenhuma frota em trânsito para a sua galáxia.</div>
      ) : (() => {
        // Estilo GW original: SEPARADO POR SLOT. Cada planeta-alvo é um bloco, com
        // seus ATAQUES (vermelho) em cima e DEFESAS (verde) embaixo, cada um por TEC.
        const byTarget = new Map<string, { coord: string; name: string | null; toMe: boolean; fleets: typeof data.fleets }>();
        for (const f of data.fleets) {
          if (!byTarget.has(f.target)) byTarget.set(f.target, { coord: f.target, name: f.targetName, toMe: f.toMe, fleets: [] });
          byTarget.get(f.target)!.fleets.push(f);
        }
        // Blocos: o SEU planeta primeiro, depois por coord. Dentro, ataque antes de defesa, por TEC.
        const blocos = [...byTarget.values()].sort((a, b) => (a.toMe ? -1 : b.toMe ? 1 : a.coord.localeCompare(b.coord)));

        const linha = (f: typeof data.fleets[number], atk: boolean) => (
          <tr key={f.origin + f.fleetName} style={{ color: atk ? "var(--danger)" : "var(--carbonum)" }}>
            <td>
              <span style={{ fontFamily: "var(--mono)" }}>{atk ? "− " : "+ "}</span>
              {f.originName ? <>{f.owner} <span style={{ opacity: 0.85 }}>de {f.originName}</span> </> : <>{f.owner} </>}
              (<Coord c={f.origin} />)
            </td>
            <td>{f.fleetName}</td>
            <td>{fmt(f.ships)}</td>
            <td>{f.status === "engaged" ? "em combate" : f.status === "garrison" ? "✓ no local" : `${f.ticks}`}</td>
          </tr>
        );

        return blocos.map((b) => {
          const ataques = b.fleets.filter((f) => f.mission === "attack").sort((a, c) => a.ticks - c.ticks);
          const defesas = b.fleets.filter((f) => f.mission !== "attack").sort((a, c) => a.ticks - c.ticks);
          return (
            <div key={b.coord} style={{ marginBottom: 16, border: b.toMe ? "1px solid var(--danger)" : "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: b.toMe ? "rgba(255,80,80,0.06)" : undefined }}>
              <div className="combat-ini" style={{ marginBottom: 4 }}>
                {b.toMe ? "⭐ " : "🪐 "}{b.name ? <b>{b.name}</b> : null} <span className="roid-count">(<Coord c={b.coord} />)</span>
                {b.toMe && <span style={{ color: "var(--danger)" }}> — SEU PLANETA</span>}
              </div>
              <table className="traffic-table">
                <thead><tr><th>Origem</th><th>Frota</th><th>Naves</th><th>TEC</th></tr></thead>
                <tbody>
                  {ataques.map((f) => linha(f, true))}
                  {defesas.map((f) => linha(f, false))}
                </tbody>
              </table>
            </div>
          );
        });
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
