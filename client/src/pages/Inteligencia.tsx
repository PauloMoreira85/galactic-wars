import { useState } from "react";
import { api } from "../api";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }

export function Inteligencia() {
  const [g, setG] = useState(1);
  const [s, setS] = useState(1);
  const [slot, setSlot] = useState(1);
  const [spy, setSpy] = useState<any | null>(null);
  const [error, setError] = useState("");

  async function doSpy(agent: "P" | "M" | "T" | "D") {
    setError(""); setSpy(null);
    try {
      const r = await api.spy(g, s, slot, agent);
      if (r.failed || !r.intel) setError(r.error ?? "Espionagem falhou");
      else setSpy(r.intel);
    } catch (e: any) { setError(e.message ?? "Falha"); }
  }

  return (
    <>
      <div className="panel">
        <h2>Inteligência</h2>
        <div className="cost">
          Envie agentes para espionar um planeta. <b>P</b>=Padrão (raça/pontuação/roids/nº naves) · <b>M</b>=Militar (quais naves) · <b>T</b>=Transmissão (notícias) · <b>D</b>=Duplo (frotas). Você precisa ter o agente (construído na Inteligência).
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
          <span className="roid-count">Alvo</span>
          <input type="number" min={1} value={g} onChange={(e) => setG(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
          <span className="roid-count">:</span>
          <input type="number" min={1} value={s} onChange={(e) => setS(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
          <span className="roid-count">:</span>
          <input type="number" min={1} max={15} value={slot} onChange={(e) => setSlot(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
          {(["P", "M", "T", "D"] as const).map((a) => (
            <button key={a} onClick={() => doSpy(a)}>Agente {a}</button>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {spy && (
        <div className="panel">
          <h2>🛰️ [{spy.agent}] {spy.name} ({spy.coords})</h2>
          <div className="cost">Comandante: {spy.commander} · Raça: {spy.race}{spy.online != null && ` · ${spy.online ? "online" : "offline"}`}</div>
          {spy.score != null && <div className="roid-count">Pontuação: {fmt(spy.score)}</div>}
          {spy.roids && <div className="roid-count">Roids: {fmt(spy.roids.metalium)} M · {fmt(spy.roids.carbonum)} C · {fmt(spy.roids.plutonium)} P</div>}
          {spy.totalShips != null && <div className="roid-count">Total de naves: {fmt(spy.totalShips)} (use agente M p/ detalhar)</div>}
          {spy.ships && <table><thead><tr><th>Nave</th><th>Qtd</th></tr></thead><tbody>{spy.ships.map((x: any) => <tr key={x.name}><td>{x.name}</td><td>{fmt(x.count)}</td></tr>)}</tbody></table>}
          {spy.news && (<div><div className="cost">Notícias do alvo:</div>{spy.news.length === 0 ? <div className="roid-count">sem notícias</div> : spy.news.map((n: string, i: number) => <div key={i} className="roid-count">{n}</div>)}</div>)}
          {spy.fleets && (
            <table><thead><tr><th>Missão</th><th>Estado</th><th>Destino</th><th>Chega</th><th>Naves</th></tr></thead>
              <tbody>{spy.fleets.length === 0 ? <tr><td colSpan={5} className="roid-count">nenhuma frota em movimento</td></tr> : spy.fleets.map((f: any, i: number) => (
                <tr key={i}><td>{f.mission}</td><td>{f.status}</td><td>{f.target}</td><td>{f.ticksRemaining}t</td><td className="roid-count">{Object.entries(f.units).map(([n, c]) => `${n}:${c}`).join(", ")}</td></tr>
              ))}</tbody></table>
          )}
        </div>
      )}
    </>
  );
}
