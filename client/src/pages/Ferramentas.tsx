import { useEffect, useState, Fragment } from "react";
import { api } from "../api";
import { IntelReport } from "../components/IntelReport";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

type Tool = "universo" | "unidades" | "techtree" | "calculadora" | "procura" | "rankings" | "graficos" | "espionagem";

const RACE_LABEL: Record<string, string> = {
  Humana: "Humanos", Daharan: "Daharan", Rakshasa: "Rakshasa", "c-Mech": "c-Mech", Insecta: "Insecta",
};

// Kit de Ferramentas — página separada com menu próprio (estilo toolkit do GW).
export function Ferramentas({ onClose }: { onClose: () => void }) {
  const [tool, setTool] = useState<Tool>("universo");

  const MENU: { key: Tool | "voltar"; label: string }[] = [
    { key: "voltar", label: "‹ Tela principal" },
    { key: "universo", label: "Universo" },
    { key: "unidades", label: "Tabela de Unidades" },
    { key: "techtree", label: "Árvore Tecnológica" },
    { key: "calculadora", label: "Calculadora de Combate" },
    { key: "procura", label: "Procura de Planetas" },
    { key: "rankings", label: "Rankings (Galáxias)" },
    { key: "graficos", label: "Gráficos Comparativos" },
    { key: "espionagem", label: "Visualizar Espionagem" },
  ];

  return (
    <div className="tools-layout">
      <aside className="tools-side">
        <div className="tools-brand">🛠️ KIT DE<br />FERRAMENTAS</div>
        {MENU.map((m) => (
          <button
            key={m.key}
            className={`menu-link ${tool === m.key ? "active" : ""}`}
            onClick={() => (m.key === "voltar" ? onClose() : setTool(m.key as Tool))}
          >
            {m.label}
          </button>
        ))}
      </aside>
      <main className="tools-main">
        {tool === "universo" && <Universo />}
        {tool === "unidades" && <TabelaUnidades />}
        {tool === "techtree" && <ArvoreTec />}
        {tool === "calculadora" && <Calculadora />}
        {tool === "procura" && <ProcuraPlanetas />}
        {tool === "rankings" && <RankingGalaxias />}
        {tool === "graficos" && <Graficos />}
        {tool === "espionagem" && <Espionagem />}
      </main>
    </div>
  );
}

