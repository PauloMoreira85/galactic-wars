import { useEffect, useState } from "react";
import { api, type PlanetView } from "../api";
import { IntelReport } from "../components/IntelReport";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

// Cores dos cargos de governo (igual ao original): CG amarelo, MG vermelho, ME azul, MD laranja.
const ROLE_COLOR: Record<string, string> = { cg: "#ffd23f", mg: "#ff5050", me: "#3aa0ff", md: "#ff9a2b" };
const ROLE_TAG: Record<string, string> = { cg: "(CG)", mg: "(MG)", me: "(ME)", md: "(MD)" };
const ROLE_LABEL: Record<string, string> = { cg: "Comandante da Galáxia", mg: "Ministro da Guerra", me: "Ministro da Economia", md: "Ministro da Diplomacia" };

export function Galaxy({ view, onChanged, onMessage }: { view: PlanetView; onChanged: () => void; onMessage?: (coords: string) => void }) {
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
  const [atkTicks, setAtkTicks] = useState(3);

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
    // Atualiza sozinho o sistema visualizado (slots/pontuação/online) a cada 8s.
    const t = setInterval(loadSystem, 8000);
    return () => clearInterval(t);
  }, [galaxy, system]);
  useEffect(() => {
    loadFleets();
    const t = setInterval(loadFleets, 8000);
    return () => clearInterval(t);
  }, []);

  // Mesma galáxia (= mesmo setor E paralelo) = aliados: só transporte (não pode atacar).
  const myGalaxy = g || 1;
  const mySystem = s || 1;
  const sameGalaxy = galaxy === myGalaxy && system === mySystem;

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
      await api.dispatchFleet(fleetId, { galaxy, system, slot: target.slot, mission, ticks: atkTicks });
      setTarget(null);
      await loadFleets();
      onChanged();
    } catch (e: any) {
      setError(e.message ?? "Falha ao enviar");
    } finally {
      setBusy(false);
    }
  }


  async function doSpy(slot: number, agent: "P" | "M" | "T" | "D") {
    setError(""); setSpy(null);
    try {
      const r = await api.spy(galaxy, system, slot, agent);
      if (r.failed || !r.intel) setError(r.error ?? "Espionagem falhou");
      else setSpy({ ...r.intel, _hash: r.hash });
    } catch (e: any) { setError(e.message ?? "Falha"); }
    // Rola até o resultado/erro (aparece abaixo da tabela) pra ficar visível.
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 120);
  }

  const myCoords = view.planet.coords;
  function idle(ms?: number) {
    if (ms == null) return "";
    const m = Math.floor(ms / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
  }
  const agentsIHave = data?.agents ?? { P: false, M: false, T: false, D: false };

  // Alcance de ataque: 🟢 pode atacar / 🔴 não pode (mesma galáxia, proteção ou fora de range).
  const myScore = view.planet.score;
  function attackRange(sl: any): { ok: boolean; why: string } | null {
    if (`${galaxy}:${system}:${sl.slot}` === myCoords) return null; // é você
    if (sameGalaxy) return { ok: false, why: "Mesma galáxia (aliado) — só defesa" };
    if (sl.protected) return { ok: false, why: "Sob proteção de novato" };
    if ((view.game?.tickNumber ?? 0) < 72) return { ok: false, why: "Proteção inicial do jogo (tick < 72)" };
    if (myScore > 0 && (sl.score ?? 0) < (myScore * 50) / 100) return { ok: false, why: "Fora de alcance (alvo < 50% da sua pontuação)" };
    return { ok: true, why: "No alcance — você pode atacar" };
  }

  return (
    <>
      <div className="panel">
        {/* Cabeçalho da galáxia */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div>
            <h2 style={{ marginBottom: 2 }}>{data?.name ? data.name : `Galáxia ${galaxy}:${system}`}</h2>
            <div className="roid-count">
              Pontuação: <b style={{ color: "var(--text)" }}>{fmt(data?.score ?? 0)}</b> · Rank: <b style={{ color: "var(--text)" }}>{data?.rank ?? "—"}º</b>
              {data?.morale != null && <> · Moral: <b style={{ color: "var(--text)" }}>{data.morale}</b></>}
            </div>
            </div>
          </div>
          <div className="galnav">
            <button className="galnav-vert" title="Paralelo +1" onClick={() => setSystem((v) => Math.min(6, v + 1))}>∧</button>
            <div className="galnav-coords">
              <input type="number" min={1} max={5} value={galaxy} title="Setor (1-5)" onChange={(e) => setGalaxy(Math.max(1, Math.min(5, Number(e.target.value))))} />
              <input type="number" min={1} max={6} value={system} title="Paralelo (1-6)" onChange={(e) => setSystem(Math.max(1, Math.min(6, Number(e.target.value))))} />
            </div>
            <div className="galnav-row">
              <button title="Setor anterior" onClick={() => setGalaxy((v) => Math.max(1, v - 1))}>‹</button>
              <button className="galnav-go" onClick={() => loadSystem()}>Visualizar</button>
              <button title="Próximo setor" onClick={() => setGalaxy((v) => Math.min(5, v + 1))}>›</button>
            </div>
            <button className="galnav-vert" title="Paralelo -1" onClick={() => setSystem((v) => Math.max(1, v - 1))}>∨</button>
          </div>
        </div>
        <div className="roid-count" style={{ margin: "8px 0" }}>seu planeta: {myCoords} · agentes que você tem: {(["P","M","T","D"] as const).filter(a=>agentsIHave[a]).join(" ") || "nenhum"}</div>

        <table>
          <thead>
            <tr><th>Slot</th><th>St</th><th>Ativ</th><th>Líder</th><th>Planeta</th><th>Roids</th><th>Pontuação</th><th>Rank</th><th title="🟢 pode atacar · 🔴 não pode">Alcance</th><th>Agentes</th><th></th></tr>
          </thead>
          <tbody>
            {data?.slots.map((sl) => {
              const isSelf = `${galaxy}:${system}:${sl.slot}` === myCoords;
              if (!sl.occupied) return (
                <tr key={sl.slot} style={{ opacity: 0.35 }}><td className="rank-num">{sl.slot}</td><td colSpan={10} className="roid-count">— vazio —</td></tr>
              );
              return (
                <tr key={sl.slot} style={isSelf ? { background: "rgba(79,124,255,0.12)" } : undefined}>
                  <td className="rank-num">{sl.slot}</td>
                  <td title={sl.online == null ? "visível só na sua galáxia" : sl.online ? "online" : "offline"}>{sl.online == null ? "—" : sl.online ? "🟢" : "⚫"}</td>
                  <td className="roid-count">{sl.idleMs == null ? "—" : idle(sl.idleMs)}</td>
                  <td>
                    <span style={sl.role ? { color: ROLE_COLOR[sl.role], fontWeight: 700, textShadow: `0 0 6px ${ROLE_COLOR[sl.role]}` } : undefined}
                      title={sl.role ? ROLE_LABEL[sl.role] : undefined}>
                      {sl.commander}
                    </span>
                    {sl.role && <span className="roid-count" style={{ color: ROLE_COLOR[sl.role] }}> {ROLE_TAG[sl.role]}</span>}
                  </td>
                  <td><span className="roid-count">{sl.preposition ?? "de"} </span><b>{sl.name}</b> <span className="roid-count">[{sl.raceTag ?? "?"}]</span>{sl.allianceTag && <span style={{ color: "var(--accent)" }}> {`{${sl.allianceTag}}`}</span>}{sl.protected && <span className="prot-badge" title="Proteção de novato — não pode ser atacado">P</span>}</td>
                  <td>{fmt(sl.roids ?? 0)}</td>
                  <td>{fmt(sl.score ?? 0)}</td>
                  <td className="roid-count">{sl.rank}º</td>
                  <td>{(() => { const r = attackRange(sl); return r == null ? <span className="roid-count">—</span> : <span title={r.why}>{r.ok ? "🟢" : "🔴"}</span>; })()}</td>
                  <td>
                    {isSelf ? <span className="roid-count">—</span> : (["P","M","T","D"] as const).map((a) => (
                      <button key={a} disabled={!agentsIHave[a]} title={agentsIHave[a] ? `Espionar com agente ${a}` : `Sem agentes ${a} treinados — treine na Inteligência`}
                        onClick={() => doSpy(sl.slot, a)}
                        style={{ padding: "1px 6px", marginRight: 2, fontSize: 12, opacity: agentsIHave[a] ? 1 : 0.3 }}>{a}</button>
                    ))}
                  </td>
                  <td>
                    {!isSelf && (
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button onClick={() => pickTarget(sl.slot, sl.name!)}>frota</button>
                        <button title="Mensagem privada" onClick={() => onMessage?.(`${galaxy}:${system}:${sl.slot}`)}>✉</button>
                      </span>
                    )}
                    {isSelf && <span className="roid-count">você</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}

      {data?.flag && (
        <div className="panel" style={{ textAlign: "center" }}>
          <h2>Bandeira da Galáxia</h2>
          <img src={data.flag} alt="Bandeira da Galáxia" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, border: "1px solid var(--border)", marginTop: 8 }} />
        </div>
      )}

      {spy && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <h2>🛰️ Espionagem [{spy.agent}] — {spy.name} ({spy.coords})</h2>
            <button className="link" onClick={() => setSpy(null)}>fechar</button>
          </div>
          {spy._hash && (
            <div className="cost" style={{ margin: "6px 0" }}>
              📋 Código pra compartilhar: <b style={{ color: "var(--accent)", letterSpacing: 1 }}>{spy._hash}</b>{" "}
              <button className="link" onClick={() => navigator.clipboard?.writeText(spy._hash)}>copiar</button>
              <div className="roid-count">Outros jogadores abrem em Ferramentas → Visualizar Espionagem.</div>
            </div>
          )}
          <IntelReport intel={spy} />
        </div>
      )}

      {target && (
        <div className="panel">
          <h2>Enviar frota → {galaxy}:{system}:{target.slot} ({target.name})</h2>
          <div className="cost" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>Distância: <b>+{penalty ?? "?"}</b> tick(s)</span>
            <span>· missão:</span>
            <select
              value={mission}
              onChange={(e) => setMission(e.target.value as any)}
              disabled={sameGalaxy}
              style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}
            >
              {!sameGalaxy && <option value="attack">Atacar</option>}
              <option value="transport">Defender</option>
            </select>
            <span>· {mission === "attack" ? "atacar" : "defender"} por:</span>
            <select value={atkTicks} onChange={(e) => setAtkTicks(Number(e.target.value))}
              style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}>
              <option value={1}>1 tick</option>
              <option value={2}>2 ticks</option>
              <option value={3}>3 ticks</option>
            </select>
          </div>
          {sameGalaxy && (
            <div className="cost" style={{ color: "var(--carbonum)" }}>
              🤝 Planetas da sua galáxia ({myGalaxy}:{mySystem}) são aliados — só é possível <b>defender</b>. Para atacar, mire em outra galáxia.
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
                  <div className="roid-count">chega em {eta}t · ⛽ {fmt(f.travel.fuel)} plutonium{noFuel ? " (insuficiente)" : ""}</div>
                </div></div>
                <button disabled={busy || noFuel} onClick={() => dispatch(f.id)}>{busy ? "..." : "🚀 enviar"}</button>
              </div>
            );
          })}
          {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
          <div style={{ marginTop: 12 }}><button className="link" onClick={() => setTarget(null)}>cancelar</button></div>
        </div>
      )}

    </>
  );
}
