import { useEffect, useState } from "react";
import { api, type PlanetView } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

const STATUS_LABEL: Record<string, string> = {
  idle: "na base", outbound: "indo", engaged: "em combate", returning: "voltando", garrison: "defendendo",
};

// Gerenciamento de frotas (estilo "Frotas sob o seu comando"): Base + frotas
// persistentes nomeadas. Move naves entre a Base e cada frota idle.
export function Frotas({ view, onChanged }: { view: PlanetView; onChanged: () => void }) {
  const [fleets, setFleets] = useState<Awaited<ReturnType<typeof api.fleets>>["fleets"]>([]);
  const [edits, setEdits] = useState<Record<string, Record<string, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Envio direto daqui: coordenadas + ação + ticks + frota.
  const [dGalaxy, setDGalaxy] = useState(Number(view.planet.coords.split(":")[0]) || 1);
  const [dSystem, setDSystem] = useState(1);
  const [dSlot, setDSlot] = useState(1);
  const [dMission, setDMission] = useState<"attack" | "transport">("attack");
  const [dTicks, setDTicks] = useState(3);
  const [dFake, setDFake] = useState(false);
  const [dFleet, setDFleet] = useState("");

  async function dispatch() {
    if (!dFleet) { setError("Escolha uma frota carregada."); return; }
    setBusy(true); setError("");
    try {
      await api.dispatchFleet(dFleet, { galaxy: dGalaxy, system: dSystem, slot: dSlot, mission: dMission, ticks: dTicks, fake: dFake });
      setDFleet("");
      await load(); onChanged();
    } catch (e: any) { setError(e.message ?? "Falha ao enviar"); }
    finally { setBusy(false); }
  }

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
          {view.planet.fleetSlots}/5 frotas criadas. Ajuste a quantidade (ou use <b>«</b> = tudo pra Base / <b>»</b> = tudo pra frota) e clique <b>transferir</b>. Depois envie pelo painel <b>Enviar frota</b> abaixo (ou pela aba <b>Galáxia</b>).
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
                          <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center" }}>
                            <button title="tudo desta nave → Base" disabled={busy} onClick={() => setEdits({ ...edits, [f.id]: { ...edits[f.id], [name]: 0 } })}
                              style={{ padding: "2px 5px", margin: 0, fontSize: 12, lineHeight: 1 }}>«</button>
                            <input
                              type="number" min={0} placeholder="0" value={edits[f.id]?.[name] || ""}
                              onChange={(e) => setEdits({ ...edits, [f.id]: { ...edits[f.id], [name]: e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value))) } })}
                              style={{ width: 54, margin: 0, padding: "3px 4px", textAlign: "center" }}
                            />
                            <button title="tudo desta nave (Base + frota) → esta frota" disabled={busy} onClick={() => setEdits({ ...edits, [f.id]: { ...edits[f.id], [name]: baseOf(name) + (f.units[name] ?? 0) } })}
                              style={{ padding: "2px 5px", margin: 0, fontSize: 12, lineHeight: 1 }}>»</button>
                          </div>
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
                  <td>Espólio (M/C/P)</td><td>—</td>
                  {fleets.map((f) => {
                    const c = f.captured; const has = c.metalium || c.carbonum || c.plutonium;
                    return <td key={f.id} className="roid-count" style={has ? { color: "var(--carbonum)" } : undefined}>
                      {has ? `${fmt(c.metalium)}/${fmt(c.carbonum)}/${fmt(c.plutonium)} roids` : "—"}
                    </td>;
                  })}
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
        <h2>🚀 Enviar frota</h2>
        <div className="cost" style={{ marginBottom: 10 }}>
          Digite as coordenadas do alvo, escolha a ação e a frota (carregada e na base).
          Mesma galáxia = só defesa; outra galáxia = atacar.
        </div>
        {fleets.filter((f) => f.idle && f.totalShips > 0).length === 0 ? (
          <div className="roid-count">Nenhuma frota carregada na base. Transfira naves pra uma frota acima.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="roid-count">Coords:</span>
            <input type="number" min={1} title="Galáxia" value={dGalaxy} onChange={(e) => setDGalaxy(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 6px", textAlign: "center" }} />
            <span>:</span>
            <input type="number" min={1} title="Sistema" value={dSystem} onChange={(e) => setDSystem(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 6px", textAlign: "center" }} />
            <span>:</span>
            <input type="number" min={1} title="Slot" value={dSlot} onChange={(e) => setDSlot(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 6px", textAlign: "center" }} />
            <select value={dMission} onChange={(e) => setDMission(e.target.value as any)} style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
              <option value="attack">Atacar</option>
              <option value="transport">Defender</option>
            </select>
            <select value={dTicks} disabled={dFake} onChange={(e) => setDTicks(Number(e.target.value))} title={dFake ? "finta não engaja" : dMission === "attack" ? "ticks de combate" : "ticks de defesa"} style={{ width: "auto", margin: 0, opacity: dFake ? 0.4 : 1, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
              <option value={1}>{dMission === "attack" ? "atacar" : "defender"} 1 tick</option>
              <option value={2}>{dMission === "attack" ? "atacar" : "defender"} 2 ticks</option>
              <option value={3}>{dMission === "attack" ? "atacar" : "defender"} 3 ticks</option>
            </select>
            <label className="roid-count" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }} title="Finta: a frota vai até a órbita do alvo e volta SEM engajar — só pra enganar/forçar reação do inimigo.">
              <input type="checkbox" checked={dFake} onChange={(e) => setDFake(e.target.checked)} style={{ width: "auto", margin: 0 }} />
              {dMission === "attack" ? "🎭 ataque falso" : "🎭 defesa falsa"}
            </label>
            <select value={dFleet} onChange={(e) => setDFleet(e.target.value)} style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
              <option value="">escolha a frota...</option>
              {fleets.filter((f) => f.idle && f.totalShips > 0).map((f) => <option key={f.id} value={f.id}>{f.name} ({fmt(f.totalShips)} naves)</option>)}
            </select>
            <button disabled={busy || !dFleet} onClick={dispatch}>{busy ? "..." : "🚀 enviar"}</button>
          </div>
        )}
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