function TabelaUnidades() {
  const [units, setUnits] = useState<Awaited<ReturnType<typeof api.toolUnits>>["units"]>([]);
  const [race, setRace] = useState<string>("todas");
  useEffect(() => { api.toolUnits().then((d) => setUnits(d.units)).catch(() => {}); }, []);
  const races = ["todas", ...Array.from(new Set(units.map((u) => u.race)))];
  const shown = race === "todas" ? units : units.filter((u) => u.race === race);

  return (
    <div className="panel">
      <h2>Tabela de Unidades</h2>
      <div style={{ marginBottom: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {races.map((r) => (
          <button key={r} className={`action-tab ${race === r ? "active" : ""}`} style={{ padding: "4px 10px" }} onClick={() => setRace(r)}>
            {r === "todas" ? "Todas" : RACE_LABEL[r] ?? r}
          </button>
        ))}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Nave</th><th>Raça</th><th>Classe</th><th>Alvos</th>
              <th>Ini</th><th>Agi</th><th>Varm</th><th>Qarm</th><th>Pfog</th><th>Fusel</th><th>RP</th>
              <th>M</th><th>C</th><th>Ticks</th><th>Comb</th><th>TEC</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.race + u.name}>
                <td><b>{u.name}</b>{u.roider && " ⛏️"}</td>
                <td className="roid-count">{RACE_LABEL[u.race] ?? u.race}</td>
                <td>{u.classe}</td>
                <td className="roid-count">{u.roider ? "rouba roids" : u.alvos.join(", ") || "—"}</td>
                <td>{u.ini}</td><td>{u.agi}</td><td>{u.varm}</td><td>{u.qarm}</td><td>{u.pfog}</td><td>{u.fusel}</td><td>{u.rp}</td>
                <td className="roid-count">{fmt(u.m)}</td><td className="roid-count">{fmt(u.c)}</td><td>{u.ticks}</td><td>{u.comb}</td><td>{u.tec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankingGalaxias() {
  const [ranking, setRanking] = useState<Awaited<ReturnType<typeof api.galaxyRanking>>["ranking"]>([]);
  useEffect(() => { api.galaxyRanking().then((d) => setRanking(d.ranking)).catch(() => {}); }, []);
  const max = ranking[0]?.score || 1;
  return (
    <div className="panel">
      <h2>Top 25 Galáxias</h2>
      <table>
        <thead><tr><th className="rank-num">#</th><th>Galáxia</th><th>Planetas</th><th>Pontuação</th></tr></thead>
        <tbody>
          {ranking.map((g, i) => (
            <tr key={g.galaxy}>
              <td className="rank-num">{i + 1}º</td>
              <td><b>{g.name ?? `Galáxia ${g.galaxy}`}</b> <span className="roid-count">({g.galaxy})</span></td>
              <td>{g.planets}</td>
              <td>
                {fmt(g.score)}
                <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, marginTop: 3 }}>
                  <div style={{ width: `${Math.round((g.score / max) * 100)}%`, height: "100%", background: "var(--carbonum)", borderRadius: 3 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SimResult = Awaited<ReturnType<typeof api.combatSim>>;

function Calculadora() {
  const [units, setUnits] = useState<Awaited<ReturnType<typeof api.toolUnits>>["units"]>([]);
  const [race, setRace] = useState<string>("Humana");
  const [atk, setAtk] = useState<Record<string, number>>({});
  const [def, setDef] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { api.toolUnits().then((d) => setUnits(d.units)).catch(() => {}); }, []);
  const races = Array.from(new Set(units.map((u) => u.race)));
  const shown = units.filter((u) => u.race === race);
  const nameToRace = Object.fromEntries(units.map((u) => [u.name, u.race]));

  function setQty(side: "a" | "d", name: string, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    const setter = side === "a" ? setAtk : setDef;
    setter((p) => { const c = { ...p }; if (n > 0) c[name] = n; else delete c[name]; return c; });
  }
  const totA = Object.values(atk).reduce((a, b) => a + b, 0);
  const totD = Object.values(def).reduce((a, b) => a + b, 0);

  async function run() {
    setErr(""); setBusy(true); setResult(null);
    try { setResult(await api.combatSim(atk, def, 3)); }
    catch (e: any) { setErr(e.message ?? "Falha na simulação"); }
    finally { setBusy(false); }
  }

  const VERDICT: Record<SimResult["winner"], string> = {
    atacante: "⚔️ Atacante VENCE — defesa aniquilada",
    defesa: "🛡️ Defesa SEGURA — atacante aniquilado",
    ambos_destruidos: "💥 Aniquilação mútua — ninguém sobra",
    indefinido: "⏳ Sem decisão em 3 ticks — os dois lados sobrevivem",
  };

  const Fleet = ({ side, map }: { side: "a" | "d"; map: Record<string, number> }) => (
    <div className="cost" style={{ lineHeight: 1.7 }}>
      <b>{side === "a" ? "⚔️ Ataque" : "🛡️ Defesa"}: {fmt(side === "a" ? totA : totD)} nave(s)</b>
      {Object.keys(map).length === 0 ? <span className="roid-count"> — vazio</span> : (
        <div className="roid-count">{Object.entries(map).map(([n, q]) => `${fmt(q)}× ${n}`).join(" · ")}</div>
      )}
    </div>
  );

  return (
    <div className="panel">
      <h2>Calculadora de Combate</h2>
      <div className="cost" style={{ marginBottom: 10 }}>
        Monte a frota de <b>ataque</b> e a de <b>defesa</b> (qualquer raça) e simule o combate por <b>3 ticks</b> com o motor real do jogo
        (iniciativa, alvos por classe, CMA, PEM, assimilação). Use pra decidir: <b>mandar mais defesa</b> ou <b>recuar o ataque</b>.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {races.map((r) => (
          <button key={r} className={`action-tab ${race === r ? "active" : ""}`} style={{ padding: "4px 10px" }} onClick={() => setRace(r)}>
            {RACE_LABEL[r] ?? r}
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Nave</th><th>Classe</th><th>⚔️ Ataque</th><th>🛡️ Defesa</th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.name}>
                <td><b>{u.name}</b>{u.roider && " ⛏️"}</td>
                <td className="roid-count">{u.classe}</td>
                <td><input type="text" inputMode="numeric" value={atk[u.name] ?? ""} placeholder="0" onChange={(e) => setQty("a", u.name, e.target.value.replace(/\D/g, ""))} style={{ width: 90, margin: 0, padding: "4px 6px" }} /></td>
                <td><input type="text" inputMode="numeric" value={def[u.name] ?? ""} placeholder="0" onChange={(e) => setQty("d", u.name, e.target.value.replace(/\D/g, ""))} style={{ width: 90, margin: 0, padding: "4px 6px" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "12px 0" }}>
        <Fleet side="a" map={atk} />
        <Fleet side="d" map={def} />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button disabled={busy || (totA === 0 && totD === 0)} onClick={run}>{busy ? "simulando…" : "🎯 Simular combate (3 ticks)"}</button>
        <button className="link" onClick={() => { setAtk({}); setDef({}); setResult(null); }}>limpar</button>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="combat-ini" style={{ fontSize: 16 }}>{VERDICT[result.winner]}</div>
          {result.ticks.map((tk) => (
            <div key={tk.tick} style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div className="cost" style={{ marginBottom: 6 }}>
                <b>Tick {tk.tick}</b> — Ataque {fmt(tk.aBefore)}→<b>{fmt(tk.aAfter)}</b> · Defesa {fmt(tk.dBefore)}→<b>{fmt(tk.dAfter)}</b>
                {tk.raidCapacity > 0 && <span className="roid-count"> · roids saqueáveis: {fmt(tk.raidCapacity)}</span>}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {([["⚔️ Ataque", tk.attacker], ["🛡️ Defesa", tk.defender]] as const).map(([label, rows]) => (
                  <div key={label} style={{ flex: 1, minWidth: 280, overflowX: "auto" }}>
                    <div className="roid-count" style={{ marginBottom: 4 }}>{label}</div>
                    <table>
                      <thead><tr><th>Nave</th><th>Início</th><th>Perdas</th><th>PEM</th><th>Sobrev.</th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}{r.assim > 0 && <span className="roid-count" title="assimiladas"> +{fmt(r.assim)}🔧</span>}</td>
                            <td className="roid-count">{fmt(r.before)}</td>
                            <td style={{ color: "var(--danger)" }}>{r.lost > 0 ? `−${fmt(r.lost)}` : "—"}</td>
                            <td className="roid-count">{r.pem > 0 ? fmt(r.pem) : "—"}</td>
                            <td><b>{fmt(r.survivors)}</b></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Universo() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.toolPlanets>> | null>(null);
  const [gal, setGal] = useState<Awaited<ReturnType<typeof api.galaxyRanking>>["ranking"]>([]);
  useEffect(() => {
    api.toolPlanets().then(setData).catch(() => {});
    api.galaxyRanking().then((d) => setGal(d.ranking)).catch(() => {});
  }, []);
  if (!data) return <div className="panel"><div className="roid-count">Carregando...</div></div>;
  const totalScore = data.planets.reduce((s, p) => s + p.score, 0);
  const populated = new Set(data.planets.map((p) => p.galaxy)).size;
  return (
    <div className="panel">
      <h2>Universo</h2>
      <div className="grid3" style={{ marginBottom: 14 }}>
        <div className="res-card"><div className="name">Planetas</div><div className="amount">{fmt(data.planets.length)}</div></div>
        <div className="res-card"><div className="name">Comandantes</div><div className="amount">{fmt(data.totalUsers)}</div></div>
        <div className="res-card"><div className="name">Galáxias com vida</div><div className="amount">{populated}</div></div>
      </div>
      <div className="cost">Pontuação total do universo: <b>{fmt(totalScore)}</b></div>
      <h2 style={{ marginTop: 16 }}>Top 10 comandantes</h2>
      <table>
        <thead><tr><th className="rank-num">#</th><th>Comandante</th><th>Planeta</th><th>Coord.</th><th>Pontuação</th></tr></thead>
        <tbody>
          {data.planets.slice(0, 10).map((p, i) => (
            <tr key={p.coords}><td className="rank-num">{i + 1}º</td><td>{p.commander}</td><td><b>{p.name}</b></td><td>{p.coords}</td><td>{fmt(p.score)}</td></tr>
          ))}
        </tbody>
      </table>
      {gal.length > 0 && <div className="cost" style={{ marginTop: 10 }}>Maior galáxia: <b>{gal[0].name ?? `Galáxia ${gal[0].galaxy}`}</b> ({fmt(gal[0].score)} pts)</div>}
    </div>
  );
}

const TEC_CAT: Record<string, string> = { mineracao: "Mineração", tec: "Deslocamento", espionagem: "Inteligência", sabotagem: "Sabotagem", naves: "Naves" };

function ArvoreTec() {
  const [techs, setTechs] = useState<Awaited<ReturnType<typeof api.toolTechtree>>["techs"]>([]);
  useEffect(() => { api.toolTechtree().then((d) => setTechs(d.techs)).catch(() => {}); }, []);
  const cats = Array.from(new Set(techs.map((t) => t.category)));
  return (
    <div className="panel">
      <h2>Árvore Tecnológica</h2>
      <div className="cost" style={{ marginBottom: 10 }}>🔬 Pesquisa desbloqueia 🛠️ Construção. Pré-requisitos entre parênteses.</div>
      {cats.map((c) => (
        <div key={c} style={{ marginBottom: 14 }}>
          <div className="combat-ini">{TEC_CAT[c] ?? c}</div>
          {techs.filter((t) => t.category === c).map((t) => (
            <div key={t.key} className="roid-row">
              <div className="roid-label"><div>
                <div><b>{t.kind === "research" ? "🔬 " : "🛠️ "}{t.name}</b>{t.max > 1 && <span className="roid-count"> (máx nv {t.max})</span>}</div>
                <div className="roid-count">{t.desc}</div>
                {t.requires.length > 0 && <div className="roid-count" style={{ color: "var(--danger)" }}>requer: {t.requires.map((r) => `${r.name} nv${r.level}`).join(", ")}</div>}
              </div></div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <div className="roid-count">{fmt(t.cost)} M · {fmt(t.cost)} C</div>
                <div className="roid-count" style={{ color: "var(--accent)" }}>{t.ticks} ticks</div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ProcuraPlanetas() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.toolPlanets>> | null>(null);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(0);
  const [q, setQ] = useState("");
  useEffect(() => { api.toolPlanets().then(setData).catch(() => {}); }, []);
  if (!data) return <div className="panel"><div className="roid-count">Carregando...</div></div>;
  const shown = data.planets.filter((p) =>
    (min <= 0 || p.score >= min) && (max <= 0 || p.score <= max) &&
    (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.commander.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div className="panel">
      <h2>Procura de Planetas</h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input placeholder="nome/comandante..." value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 180, margin: 0, padding: "6px 10px" }} />
        <span className="roid-count">pontuação de</span>
        <input type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} style={{ width: 110, margin: 0, padding: "6px 8px" }} />
        <span className="roid-count">até</span>
        <input type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} style={{ width: 110, margin: 0, padding: "6px 8px" }} />
        <span className="roid-count">(0 = sem limite)</span>
      </div>
      <div className="cost" style={{ marginBottom: 6 }}>{shown.length} planeta(s)</div>
      <table>
        <thead><tr><th>Planeta</th><th>Comandante</th><th>Coord.</th><th>Roids</th><th>Pontuação</th></tr></thead>
        <tbody>
          {shown.slice(0, 100).map((p) => (
            <tr key={p.coords}><td><b>{p.name}</b>{p.protected && " 🛡️"}</td><td>{p.commander}</td><td>{p.coords}</td><td>{fmt(p.roids)}</td><td>{fmt(p.score)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Graficos() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.toolPlanets>> | null>(null);
  useEffect(() => { api.toolPlanets().then(setData).catch(() => {}); }, []);
  if (!data) return <div className="panel"><div className="roid-count">Carregando...</div></div>;
  const top = data.planets.slice(0, 12);
  const maxv = top[0]?.score || 1;
  return (
    <div className="panel">
      <h2>Gráficos Comparativos — Top comandantes</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {top.map((p) => (
          <div key={p.coords}>
            <div className="roid-count" style={{ display: "flex", justifyContent: "space-between" }}><span>{p.commander} <span style={{ opacity: 0.6 }}>({p.coords})</span></span><b>{fmt(p.score)}</b></div>
            <div style={{ height: 14, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
              <div style={{ width: `${Math.max(2, Math.round((p.score / maxv) * 100))}%`, height: "100%", background: "linear-gradient(90deg, var(--accent-dim), var(--accent))", borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Espionagem() {
  const [reports, setReports] = useState<Awaited<ReturnType<typeof api.spyReports>>["reports"]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [looked, setLooked] = useState<Awaited<ReturnType<typeof api.spyLookup>> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api.spyReports().then((d) => setReports(d.reports)).catch(() => {}); }, []);
  const AGENT: Record<string, string> = { P: "Padrão", M: "Militar", T: "Transmissão", D: "Duplo" };

  async function lookup() {
    setErr(""); setLooked(null);
    try { setLooked(await api.spyLookup(code.trim())); }
    catch (e: any) { setErr(e.message ?? "Código não encontrado"); }
  }

  return (
    <>
      <div className="panel">
        <h2>Visualizar Espionagem</h2>
        <div className="cost" style={{ marginBottom: 10 }}>Cole um <b>código</b> de espionagem que alguém te passou para ver o relatório.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="código (ex.: A1B2C3D4)" style={{ width: 200, margin: 0, padding: "6px 10px", letterSpacing: 1 }} />
          <button disabled={!code.trim()} onClick={lookup}>abrir</button>
        </div>
        {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
        {looked && (
          <div style={{ marginTop: 12 }}>
            <div className="combat-ini">{looked.targetName} ({looked.targetCoords}) · agente {AGENT[looked.agent] ?? looked.agent} · tick #{looked.tick}</div>
            <div style={{ marginTop: 6 }}><IntelReport intel={looked.intel} /></div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Minhas espionagens</h2>
        {reports.length === 0 ? (
          <div className="roid-count">Nenhuma ainda. Use os agentes P/M/T/D na aba Galáxia — cada missão gera um código.</div>
        ) : (
          <table>
            <thead><tr><th>Tick</th><th>Alvo</th><th>Coord.</th><th>Agente</th><th>Código</th><th></th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td className="rank-num">#{r.tick}</td><td><b>{r.targetName}</b></td><td>{r.targetCoords}</td><td>{AGENT[r.agent] ?? r.agent}</td>
                    <td><b style={{ color: "var(--accent)", letterSpacing: 1 }}>{r.hash}</b> <button className="link" onClick={() => navigator.clipboard?.writeText(r.hash)}>copiar</button></td>
                    <td><button onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "fechar" : "ver"}</button></td>
                  </tr>
                  {open === r.id && (
                    <tr><td colSpan={6}><IntelReport intel={r.intel} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
