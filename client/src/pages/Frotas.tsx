import { useEffect, useState } from "react";
import { api, type PlanetView } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

const STATUS_LABEL: Record<string, string> = {
  idle: "na base", outbound: "indo", engaged: "em combate", returning: "voltando",
};

// Gerenciamento de frotas (estilo "Frotas sob o seu comando"): Base + frotas
// persistentes nomeadas. Move naves entre a Base e cada frota idle.
export function Frotas({ view, onChanged }: { view: PlanetView; onChanged: () => void }) {
  const [fleets, setFleets] = useState<Awaited<ReturnType<typeof api.fleets>>["fleets"]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const f = (await api.fleets()).fleets;
      setFleets(f);
      // inicializa os campos editáveis das frotas idle com a composição atual
      const e: Record<string, Record<string, number>> = {};
      for (const fl of f) if (fl.idle) e[fl.id] = { ...fl.units };
      setEdits(e);
    } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t); }, []);

  async function act(fn: () => Promise<any>) {
    setBusy(true); setError("");
    try { const r = await fn(); if (r && r.planet) onChanged(); await load(); }
    catch (e: any) { setError(e.message ?? "Falha"); }
    finally { setBusy(false); }
  }

  // Naves a listar: as que existem na Base ou em qualquer frota.
  const shipNames = Array.from(new Set([
    ...view.units.filter((u) => u.count > 0).map((u) => u.name),
    ...fleets.flatMap((f) => Object.keys(f.units)),
  ]));
  const baseOf = (name: string) => view.units.find((u) => u.name === name)?.count ?? 0;
  const nextCost = view.planet.nextFleetSlotCost;

  return (
    <>
      <div className="panel">
        <h2>Frotas sob o seu comando</h2>
        <div className="cost" style={{ marginBottom: 10 }}>
          {view.planet.fleetSlots}/5 frotas criadas. Mova naves da <b>Base</b> para cada frota (só com a frota na base) e clique <b>transferir</b>. O envio é na aba <b>Galáxia</b> (mire o alvo e escolha a frota).
        </div>

        {fleets.length === 0 ? (
          <div className="roid-count">Nenhuma frota ainda. Crie uma abaixo.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="fleet-grid">
              <thead>
                <tr>
                  <th>Naves</th>
                  <th>Base</th>
                  {fleets.map((f) => <th key={f.id}>{f.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {shipNames.map((name) => (
                  <tr key={name}>
                    <td className="fg-name"><b>{name}</b></td>
                    <td>{fmt(baseOf(name))}</td>
                    {fleets.map((f) => (
                      <td key={f.id} className={!f.idle && !(f.units[name]) ? "fg-zero" : ""}>
                        {f.idle ? (
                          <input
                            type="number" min={0} value={edits[f.id]?.[name] ?? 0}
                            onChange={(e) => setEdits({ ...edits, [f.id]: { ...edits[f.id], [name]: Math.max(0, Number(e.target.value)) } })}
                            style={{ width: 70, margin: 0, padding: "3px 5px", textAlign: "center" }}
                          />
                        ) : (f.units[name] ? fmt(f.units[name]) : "·")}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="fg-meta">
                  <td>Estado</td><td>—</td>
                  {fleets.map((f) => (
                    <td key={f.id} style={{ color: f.idle ? "var(--muted)" : f.mission === "attack" ? "var(--danger)" : "var(--carbonum)" }}>
                      {STATUS_LABEL[f.status] ?? f.status}
                      {!f.idle && <div className="roid-count">{f.target} · {f.ticksRemaining}t</div>}
                    </td>
                  ))}
                </tr>
                <tr className="fg-meta">
                  <td>Viagem (G/S/U)</td><td>—</td>
                  {fleets.map((f) => (
                    <td key={f.id} className="roid-count">{f.travel.galaxia}/{f.travel.setor}/{f.travel.universo}t<div>⛽{fmt(f.travel.fuel)}</div></td>
                  ))}
                </tr>
                <tr className="fg-meta">
                  <td>Ações</td><td>—</td>
                  {fleets.map((f) => (
                    <td key={f.id}>
                      {f.idle ? (
                        <button disabled={busy} style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => act(() => api.loadFleet(f.id, edits[f.id] || {}))}>transferir</button>
                      ) : f.canRecall ? (
                        <button disabled={busy} style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => act(() => api.recallFleet(f.id))}>↩ recuar</button>
                      ) : <span className="roid-count">—</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      <div className="panel">
        <h2>Criar frota</h2>
        <div className="cost">Gasta recursos para criar uma frota e usa quando quiser. Custo ×5 a cada nova frota (máx 5).</div>
        <div className="roid-row">
          <div className="roid-label"><div>
            <div><b>Criar frota #{view.planet.fleetSlots + 1}</b></div>
            {nextCost
              ? <div className="roid-count">{fmt(nextCost.metalium)} metalium · {fmt(nextCost.carbonum)} carbonum</div>
              : <div className="roid-count">Você já tem o máximo de frotas (5).</div>}
          </div></div>
          {nextCost && (
            <button disabled={busy || view.planet.resources.metalium < nextCost.metalium || view.planet.resources.carbonum < nextCost.carbonum}
              onClick={() => act(() => api.createFleet())}>
              {busy ? "..." : "criar frota"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
