import { useEffect, useState } from "react";
import { api, type PlanetView } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

// Cores dos cargos de governo (igual ao original): CG amarelo, MG vermelho, ME azul, MD laranja.
const ROLE_COLOR: Record<string, string> = { cg: "#ffd23f", mg: "#ff5050", me: "#3aa0ff", md: "#ff9a2b" };
const ROLE_TAG: Record<string, string> = { cg: "(CG)", mg: "(MG)", me: "(ME)", md: "(MD)" };
const ROLE_LABEL: Record<string, string> = { cg: "Comandante da Galáxia", mg: "Ministro da Guerra", me: "Ministro da Economia", md: "Ministro da Diplomacia" };

export function Galaxy({ view, onChanged }: { view: PlanetView; onChanged: () => void }) {
  // Coordenadas do proprio planeta como ponto de partida da navegacao.
  const [g, s] = view.planet.coords.split(":").map(Number);
  const [galaxy, setGalaxy] = useState(g || 1);
  const [system, setSystem] = useState(s || 1);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.galaxy>> | null>(null);
  const [fleets, setFleets] = useState<Awaited<ReturnType<typeof api.fleets>>["fleets"]>([]);
  const [target, setTarget] = useState<{ slot: number; name: string } | null>(null);
  const [mission, setMission] = useState<"attack" | "transport">("attack");
  const [penalty, setPenalty] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [spy, setSpy] = useState<any | null>(null);

  // Frotas prontas na base (carregadas) que podem ser enviadas.
  const idleFleets = fleets.filter((f) => f.idle && f.totalShips > 0);

  async function loadSystem() {
    setError("");
    try {
      setData(await api.galaxy(galaxy, system));
    } catch (e: any) {
      setError(e.message ?? "Falha");
    }
  }
  async function loadFleets() {
    try {
      setFleets((await api.fleets()).fleets);
    } catch {}
  }

  useEffect(() => {
    loadSystem();
  }, [galaxy, system]);
  useEffect(() => {
    loadFleets();
    const t = setInterval(loadFleets, 10000);
    return () => clearInterval(t);
  }, []);

  // Mesma galáxia = aliados: só transporte (não pode atacar).
  const myGalaxy = g || 1;
  const sameGalaxy = galaxy === myGalaxy;

  async function pickTarget(slot: number, name: string) {
    setTarget({ slot, name });
    setError("");
    setMission(sameGalaxy ? "transport" : "attack");
    try {
      setPenalty((await api.travel(galaxy, system, slot)).penalty);
    } catch {
      setPenalty(null);
    }
  }

  async function dispatch(fleetId: string) {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      await api.dispatchFleet(fleetId, { galaxy, system, slot: target.slot, mission });
      setTarget(null);
      await loadFleets();
      onChanged();
    } catch (e: any) {
      setError(e.message ?? "Falha ao enviar");
    } finally {
      setBusy(false);
    }
  }


  async function recall(id: string) {
    try {
      await api.recallFleet(id);
      await loadFleets();
    } catch (e: any) {
      setError(e.message ?? "Falha ao recuar");
    }
  }

  async function doSpy(slot: number, agent: "P" | "M" | "T" | "D") {
    setError(""); setSpy(null);
    try {
      const r = await api.spy(galaxy, system, slot, agent);
      if (r.failed || !r.intel) setError(r.error ?? "Espionagem falhou");
      else setSpy({ ...r.intel, _hash: r.hash });
    } catch (e: any) { setError(e.message ?? "Falha"); }
  }

  async function doAutoExile() {
    if (!window.confirm(`Auto-exílio: seu planeta vai cair numa galáxia aleatória (não-privada). Restam ${view.planet.autoExiles}. Confirmar?`)) return;
    setError("");
    try { await api.autoExile(); onChanged(); }
    catch (e: any) { setError(e.message ?? "Falha"); }
  }

  const myCoords = view.planet.coords;
  const statusLabel: Record<string, string> = {
    outbound: "→ indo", engaged: "⚔️ em combate", returning: "↩ voltando",
  };
  function idle(ms?: number) {
    if (ms == null) return "";
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
  }
  const agentsIHave = data?.agents ?? { P: false, M: false, T: false, D: false };

  return (
    <>
      <div className="panel">
        {/* Cabeçalho da galáxia */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {data?.flag && <img src={data.flag} alt="bandeira" style={{ height: 40, borderRadius: 4, border: "1px solid var(--border)" }} />}
            <div>
            <h2 style={{ marginBottom: 2 }}>{data?.name ? data.name : `Galáxia ${galaxy}`}</h2>
            <div className="roid-count">
              Pontuação: <b style={{ color: "var(--text)" }}>{fmt(data?.score ?? 0)}</b> · Rank: <b style={{ color: "var(--text)" }}>{data?.rank ?? "—"}º</b>
              {data?.morale != null && <> · Moral: <b style={{ color: "var(--text)" }}>{data.morale}</b></>}
            </div>
            </div>
          </div>
          <div className="galnav">
            <button className="galnav-vert" title="Setor +1" onClick={() => setSystem((v) => v + 1)}>∧</button>
            <div className="galnav-coords">
              <input type="number" min={1} value={galaxy} title="Galáxia" onChange={(e) => setGalaxy(Math.max(1, Number(e.target.value)))} />
              <input type="number" min={1} value={system} title="Setor/Sistema" onChange={(e) => setSystem(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="galnav-row">
              <button title="-3 galáxias" onClick={() => setGalaxy((v) => Math.max(1, v - 3))}>«</button>
              <button title="Galáxia anterior" onClick={() => setGalaxy((v) => Math.max(1, v - 1))}>‹</button>
              <button className="galnav-go" onClick={() => loadSystem()}>Visualizar</button>
              <button title="Próxima galáxia" onClick={() => setGalaxy((v) => v + 1)}>›</button>
              <button title="+3 galáxias" onClick={() => setGalaxy((v) => v + 3)}>»</button>
            </div>
            <button className="galnav-vert" title="Setor -1" onClick={() => setSystem((v) => Math.max(1, v - 1))}>∨</button>
          </div>
        </div>
        <div className="roid-count" style={{ margin: "8px 0" }}>seu planeta: {myCoords} · agentes que você tem: {(["P","M","T","D"] as const).filter(a=>agentsIHave[a]).join(" ") || "nenhum"}</div>

        <table>
          <thead>
            <tr><th>Slot</th><th>St</th><th>Ativ</th><th>Líder</th><th>Planeta</th><th>Roids</th><th>Pontuação</th><th>Rank</th><th>Agentes</th><th></th></tr>
          </thead>
          <tbody>
            {data?.slots.map((sl) => {
              const isSelf = `${galaxy}:${system}:${sl.slot}` === myCoords;
              if (!sl.occupied) return (
                <tr key={sl.slot} style={{ opacity: 0.35 }}><td className="rank-num">{sl.slot}</td><td colSpan={9} className="roid-count">— vazio —</td></tr>
              );
              return (
                <tr key={sl.slot} style={isSelf ? { background: "rgba(79,124,255,0.12)" } : undefined}>
                  <td className="rank-num">{sl.slot}</td>
                  <td title={sl.online ? "online" : "offline"}>{sl.online ? "🟢" : "⚫"}</td>
                  <td className="roid-count">{idle(sl.idleMs)}</td>
                  <td>
                    <span style={sl.role ? { color: ROLE_COLOR[sl.role], fontWeight: 700, textShadow: `0 0 6px ${ROLE_COLOR[sl.role]}` } : undefined}
                      title={sl.role ? ROLE_LABEL[sl.role] : undefined}>
                      {sl.commander}
                    </span>
                    {sl.role && <span className="roid-count" style={{ color: ROLE_COLOR[sl.role] }}> {ROLE_TAG[sl.role]}</span>}
                  </td>
                  <td><b>{sl.name}</b> <span className="roid-count">[{sl.raceTag}]</span>{sl.allianceTag && <span style={{ color: "var(--accent)" }}> {`{${sl.allianceTag}}`}</span>}{sl.protected && <span title="Proteção de novato — não pode ser atacado" style={{ color: "var(--carbonum)" }}> 🛡️</span>}</td>
                  <td>{fmt(sl.roids ?? 0)}</td>
                  <td>{fmt(sl.score ?? 0)}</td>
                  <td className="roid-count">{sl.rank}º</td>
                  <td>
                    {isSelf ? <span className="roid-count">—</span> : (["P","M","T","D"] as const).map((a) => (
                      <button key={a} disabled={!agentsIHave[a]} title={agentsIHave[a] ? `Espionar com agente ${a}` : `Sem agente ${a}`}
                        onClick={() => doSpy(sl.slot, a)}
                        style={{ padding: "1px 6px", marginRight: 2, fontSize: 12, opacity: agentsIHave[a] ? 1 : 0.3 }}>{a}</button>
                    ))}
                  </td>
                  <td>{!isSelf && <button onClick={() => pickTarget(sl.slot, sl.name!)}>frota</button>}{isSelf && <span className="roid-count">você</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {spy && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2>🛰️ Espionagem [{spy.agent}] — {spy.name} ({spy.coords})</h2>
            <button className="link" onClick={() => setSpy(null)}>fechar</button>
          </div>
          <div className="cost">Comandante: {spy.commander} · Raça: {spy.race}{spy.online != null && ` · ${spy.online ? "online" : "offline"}`}</div>
          {spy._hash && (
            <div className="cost" style={{ margin: "6px 0" }}>
              📋 Código pra compartilhar: <b style={{ color: "var(--accent)", letterSpacing: 1 }}>{spy._hash}</b>{" "}
              <button className="link" onClick={() => navigator.clipboard?.writeText(spy._hash)}>copiar</button>
              <div className="roid-count">Outros jogadores abrem em Ferramentas → Visualizar Espionagem.</div>
            </div>
          )}
          {spy.score != null && <div className="roid-count">Pontuação: {fmt(spy.score)}</div>}
          {spy.roids && <div className="roid-count">Roids: {fmt(spy.roids.metalium)} M · {fmt(spy.roids.carbonum)} C · {fmt(spy.roids.plutonium)} P</div>}
          {spy.totalShips != null && <div className="roid-count">Total de naves: {fmt(spy.totalShips)} (sem detalhe — use agente M)</div>}
          {spy.ships && <table><thead><tr><th>Nave</th><th>Qtd</th></tr></thead><tbody>{spy.ships.map((s: any) => <tr key={s.name}><td>{s.name}</td><td>{fmt(s.count)}</td></tr>)}</tbody></table>}
          {spy.news && (
            <div>
              <div className="cost">Notícias do alvo:</div>
              {spy.news.length === 0 ? <div className="roid-count">sem notícias</div> : spy.news.map((n: string, i: number) => <div key={i} className="roid-count">{n}</div>)}
            </div>
          )}
          {spy.note && <div className="roid-count">{spy.note}</div>}
          {spy.fleets && (
            <table><thead><tr><th>Missão</th><th>Estado</th><th>Destino</th><th>Chega</th><th>Naves</th></tr></thead>
              <tbody>{spy.fleets.length === 0 ? <tr><td colSpan={5} className="roid-count">nenhuma frota em movimento</td></tr> : spy.fleets.map((f: any, i: number) => (
                <tr key={i}><td>{f.mission}</td><td>{f.status}</td><td>{f.target}</td><td>{f.ticksRemaining}t</td>
                <td className="roid-count">{Object.entries(f.units).map(([n, c]) => `${n}:${c}`).join(", ")}</td></tr>
              ))}</tbody></table>
          )}
        </div>
      )}

      {target && (
        <div className="panel">
          <h2>Enviar frota → {galaxy}:{system}:{target.slot} ({target.name})</h2>
          <div className="cost">
            Distância: <span>+{penalty ?? "?"} tick(s)</span> · missão:{" "}
            <select
              value={mission}
              onChange={(e) => setMission(e.target.value as any)}
              disabled={sameGalaxy}
              style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px" }}
            >
              {!sameGalaxy && <option value="attack">Atacar</option>}
              <option value="transport">Transportar (defesa)</option>
            </select>
          </div>
          {sameGalaxy && (
            <div className="cost" style={{ color: "var(--carbonum)" }}>
              🤝 Planetas da sua galáxia ({myGalaxy}) são aliados — só é possível <b>transportar</b> (defesa). Para atacar, mire em outra galáxia.
            </div>
          )}
          <div className="cost" style={{ margin: "8px 0" }}>Escolha uma frota pronta na base para enviar:</div>
          {idleFleets.length === 0 ? (
            <div className="roid-count">Nenhuma frota carregada. Vá em <b>Frotas</b>, crie/carregue uma e volte aqui.</div>
          ) : idleFleets.map((f) => {
            const eta = (penalty ?? 0) + f.travel.galaxia;
            const noFuel = f.travel.fuel > view.planet.resources.plutonium;
            return (
              <div className="roid-row" key={f.id}>
                <div className="roid-label"><div>
                  <div><b>{f.name}</b> <span className="roid-count">{fmt(f.totalShips)} naves</span></div>
                  <div className="roid-count">chega em {eta}t · ⛽ {fmt(f.travel.fuel)} plutônio{noFuel ? " (insuficiente)" : ""}</div>
                </div></div>
                <button disabled={busy || noFuel} onClick={() => dispatch(f.id)}>{busy ? "..." : "🚀 enviar"}</button>
              </div>
            );
          })}
          {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
          <div style={{ marginTop: 12 }}><button className="link" onClick={() => setTarget(null)}>cancelar</button></div>
        </div>
      )}

      <div className="panel">
        <h2>Tráfego atual — suas frotas</h2>
        {fleets.length === 0 ? (
          <div className="roid-count">Nenhuma frota em trânsito.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Missão</th><th>Estado</th><th>Destino</th><th>Naves</th><th>Espólio (M/C/P)</th><th>Tempo</th><th></th></tr>
            </thead>
            <tbody>
              {fleets.map((f) => (
                <tr key={f.id}>
                  <td>{f.mission === "attack" ? "⚔️ Atacar" : "📦 Transportar"}</td>
                  <td>{statusLabel[f.status] ?? f.status}</td>
                  <td>{f.target}</td>
                  <td>{fmt(f.totalShips)}</td>
                  <td className="roid-count">
                    {fmt(f.captured.metalium)}/{fmt(f.captured.carbonum)}/{fmt(f.captured.plutonium)}
                  </td>
                  <td>
                    {f.status === "engaged"
                      ? `${f.ticksRemaining} tick(s) de batalha`
                      : `${f.ticksRemaining} tick(s)`}
                  </td>
                  <td>
                    {f.canRecall && (
                      <button onClick={() => recall(f.id)} title="Recuar a frota agora">↩ recuar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>🪂 Auto-exílio</h2>
        <div className="cost">
          Faz o seu planeta cair numa <b>galáxia aleatória</b> (não-privada). Útil pra fugir de uma vizinhança ruim. Você perde os cargos de governo da galáxia atual.
        </div>
        <div className="roid-row">
          <div className="roid-label"><div>
            <div><b>Exilar planeta</b></div>
            <div className="roid-count">restam {view.planet.autoExiles} de 3 auto-exílios</div>
          </div></div>
          <button disabled={view.planet.autoExiles <= 0} onClick={doAutoExile}>
            {view.planet.autoExiles > 0 ? "🪂 auto-exílio" : "sem exílios"}
          </button>
        </div>
      </div>
    </>
  );
}
