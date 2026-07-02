import { useEffect, useState } from "react";
import { api, REFRESH_MS } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

const STATUS: Record<string, string> = { outbound: "indo", engaged: "em combate", returning: "voltando", garrison: "defendendo" };

// Tráfego: frotas chegando na sua galáxia. Ataque = vermelho, defesa/transporte = verde.
export function Trafego() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.traffic>> | null>(null);
  const [error, setError] = useState("");

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
      ) : (
        <table>
          <thead>
            <tr><th>Destino</th><th>Origem</th><th>Comandante</th><th>Tipo</th><th>Naves</th><th>Chega em</th></tr>
          </thead>
          <tbody>
            {data.fleets.map((f, i) => {
              const atk = f.mission === "attack";
              const color = atk ? "var(--danger)" : "var(--carbonum)";
              return (
                <tr key={i} style={f.toMe ? { background: "rgba(255,80,80,0.10)" } : undefined}>
                  <td><b>{f.targetName ?? "—"}</b> <span className="roid-count">{f.target}</span>{f.toMe && " 🎯"}</td>
                  <td className="roid-count">{f.origin}</td>
                  <td>{f.owner}</td>
                  <td style={{ color }}>{atk ? "🔴 ataque" : "🟢 defesa"}{f.status === "engaged" ? " (em combate)" : ""}</td>
                  <td>{fmt(f.ships)}</td>
                  <td>{f.status === "engaged" ? "—" : `${f.ticks} tick(s)`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>

    <div className="panel">
      <h2>Movimentação da galáxia {data.galaxy}</h2>
      <div className="cost" style={{ marginBottom: 10 }}>Todas as frotas em movimento dos planetas da sua galáxia (ataque ou defesa).</div>
      {data.movements.length === 0 ? (
        <div className="roid-count">Nenhuma frota em movimento na galáxia.</div>
      ) : data.movements.map((m, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div className="combat-ini"><b>{m.planet}</b> <span className="roid-count">({m.coords}) · {m.owner}</span></div>
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
                    <td className="roid-count">{f.target}</td>
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
