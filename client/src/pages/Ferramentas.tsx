import { useEffect, useState, Fragment } from "react";
import { api } from "../api";
import { CoordLink, CoordNavContext } from "../components/CoordLink";
import { IntelReport } from "../components/IntelReport";
import { GLOSSARIO } from "../components/Termo";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

type Tool = "universo" | "unidades" | "techtree" | "calculadora" | "sabocalc" | "procura" | "rankings" | "graficos" | "espionagem" | "glossario";

const RACE_LABEL: Record<string, string> = {
  Humana: "Humanos", Daharan: "Daharan", Rakshasa: "Rakshasa", "c-Mech": "c-Mech", Insecta: "Insecta",
};

// Kit de Ferramentas — página separada com menu próprio (estilo toolkit do GW).
const VALID_TOOLS = ["universo", "unidades", "techtree", "calculadora", "sabocalc", "procura", "rankings", "graficos", "espionagem", "glossario"] as const;

export function Ferramentas({ onClose }: { onClose: () => void }) {
  // Abre já numa ferramenta se veio por ?tool=... (ex: "Simular" da Galáxia).
  const initialTool = (() => {
    try { const t = new URLSearchParams(location.search).get("tool"); return (VALID_TOOLS as readonly string[]).includes(t ?? "") ? (t as Tool) : "universo"; }
    catch { return "universo" as Tool; }
  })();
  const [tool, setTool] = useState<Tool>(initialTool);
  useEffect(() => { api.markSeen("tools"); }, []); // missão tutorial

  const MENU: { key: Tool | "voltar"; label: string }[] = [
    { key: "voltar", label: "‹ Tela principal" },
    { key: "universo", label: "Universo" },
    { key: "unidades", label: "Tabela de Unidades" },
    { key: "techtree", label: "Árvore Tecnológica" },
    { key: "calculadora", label: "Calculadora de Combate" },
    { key: "sabocalc", label: "Calculadora de Sabotagem" },
    { key: "procura", label: "Procura de Planetas" },
    { key: "rankings", label: "Rankings (Galáxias)" },
    { key: "graficos", label: "Gráficos Comparativos" },
    { key: "espionagem", label: "Visualizar Espionagem" },
    { key: "glossario", label: "Glossário (siglas)" },
  ];

  // A Ferramentas abre numa aba separada, SEM o contexto de navegação do Dashboard —
  // por isso as coordenadas não ficavam clicáveis aqui. Fornecemos um contexto que
  // volta pra tela principal já na galáxia da coord (via ?goto=), tornando TODA
  // coordenada da Ferramentas clicável (procura de planetas, espionagem, etc.).
  const navToCoord = (c: string) => { window.location.href = `/?goto=${encodeURIComponent(c)}`; };

  return (
    <CoordNavContext.Provider value={navToCoord}>
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
        {tool === "sabocalc" && <SabotagemCalc />}
        {tool === "procura" && <ProcuraPlanetas />}
        {tool === "rankings" && <RankingGalaxias />}
        {tool === "graficos" && <Graficos />}
        {tool === "espionagem" && <Espionagem />}
        {tool === "glossario" && <Glossario />}
      </main>
    </div>
    </CoordNavContext.Provider>
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
                <td className="roid-count">{u.roider ? `rouba ${u.qarm} roid${u.qarm > 1 ? "s" : ""}/tick` : u.alvos.join(", ") || "—"}</td>
                <td>{u.ini}</td><td>{u.agi}</td><td>{u.varm}</td><td title={u.roider ? "roiders: Qarm = roids roubados por tick de ataque" : "tiros por tick"}>{u.qarm}</td><td>{u.pfog}</td><td>{u.fusel}</td><td>{u.rp}</td>
                <td className="roid-count">{fmt(u.m)}</td><td className="roid-count">{fmt(u.c)}</td><td>{u.ticks}</td><td>{u.comb}</td><td>{u.tec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cost" style={{ marginTop: 8, fontSize: 12 }}>
        ⛏️ = nave <b>roider</b> (não atira, rouba roids). Pra elas, a coluna <b>Qarm</b> é quantos <b>roids ela rouba por tick</b> de ataque. Ex.: Qarm 2 = 2 roids/tick por nave.
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
              <td><b>{g.name ?? `Galáxia ${g.coord}`}</b> <span className="roid-count">(<CoordLink c={g.coord} />)</span></td>
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
  const [targetRoids, setTargetRoids] = useState(""); // roids do alvo (pra ver o saque estimado)
  const [result, setResult] = useState<SimResult | null>(null);
  // Mini-calc de roidcap rápido (sem montar frota): só pontos atk/def + roids.
  const [rcAtk, setRcAtk] = useState("");
  const [rcDef, setRcDef] = useState("");
  const [rcRoids, setRcRoids] = useState("");
  const [rcResult, setRcResult] = useState<{ ratePct: number; saque: number | null } | null>(null);
  async function runRoidcap() {
    const a = parseInt(rcAtk, 10) || 0, d = parseInt(rcDef, 10) || 0, r = parseInt(rcRoids, 10) || 0;
    if (a <= 0 || d <= 0) { setRcResult(null); return; }
    try { setRcResult(await api.roidcapCalc(a, d, r || undefined)); } catch { setRcResult(null); }
  }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Importar frota de uma espionagem pelo hash (evita digitar nave por nave).
  const [hash, setHash] = useState("");
  const [hashBusy, setHashBusy] = useState(false);
  const [hashMsg, setHashMsg] = useState("");
  // Fontes de naves do relatório carregado: base + cada frota (agente Duplo) ou
  // a frota total (agente Militar). Cada uma pode ir pro Ataque ou pra Defesa.
  const [hashInfo, setHashInfo] = useState<{ targetName: string; targetCoords: string; race?: string } | null>(null);
  const [hashSources, setHashSources] = useState<{ label: string; detail?: string; units: Record<string, number>; total: number }[]>([]);

  useEffect(() => { api.toolUnits().then((d) => setUnits(d.units)).catch(() => {}); }, []);
  // Preset vindo da Galáxia ("🎯 Simular"): hash do alvo pra carregar na defesa.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gw_calc_preset");
      if (!raw) return;
      localStorage.removeItem("gw_calc_preset");
      const p = JSON.parse(raw);
      if (p?.defHash) { setHash(String(p.defHash)); setTimeout(() => loadHash(String(p.defHash)), 0); }
    } catch {}
  }, []);
  // "todas" = sem filtro de raça (pedido da galera): mostra o catálogo inteiro.
  const races = ["todas", ...Array.from(new Set(units.map((u) => u.race)))];
  const shown = race === "todas" ? units : units.filter((u) => u.race === race);
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

  // Pontuação ao vivo das frotas montadas (canon: (m+c) × 0.1 por nave).
  // "combate" ignora roiders (igual ao motor), usada pro roidcap.
  const scoreOf = (m: Record<string, number>, onlyCombat = false) => {
    let s = 0;
    for (const [n, q] of Object.entries(m)) {
      const u = nameToRace[n] ? units.find((x) => x.name === n) : undefined;
      if (!u) continue;
      if (onlyCombat && u.roider) continue;
      s += (q as number) * (u.m + u.c) * 0.1;
    }
    return Math.round(s);
  };
  const scoreA = scoreOf(atk), scoreD = scoreOf(def);
  const combatA = scoreOf(atk, true), combatD = scoreOf(def, true);
  // Puxa os pontos das frotas montadas direto pro roidcap rápido.
  function roidcapFromFleets() {
    if (combatA <= 0 && combatD <= 0) return;
    setRcAtk(String(combatA)); setRcDef(String(combatD));
    api.roidcapCalc(combatA, Math.max(1, combatD), parseInt(targetRoids, 10) || undefined)
      .then(setRcResult).catch(() => {});
  }
  const totalOf = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  const cleanUnits = (o: any): Record<string, number> => {
    const out: Record<string, number> = {};
    if (o && typeof o === "object") for (const [n, q] of Object.entries(o)) { const v = Number(q) || 0; if (v > 0) out[n] = v; }
    return out;
  };

  // Carrega o relatório pelo hash e lista as FONTES de naves (base + cada frota).
  // O jogador escolhe DEPOIS qual fonte entra, e se vai pro ataque ou pra defesa.
  async function loadHash(preset?: string) {
    const h = (preset ?? hash).trim().toUpperCase();
    if (!h) return;
    if (preset) setHash(h);
    setHashBusy(true); setHashMsg(""); setErr(""); setHashSources([]); setHashInfo(null);
    try {
      const r = await api.spyLookup(h);
      const intel = r.intel ?? {};
      const sources: { label: string; detail?: string; units: Record<string, number>; total: number }[] = [];
      // Agente Militar (M): só o total de naves do alvo (sem separar por frota).
      if (Array.isArray(intel.ships)) {
        const u: Record<string, number> = {};
        for (const s of intel.ships) { const v = Number(s.count) || 0; if (v > 0) u[s.name] = (u[s.name] || 0) + v; }
        if (totalOf(u) > 0) sources.push({ label: "Frota total do alvo", detail: "visão Militar (M)", units: u, total: totalOf(u) });
      }
      // Agente Duplo (D): base + cada frota em movimento, separadas.
      if (intel.base) { const u = cleanUnits(intel.base); if (totalOf(u) > 0) sources.push({ label: "Naves na base", units: u, total: totalOf(u) }); }
      if (Array.isArray(intel.fleets)) for (const f of intel.fleets) {
        const u = cleanUnits(f?.units); if (totalOf(u) === 0) continue;
        const det = [f.status, f.target && f.target !== "—" ? `→ ${f.target}` : "", f.ticksRemaining ? `${f.ticksRemaining}t` : ""].filter(Boolean).join(" · ");
        sources.push({ label: f.name || "Frota", detail: det || undefined, units: u, total: totalOf(u) });
      }
      if (sources.length === 0) {
        setHashMsg("⚠️ Esse relatório não lista as naves do alvo. Use uma espionagem com agente Militar (M) ou Duplo (D), que revelam a frota.");
        return;
      }
      setHashInfo({ targetName: r.targetName, targetCoords: r.targetCoords, race: intel.race });
      setHashSources(sources);
      // Alinha a aba de raça com a do alvo, pra facilitar conferir.
      if (intel.race && races.includes(intel.race)) setRace(intel.race);
      // Veio da Galáxia ("Simular"): já joga a frota do alvo na DEFESA automaticamente
      // (se só há uma fonte; com várias, deixa o jogador escolher qual).
      if (preset && sources.length === 1) {
        setDef({ ...sources[0].units });
        setHashMsg(`✅ Defesa carregada: ${fmt(sources[0].total)} nave(s) de ${r.targetName}. Monte seu ataque e simule.`);
      }
    } catch (e: any) {
      setHashMsg(`❌ ${e.message ?? "Código não encontrado"}`);
    } finally { setHashBusy(false); }
  }

  // Joga uma fonte escolhida no lado escolhido (substitui o lado).
  function applySource(units: Record<string, number>, side: "a" | "d") {
    if (side === "a") setAtk({ ...units }); else setDef({ ...units });
    setHashMsg(`✅ ${fmt(totalOf(units))} nave(s) → ${side === "a" ? "ATAQUE ⚔️" : "DEFESA 🛡️"}.`);
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
      {" "}<span className="roid-count">· <b style={{ color: "var(--carbonum)" }}>{fmt(side === "a" ? scoreA : scoreD)} pts</b></span>
      {Object.keys(map).length === 0 ? <span className="roid-count"> — vazio</span> : (
        <div className="roid-count">{Object.entries(map).map(([n, q]) => `${fmt(q)}× ${n}`).join(" · ")}</div>
      )}
    </div>
  );

  return (
    <div className="panel">
      <h2>Calculadora de Combate</h2>

      {/* Roidcap rápido: só pontos atk/def + roids, sem montar frota. */}
      <div style={{ background: "rgba(69,230,165,0.06)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
        <div className="cost" style={{ marginBottom: 8 }}>
          💰 <b>Roidcap rápido</b> — informe a <b>pontuação do ataque</b>, a <b>pontuação da defesa</b> e os <b>roids do alvo</b> pra ver o <b>% de cap</b> e o saque por tick, sem precisar montar frota.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="roid-count">⚔️ pts ataque</span>
          <input type="text" inputMode="numeric" placeholder="ex: 50000" value={rcAtk}
            onChange={(e) => setRcAtk(e.target.value.replace(/\D/g, ""))} style={{ width: 110, margin: 0, padding: "6px 8px" }} />
          <span className="roid-count">🛡️ pts defesa</span>
          <input type="text" inputMode="numeric" placeholder="ex: 40000" value={rcDef}
            onChange={(e) => setRcDef(e.target.value.replace(/\D/g, ""))} style={{ width: 110, margin: 0, padding: "6px 8px" }} />
          <span className="roid-count">roids do alvo</span>
          <input type="text" inputMode="numeric" placeholder="ex: 1500" value={rcRoids}
            onChange={(e) => setRcRoids(e.target.value.replace(/\D/g, ""))} style={{ width: 100, margin: 0, padding: "6px 8px" }} />
          <button onClick={runRoidcap}>calcular</button>
          {(combatA > 0 || combatD > 0) && <button className="link" onClick={roidcapFromFleets} title="Usa os pontos de combate das frotas que você montou na tabela abaixo">↓ usar frotas montadas</button>}
          {(rcAtk || rcDef || rcRoids || rcResult) && <button className="link" onClick={() => { setRcAtk(""); setRcDef(""); setRcRoids(""); setRcResult(null); }}>limpar</button>}
        </div>
        {rcResult && (
          <div className="cost" style={{ marginTop: 8 }}>
            Roidcap: <b style={{ color: "var(--carbonum)", fontSize: 16 }}>{rcResult.ratePct}%</b> por tick
            {rcResult.saque != null && <> · saque estimado: <b style={{ color: "var(--carbonum)" }}>~{fmt(rcResult.saque)} roids</b>/tick</>}
          </div>
        )}
      </div>

      <div className="cost" style={{ marginBottom: 10 }}>
        Monte a frota de <b>ataque</b> e a de <b>defesa</b> (qualquer raça) e simule o combate por <b>3 ticks</b> com o motor real do jogo
        (iniciativa, alvos por classe, CMA, PEM, assimilação). Use pra decidir: <b>mandar mais defesa</b> ou <b>recuar o ataque</b>.
      </div>

      {/* Importar frota de uma espionagem (evita digitar nave por nave). */}
      <div style={{ background: "rgba(37,211,255,0.06)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
        <div className="cost" style={{ marginBottom: 8 }}>
          🛰️ <b>Importar de uma espionagem</b> — cole o <b>código (hash)</b> de um relatório <b>Militar (M)</b> ou <b>Duplo (D)</b>, carregue e escolha qual frota entra no <b>ataque ⚔️</b> ou na <b>defesa 🛡️</b>.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input value={hash} onChange={(e) => setHash(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") loadHash(); }}
            placeholder="código da espionagem (ex: A1B2C3)" maxLength={16} style={{ width: 240, margin: 0, padding: "6px 8px" }} />
          <button disabled={hashBusy || !hash.trim()} onClick={() => loadHash()}>{hashBusy ? "carregando…" : "carregar"}</button>
        </div>

        {hashInfo && hashSources.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div className="roid-count" style={{ marginBottom: 6, fontSize: 12 }}>
              Alvo: <b>{hashInfo.targetName}</b> (<CoordLink c={hashInfo.targetCoords} />){hashInfo.race ? ` · ${RACE_LABEL[hashInfo.race] ?? hashInfo.race}` : ""}
              {hashSources.length > 1 && " — escolha qual frota importar:"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hashSources.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
                  <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                    <b>{s.label}</b> <span className="roid-count">· {fmt(s.total)} nave(s)</span>
                    {s.detail && <span className="roid-count" style={{ fontSize: 11 }}> · {s.detail}</span>}
                    <div className="roid-count" style={{ fontSize: 11, opacity: 0.8 }}>{Object.entries(s.units).map(([n, q]) => `${fmt(q)}× ${n}`).join(" · ")}</div>
                  </div>
                  <button onClick={() => applySource(s.units, "a")} title="Importar esta frota para o ATAQUE" style={{ padding: "4px 10px" }}>⚔️ Ataque</button>
                  <button onClick={() => applySource(s.units, "d")} title="Importar esta frota para a DEFESA" style={{ padding: "4px 10px" }}>🛡️ Defesa</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {hashMsg && <div className="roid-count" style={{ marginTop: 6, fontSize: 12 }}>{hashMsg}</div>}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        {races.map((r) => (
          <button key={r} className={`action-tab ${race === r ? "active" : ""}`} style={{ padding: "4px 10px" }} onClick={() => setRace(r)}>
            {r === "todas" ? "Todas" : RACE_LABEL[r] ?? r}
          </button>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Nave</th>{race === "todas" && <th>Raça</th>}<th>Classe</th><th>Alvos</th><th>⚔️ Ataque</th><th>🛡️ Defesa</th></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.race + u.name}>
                <td><b>{u.name}</b>{u.roider && " ⛏️"}</td>
                {race === "todas" && <td className="roid-count">{RACE_LABEL[u.race] ?? u.race}</td>}
                <td className="roid-count">{u.classe}</td>
                <td className="roid-count">{u.roider ? "rouba roids" : (u.alvos.join(", ") || "—")}</td>
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

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button disabled={busy || (totA === 0 && totD === 0)} onClick={run}>{busy ? "simulando…" : "🎯 Simular combate (3 ticks)"}</button>
        <span className="roid-count">roids do alvo (opcional):</span>
        <input type="text" inputMode="numeric" placeholder="ex: 1500" value={targetRoids}
          onChange={(e) => setTargetRoids(e.target.value.replace(/\D/g, ""))}
          title="Informe os roids do alvo pra ver quanto você saquearia por tick (roidcap)"
          style={{ width: 90, margin: 0, padding: "6px 8px", textAlign: "center" }} />
        <button className="link" onClick={() => { setAtk({}); setDef({}); setTargetRoids(""); setResult(null); }}>limpar</button>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div className="combat-ini" style={{ fontSize: 16 }}>{VERDICT[result.winner]}</div>

          {/* Resumo de PONTUAÇÃO: pontos de cada lado e quanto cada um perde no combate */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "10px 0" }}>
            {([
              ["⚔️ Ataque", result.aScoreStart, result.aScoreEnd, result.aScoreLostTotal, result.aUnused, result.aUnusedTotal],
              ["🛡️ Defesa", result.dScoreStart, result.dScoreEnd, result.dScoreLostTotal, result.dUnused, result.dUnusedTotal],
            ] as const).map(([label, start, end, lost, unused, unusedTot]) => (
              <div key={label} style={{ flex: 1, minWidth: 260, border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
                <div className="combat-ini" style={{ marginBottom: 6 }}>{label}</div>
                <div className="roid-count">Pontuação: <b style={{ color: "var(--text)" }}>{fmt(Math.round(start))}</b> → <b style={{ color: "var(--text)" }}>{fmt(Math.round(end))}</b></div>
                <div style={{ color: "var(--danger)", fontSize: 13 }}>Pontos perdidos: <b>−{fmt(Math.round(lost))}</b></div>
                {unusedTot > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <div className="roid-count" title="Naves vivas que, no fim, não acharam alvo pra atirar (ex.: excedente Daharan depois de paralisar tudo)">
                      🚫 Sobraram sem atirar: <b style={{ color: "var(--carbonum)" }}>{fmt(unusedTot)}</b>
                    </div>
                    <div className="roid-count" style={{ fontSize: 11, opacity: 0.85 }}>
                      {unused.map((u) => `${u.name} ×${fmt(u.count)}`).join(" · ")}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {result.ticks.map((tk) => (
            <div key={tk.tick} style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div className="cost" style={{ marginBottom: 6 }}>
                <b>Tick {tk.tick}</b> — Ataque {fmt(tk.aBefore)}→<b>{fmt(tk.aAfter)}</b> <span style={{ color: "var(--danger)" }}>(−{fmt(Math.round(tk.aScoreLost))} pts)</span> · Defesa {fmt(tk.dBefore)}→<b>{fmt(tk.dAfter)}</b> <span style={{ color: "var(--danger)" }}>(−{fmt(Math.round(tk.dScoreLost))} pts)</span>
                {tk.raidCapacity > 0 && <span className="roid-count"> · capacidade dos roiders: {fmt(tk.raidCapacity)}</span>}
                <span className="roid-count"> · <b style={{ color: "var(--carbonum)" }}>roidcap {tk.ratePct}%</b></span>
                {(() => {
                  const roids = parseInt(targetRoids, 10) || 0;
                  if (roids <= 0 || tk.raidCapacity <= 0) return null;
                  const saque = Math.min(tk.raidCapacity, Math.floor(roids * tk.ratePct / 100));
                  return <span className="roid-count"> · <b style={{ color: "var(--carbonum)" }}>saque ~{fmt(saque)} roids</b> <span style={{ opacity: 0.7 }}>({tk.ratePct}% de {fmt(roids)})</span></span>;
                })()}
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

const SAB_RACES: [string, string][] = [["humanos", "Humanos"], ["daharan", "Daharan"], ["rakshasa", "Rakshasa"], ["mech", "c-Mech"], ["insecta", "Insecta"]];

function SabotagemCalc() {
  const [sabos, setSabos] = useState<Awaited<ReturnType<typeof api.toolSabotages>>["sabotages"]>([]);
  const [key, setKey] = useState("");
  const [myAE, setMyAE] = useState(0);
  const [tgtRoids, setTgtRoids] = useState(20);
  const [tgtRace, setTgtRace] = useState("humanos");
  const [tgtCE, setTgtCE] = useState(0);
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.sabotageSim>> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => { api.toolSabotages().then((d) => { setSabos(d.sabotages); setKey(d.sabotages[0]?.key ?? ""); }).catch(() => {}); }, []);
  async function run() {
    setErr(""); setRes(null);
    try { setRes(await api.sabotageSim({ key, attackerAE: myAE, targetRoids: tgtRoids, targetRace: tgtRace, targetCE: tgtCE })); }
    catch (e: any) { setErr(e.message ?? "Falha"); }
  }
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const num = (label: string, val: number, set: (n: number) => void) => (
    <label key={label} className="roid-count" style={{ display: "block" }}>
      {label}
      <input type="text" inputMode="numeric" value={val} onChange={(e) => set(Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)))} style={{ width: "100%", marginTop: 4, padding: "6px 8px" }} />
    </label>
  );

  return (
    <div className="panel">
      <h2>Calculadora de Sabotagem</h2>
      <div className="cost" style={{ marginBottom: 12 }}>
        Disputa <b>AE</b> (sua força de espionagem) × <b>AC</b> (contra-espionagem do alvo), pesada pelos roids do alvo:
        mais roids = mais AE pra furar e mais AC pra blindar. Nunca 0% nem 100%. Custo só em <b>plutônio</b>, pago mesmo se falhar.
      </div>
      <div className="grid3" style={{ marginBottom: 12 }}>
        <label className="roid-count" style={{ display: "block" }}>
          Sabotagem
          <select value={key} onChange={(e) => setKey(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "6px 8px", background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6 }}>
            {sabos.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
          </select>
        </label>
        <label className="roid-count" style={{ display: "block" }}>
          Raça do alvo
          <select value={tgtRace} onChange={(e) => setTgtRace(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "6px 8px", background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6 }}>
            {SAB_RACES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {num("Seu AE (espionagem)", myAE, setMyAE)}
        {num("Roids do alvo (total)", tgtRoids, setTgtRoids)}
        {num("AC do alvo (contra-esp.)", tgtCE, setTgtCE)}
      </div>
      <button onClick={run}>🎯 Calcular</button>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {res && (
        <div style={{ marginTop: 14 }}>
          <div className="combat-ini">{res.name}</div>
          <div className="grid3" style={{ marginTop: 8 }}>
            <div className="res-card"><div className="name">Chance de SUCESSO</div><div className="amount">{pct(res.success)}</div></div>
            <div className="res-card"><div className="name">Custo (plutônio)</div><div className="amount">{fmt(res.plut)}</div></div>
            <div className="res-card"><div className="name">Tempo</div><div className="amount">{res.ticks}t</div></div>
          </div>
          <div className="cost" style={{ marginTop: 10 }}>
            Chance = disputa do seu <b>AE</b> contra o <b>AC</b> do alvo (densidade por roid). O plutônio é gasto mesmo numa falha.
          </div>
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
  const populated = new Set(data.planets.map((p) => p.coords.split(":").slice(0, 2).join(":"))).size;
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
            <tr key={p.coords}><td className="rank-num">{i + 1}º</td><td>{p.commander}</td><td><b>{p.name}</b></td><td><CoordLink c={p.coords} /></td><td>{fmt(p.score)}</td></tr>
          ))}
        </tbody>
      </table>
      {gal.length > 0 && <div className="cost" style={{ marginTop: 10 }}>Maior galáxia: <b>{gal[0].name ?? `Galáxia ${gal[0].coord}`}</b> ({fmt(gal[0].score)} pts)</div>}
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
            <tr key={p.coords}><td><b>{p.name}</b>{p.protected && " 🛡️"}</td><td>{p.commander}</td><td><CoordLink c={p.coords} /></td><td>{fmt(p.roids)}</td><td>{fmt(p.score)}</td></tr>
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
            <div className="roid-count" style={{ display: "flex", justifyContent: "space-between" }}><span>{p.commander} <span style={{ opacity: 0.6 }}>(<CoordLink c={p.coords} />)</span></span><b>{fmt(p.score)}</b></div>
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
  const [looked, setLooked] = useState<Awaited<ReturnType<typeof api.spyLookup>>[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => { api.spyReports().then((d) => setReports(d.reports)).catch(() => {}); }, []);
  const AGENT: Record<string, string> = { P: "Padrão", M: "Militar", T: "Transmissão", D: "Duplo" };

  async function lookup() {
    setErr(""); setLooked([]);
    // Vários códigos de uma vez, separados por ";" (igual ao toolkit original).
    const codes = code.split(";").map((c) => c.trim()).filter(Boolean);
    if (codes.length === 0) return;
    const out: Awaited<ReturnType<typeof api.spyLookup>>[] = [];
    const bad: string[] = [];
    for (const c of codes) {
      try { out.push(await api.spyLookup(c)); } catch { bad.push(c); }
    }
    setLooked(out);
    if (bad.length) setErr(`Não encontrado: ${bad.join(", ")}`);
  }

  return (
    <>
      <div className="panel">
        <h2>Visualizar Espionagem</h2>
        <div className="cost" style={{ marginBottom: 10 }}>Cole um <b>código</b> de espionagem (ou vários, separados por <b>;</b>) para ver os relatórios.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="código(s): A1B2C3D4; E5F6G7H8" style={{ width: 280, margin: 0, padding: "6px 10px", letterSpacing: 1 }} />
          <button disabled={!code.trim()} onClick={lookup}>abrir</button>
        </div>
        {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
        {looked.map((lk, i) => (
          <div key={i} style={{ marginTop: 12 }}>
            <div className="combat-ini">{lk.targetName} (<CoordLink c={lk.targetCoords} />) · agente {AGENT[lk.agent] ?? lk.agent} · tick #{lk.tick}</div>
            <div style={{ marginTop: 6 }}><IntelReport intel={lk.intel} /></div>
          </div>
        ))}
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
                    <td className="rank-num">#{r.tick}</td><td><b>{r.targetName}</b></td><td><CoordLink c={r.targetCoords} /></td><td>{AGENT[r.agent] ?? r.agent}</td>
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

// Glossário das siglas/jargões do jogo (consulta rápida pro novato).
function Glossario() {
  const GROUPS: { title: string; keys: string[] }[] = [
    { title: "Inteligência & Sabotagem", keys: ["AE", "CE", "AC", "AM", "AD"] },
    { title: "Combate & Frotas", keys: ["TEC", "PEM", "CMA", "roider"] },
    { title: "Economia & Galáxia", keys: ["roid", "CG"] },
  ];
  return (
    <div className="panel">
      <h2>Glossário — siglas do jogo</h2>
      <div className="cost" style={{ marginBottom: 12 }}>
        As abreviações que mais confundem no começo. Elas também aparecem <b>sublinhadas</b> pelo jogo — passe o mouse pra ver a explicação.
      </div>
      {GROUPS.map((g) => (
        <div key={g.title} style={{ marginBottom: 14 }}>
          <div className="combat-ini" style={{ fontSize: 14, marginBottom: 6 }}>{g.title}</div>
          <table>
            <tbody>
              {g.keys.filter((k) => GLOSSARIO[k]).map((k) => (
                <tr key={k}>
                  <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}><b>{k}</b></td>
                  <td className="roid-count">{GLOSSARIO[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
