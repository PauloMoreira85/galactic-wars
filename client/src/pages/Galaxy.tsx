import { useEffect, useState } from "react";
import { api, REFRESH_MS, type PlanetView } from "../api";
import { CoordLink } from "../components/CoordLink";
import { IntelReport } from "../components/IntelReport";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

// Cores dos cargos de governo (igual ao original): CG amarelo, MG vermelho, ME azul, MD laranja.
const ROLE_COLOR: Record<string, string> = { cg: "#ffd23f", mg: "#ff5050", me: "#3aa0ff", md: "#ff9a2b" };
const ROLE_TAG: Record<string, string> = { cg: "(CG)", mg: "(MG)", me: "(ME)", md: "(MD)" };
const ROLE_LABEL: Record<string, string> = { cg: "Comandante da Galáxia", mg: "Ministro da Guerra", me: "Ministro da Economia", md: "Ministro da Diplomacia" };

export function Galaxy({ view, onChanged, onMessage, gotoCoords }: { view: PlanetView; onChanged: () => void; onMessage?: (coords: string) => void; gotoCoords?: string }) {
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
  const [fake, setFake] = useState(false);
  // Última espionagem (hash) de cada alvo que eu já espionei, por coordenada.
  const [spyByCoord, setSpyByCoord] = useState<Record<string, string>>({});

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

  // gotoCoords = "setor:paralelo:slot#ts" (link do ranking/tráfego) → pula pra essa
  // galáxia. Vazio (aberto pelo menu) → volta pra galáxia do próprio jogador.
  // O #ts garante re-navegar mesmo clicando na mesma coord.
  useEffect(() => {
    if (!gotoCoords) { setGalaxy(g || 1); setSystem(s || 1); return; }
    const [gg, ss] = gotoCoords.split("#")[0].split(":").map(Number);
    if (gg >= 1 && gg <= 10) setGalaxy(gg);
    if (ss >= 1 && ss <= 6) setSystem(ss);
  }, [gotoCoords]);

  useEffect(() => {
    loadSystem();
    // Atualiza sozinho o sistema visualizado (slots/pontuação/online) a cada 8s.
    const t = setInterval(loadSystem, REFRESH_MS);
    return () => clearInterval(t);
  }, [galaxy, system]);
  useEffect(() => {
    loadFleets();
    const t = setInterval(loadFleets, REFRESH_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { api.markSeen("galaxy"); }, []); // missão tutorial
  // Visão da galáxia: mapa visual ou lista (tabela). Lembra a escolha no navegador.
  const [gview, setGview] = useState<"map" | "list">(() => { try { return (localStorage.getItem("gw_galaxy_view") as "map" | "list") || "map"; } catch { return "map"; } });
  function setGalaxyView(v: "map" | "list") { setGview(v); try { localStorage.setItem("gw_galaxy_view", v); } catch {} }
  const [mapSel, setMapSel] = useState<number | null>(null); // planeta selecionado no mapa
  // Tráfego entrante (frotas a caminho do setor) — pras linhas do mapa tático.
  const [traffic, setTraffic] = useState<Awaited<ReturnType<typeof api.traffic>>["fleets"]>([]);
  async function loadTraffic() { try { setTraffic((await api.traffic()).fleets); } catch {} }
  useEffect(() => { loadTraffic(); const t = setInterval(loadTraffic, REFRESH_MS); return () => clearInterval(t); }, []);
  // Convites de galáxia privada pendentes (mostra banner no topo pra aceitar/recusar).
  const [gInvites, setGInvites] = useState<{ galaxy: number; name: string }[]>([]);
  async function loadInvites() { try { setGInvites((await api.privateView()).invites ?? []); } catch {} }
  useEffect(() => { loadInvites(); }, []);
  // Mapeia a espionagem mais recente que EU tenho de cada coordenada (pra "Simular").
  useEffect(() => {
    api.spyReports().then((d) => {
      const map: Record<string, string> = {};
      for (const r of d.reports) if (!map[r.targetCoords]) map[r.targetCoords] = r.hash; // reports vêm do mais novo
      setSpyByCoord(map);
    }).catch(() => {});
  }, []);

  // Abre a Calculadora (aba nova) com a defesa já carregada da espionagem do alvo.
  function simulate(coords: string) {
    const hash = spyByCoord[coords];
    try { localStorage.setItem("gw_calc_preset", JSON.stringify({ defHash: hash ?? "", at: Date.now() })); } catch {}
    window.open("/ferramentas?tool=calculadora", "_blank", "noopener");
  }

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
      await api.dispatchFleet(fleetId, { galaxy, system, slot: target.slot, mission, ticks: atkTicks, fake });
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

  // Minha tag de aliança (pra marcar aliados de aliança em outras galáxias).
  const myAllianceTag = data?.slots?.find((x: any) => `${galaxy}:${system}:${x.slot}` === myCoords)?.allianceTag ?? null;

  // Alcance de ataque: 🟢 pode atacar / 🔴 não pode (mesma galáxia, aliança, proteção ou fora de range).
  const myScore = view.planet.score;
  function attackRange(sl: any): { ok: boolean; why: string } | null {
    if (`${galaxy}:${system}:${sl.slot}` === myCoords) return null; // é você
    if (sameGalaxy) return { ok: false, why: "Mesma galáxia (aliado) — só defesa" };
    if (myAllianceTag && sl.allianceTag === myAllianceTag) return { ok: false, why: `Mesma aliança [${myAllianceTag}] — aliados não se atacam` };
    if (sl.protected) return { ok: false, why: "Sob proteção de novato" };
    if ((view.game?.tickNumber ?? 0) < 72) return { ok: false, why: "Proteção inicial do jogo (tick < 72)" };
    if (myScore > 0 && (sl.score ?? 0) < (myScore * 50) / 100) return { ok: false, why: "Fora de alcance (alvo < 50% da sua pontuação)" };
    return { ok: true, why: "No alcance — você pode atacar" };
  }

  return (
    <>
      {gInvites.map((inv) => (
        <div className="panel" key={inv.galaxy} style={{ borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>🔒 Convite para a galáxia privada <b>"{inv.name}"</b> — quer entrar?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy} onClick={async () => { setBusy(true); try { await api.privateJoin(inv.galaxy); await loadInvites(); onChanged(); } finally { setBusy(false); } }}>aceitar e mudar pra lá</button>
              <button className="link" disabled={busy} style={{ color: "var(--danger)" }} onClick={async () => { setBusy(true); try { await api.privateDecline(inv.galaxy); await loadInvites(); } finally { setBusy(false); } }}>recusar</button>
            </div>
          </div>
        </div>
      ))}
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
            <button className="galnav-vert" title="Setor +1" onClick={() => setGalaxy((v) => Math.min(10, v + 1))}>∧</button>
            <div className="galnav-coords">
              <input type="number" min={1} max={10} value={galaxy} title="Setor (1-5 públicos · 6-10 privados)" onChange={(e) => setGalaxy(Math.max(1, Math.min(10, Number(e.target.value))))} />
              <input type="number" min={1} max={6} value={system} title="Paralelo (1-6)" onChange={(e) => setSystem(Math.max(1, Math.min(6, Number(e.target.value))))} />
            </div>
            <div className="galnav-row">
              <button title="Paralelo anterior" onClick={() => setSystem((v) => Math.max(1, v - 1))}>‹</button>
              <button className="galnav-go" onClick={() => loadSystem()}>Visualizar</button>
              <button title="Próximo paralelo" onClick={() => setSystem((v) => Math.min(6, v + 1))}>›</button>
            </div>
            <button className="galnav-vert" title="Setor -1" onClick={() => setGalaxy((v) => Math.max(1, v - 1))}>∨</button>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "8px 0" }}>
          <div className="roid-count">seu planeta: {myCoords} · agentes que você tem: {(["P","M","T","D"] as const).filter(a=>agentsIHave[a]).join(" ") || "nenhum"}</div>
          <div className="auth-tabs" style={{ margin: 0 }}>
            <button className={gview === "map" ? "active" : ""} onClick={() => setGalaxyView("map")}>🗺️ Mapa</button>
            <button className={gview === "list" ? "active" : ""} onClick={() => setGalaxyView("list")}>📋 Lista</button>
          </div>
        </div>

        {gview === "map" && data && (() => {
          // ===== Radar de setor: planetas em círculo + linhas de tráfego =====
          const slots = data.slots;
          const N = slots.length;
          const W = 680, H = 520, cx = W / 2, cy = H / 2, R = 180; // raio do anel de planetas
          const pos = (i: number) => { const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N; return { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) }; };
          const slotPos: Record<number, { x: number; y: number }> = {};
          slots.forEach((sl, i) => { slotPos[sl.slot] = pos(i); });
          const kindOf = (sl: any) => {
            const coord = `${galaxy}:${system}:${sl.slot}`;
            if (coord === myCoords) return "self";
            if (sameGalaxy) return "ally-gal";
            if (myAllianceTag && sl.allianceTag === myAllianceTag) return "ally-tag";
            if (sl.protected) return "prot";
            return attackRange(sl)?.ok ? "enemy-ok" : "enemy-no";
          };
          const ORB: Record<string, string> = { self: "#4ea8ff", "ally-gal": "#38d6a0", "ally-tag": "#25d3ff", prot: "#8aa0b8", "enemy-ok": "#ff6a6a", "enemy-no": "#b87a7a" };
          // Frotas entrando num slot DESTE sistema (linhas): só as visíveis.
          const incoming = traffic.filter((f) => {
            const [g, s] = f.target.split(":").map(Number); return g === galaxy && s === system && f.ships > 0;
          });
          const [selSlot, setSel] = [mapSel, setMapSel];
          const selStd = slots.find((s) => s.slot === selSlot && s.occupied) ?? null;
          return (
            <div>
              <div className="gmap-legend">
                <span><i className="dot" style={{ background: "#4ea8ff" }} />você</span>
                <span><i className="dot" style={{ background: "#38d6a0" }} />aliado (galáxia)</span>
                <span><i className="dot" style={{ background: "#25d3ff" }} />aliado (tag)</span>
                <span><i className="dot" style={{ background: "#ff6a6a" }} />alvo</span>
                <span><i className="dot" style={{ background: "#8aa0b8" }} />protegido</span>
                <span><i className="line atk" />ataque a caminho</span>
                <span><i className="line def" />defesa a caminho</span>
              </div>
              <div className="gmap-radar-wrap">
                <svg viewBox={`0 0 ${W} ${H}`} className="gmap-radar" preserveAspectRatio="xMidYMid meet">
                  {/* anéis de radar */}
                  {[R, R * 0.62, R * 0.28].map((rr, k) => <circle key={k} cx={cx} cy={cy} r={rr} className="radar-ring" />)}
                  <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} className="radar-cross" />
                  <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} className="radar-cross" />
                  {/* linhas de tráfego: do planeta de ORIGEM (se neste setor) ou da borda (se vem de fora) até o alvo */}
                  {incoming.map((f, i) => {
                    const tslot = Number(f.target.split(":")[2]); const p = slotPos[tslot]; if (!p) return null;
                    const [og, os, oslot] = f.origin.split(":").map(Number);
                    // Se a frota saiu de um planeta DESTE setor, liga planeta→planeta;
                    // senão (veio de outro setor), entra pela borda do radar.
                    const originHere = og === galaxy && os === system && slotPos[oslot];
                    let ox: number, oy: number;
                    if (originHere) { ox = slotPos[oslot].x; oy = slotPos[oslot].y; }
                    else { const ang = Math.atan2(p.y - cy, p.x - cx); ox = cx + (R + 60) * Math.cos(ang + 0.5); oy = cy + (R + 60) * Math.sin(ang + 0.5); }
                    const cls = f.mission === "attack" ? "traffic atk" : "traffic def";
                    return <g key={i}>
                      <line x1={ox} y1={oy} x2={p.x} y2={p.y} className={cls} />
                      <circle r="3.5" className={`traffic-dot ${f.mission === "attack" ? "atk" : "def"}`}>
                        <animateMotion dur="2.2s" repeatCount="indefinite" path={`M ${ox} ${oy} L ${p.x} ${p.y}`} />
                      </circle>
                    </g>;
                  })}
                  {/* planetas */}
                  {slots.map((sl) => {
                    const p = slotPos[sl.slot];
                    if (!sl.occupied) return <g key={sl.slot}><circle cx={p.x} cy={p.y} r="13" className="planet-empty" /><text x={p.x} y={p.y + 4} className="planet-slot dim">{sl.slot}</text><text x={p.x} y={p.y + 30} className="planet-label dim">vazio</text></g>;
                    const k = kindOf(sl); const col = ORB[k];
                    const sel = sl.slot === selSlot;
                    return (
                      <g key={sl.slot} className="planet-node" onClick={() => setSel(sel ? null : sl.slot)} style={{ cursor: "pointer" }}>
                        {sel && <circle cx={p.x} cy={p.y} r="26" className="planet-sel" />}
                        <circle cx={p.x} cy={p.y} r="17" fill={col} style={{ filter: `drop-shadow(0 0 8px ${col})` }} />
                        <circle cx={p.x - 5} cy={p.y - 5} r="5" fill="#ffffff55" />
                        {/* número do SLOT no centro do planeta */}
                        <text x={p.x} y={p.y + 5} className="planet-slot">{sl.slot}</text>
                        {sl.online === true && <circle cx={p.x + 13} cy={p.y - 13} r="4" className="planet-online" />}
                        {sl.protected && <g><circle cx={p.x + 14} cy={p.y + 13} r="7" className="planet-prot-bg" /><text x={p.x + 14} y={p.y + 16} className="planet-prot">P</text></g>}
                        <text x={p.x} y={p.y + 34} className="planet-label"><tspan className="pl-name">{sl.name}</tspan></text>
                        <text x={p.x} y={p.y + 48} className="planet-label dim">{galaxy}:{system}:{sl.slot} · {sl.commander} · 💎{fmt(sl.roids ?? 0)}</text>
                      </g>
                    );
                  })}
                  {/* núcleo */}
                  <circle cx={cx} cy={cy} r="6" className="radar-core" />
                  <text x={cx} y={cy + 20} className="planet-label dim">setor {galaxy}:{system}</text>
                </svg>
              </div>
              {/* painel do planeta selecionado */}
              {selStd && (() => {
                const coord = `${galaxy}:${system}:${selStd.slot}`; const isSelf = coord === myCoords; const r = attackRange(selStd);
                return (
                  <div className="gmap-sel-panel">
                    <div>
                      <b style={{ fontSize: 15 }}>{selStd.name}</b> <span className="roid-count">[{selStd.raceTag ?? "?"}]{selStd.allianceTag ? ` {${selStd.allianceTag}}` : ""}</span>
                      <div className="roid-count">{selStd.commander}{selStd.role && <span style={{ color: ROLE_COLOR[selStd.role] }}> {ROLE_TAG[selStd.role]}</span>} · <CoordLink c={coord} /> · 💎{fmt(selStd.roids ?? 0)} · {fmt(selStd.score ?? 0)} pts · {selStd.rank}º</div>
                      {!isSelf && r && <div className="roid-count" style={{ color: r.ok ? "var(--carbonum)" : "var(--muted)" }}>{r.ok ? "🟢 " : "🔴 "}{r.why}</div>}
                    </div>
                    {!isSelf && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => pickTarget(selStd.slot, selStd.name!)}>🚀 frota</button>
                        <button onClick={() => onMessage?.(coord)}>✉ msg</button>
                        {(["P","M","T","D"] as const).map((a) => (
                          <button key={a} disabled={!agentsIHave[a]} title={agentsIHave[a] ? `Espionar (${a})` : `Sem agentes ${a}`} onClick={() => doSpy(selStd.slot, a)} style={{ opacity: agentsIHave[a] ? 1 : 0.3 }}>{a}</button>
                        ))}
                      </div>
                    )}
                    {isSelf && <span className="roid-count">seu planeta</span>}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {gview === "list" && (
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
        )}
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
            <h2>🛰️ Espionagem [{spy.agent}] — {spy.name} (<CoordLink c={spy.coords} />)</h2>
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
              value={fake ? `${mission}_fake` : mission}
              onChange={(e) => {
                const v = e.target.value;
                const f = v.endsWith("_fake");
                const m = v.replace("_fake", "") as "attack" | "transport";
                setFake(f); setMission(m);
                // ataque: máx 3 ticks · defesa: máx 6. Ajusta se passou do teto.
                setAtkTicks((t) => Math.min(t, m === "transport" ? 6 : 3));
              }}
              disabled={sameGalaxy}
              title="Falso = a frota vai até a órbita e volta SEM engajar (finta, pra enganar o inimigo)"
              style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}
            >
              {!sameGalaxy && <option value="attack">⚔️ Atacar</option>}
              <option value="transport">🛡️ Defender</option>
              {!sameGalaxy && <option value="attack_fake">🎭 Ataque falso</option>}
              <option value="transport_fake">🎭 Defesa falsa</option>
            </select>
            {!fake && (
              <>
                <span>· {mission === "attack" ? "atacar" : "defender"} por:</span>
                <select value={atkTicks} onChange={(e) => setAtkTicks(Number(e.target.value))}
                  style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}>
                  {Array.from({ length: mission === "transport" ? 6 : 3 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} tick{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </>
            )}
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
          <div style={{ marginTop: 12, display: "flex", gap: 14, alignItems: "center" }}>
            <button className="link" onClick={() => setTarget(null)}>cancelar</button>
            {!sameGalaxy && (() => {
              const coords = `${galaxy}:${system}:${target.slot}`;
              const hasSpy = !!spyByCoord[coords];
              return (
                <button className="link" title={hasSpy ? "Abre a Calculadora com a frota espionada deste alvo já na defesa" : "Abre a Calculadora (você ainda não espionou este alvo — monte a defesa à mão)"}
                  onClick={() => simulate(coords)}>
                  🎯 Simular combate {hasSpy ? "(alvo espionado ✓)" : "(sem espionagem)"}
                </button>
              );
            })()}
          </div>
        </div>
      )}

    </>
  );
}
