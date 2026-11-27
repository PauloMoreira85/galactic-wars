import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CoordLink } from "../components/CoordLink";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }
type Tab = "planetas" | "galaxias" | "aliancas";

// Símbolos de relação (cumulativos). Estáticos: 🔵 mesma galáxia, 🟢 aliado.
// Combate (só o VIEWER vê, não vaza — mesma info do Tráfego dele):
// ⚔️ eu ataco · 🔴 me ataca · 🟠 ataca minha galáxia · ⚠️ ataca um aliado.
export type RelacoesProps = {
  sameGalaxy?: boolean; ally?: boolean;
  iAttack?: boolean; attacksMe?: boolean; attacksMyGalaxy?: boolean; attacksAlly?: boolean;
};
export function Relacoes({ sameGalaxy, ally, iAttack, attacksMe, attacksMyGalaxy, attacksAlly }: RelacoesProps) {
  const sym: { e: string; t: string }[] = [];
  if (sameGalaxy) sym.push({ e: "🔵", t: "Mesma galáxia" });
  if (ally) sym.push({ e: "🟢", t: "Aliado" });
  if (iAttack) sym.push({ e: "⚔️", t: "Você está atacando este planeta" });
  if (attacksMe) sym.push({ e: "🔴", t: "Este planeta está atacando VOCÊ" });
  if (attacksMyGalaxy) sym.push({ e: "🟠", t: "Está atacando um planeta da sua galáxia" });
  if (attacksAlly) sym.push({ e: "⚠️", t: "Está atacando um aliado seu" });
  if (sym.length === 0) return <span className="roid-count">–</span>;
  return (
    <span style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
      {sym.map((s, i) => <span key={i} title={s.t} style={{ cursor: "help" }}>{s.e}</span>)}
    </span>
  );
}

const RACE_COLOR: Record<string, string> = {
  humanos: "#5cc8ff", daharan: "#b98bff", rakshasa: "#ff6b6b",
  mech: "#ffb648", insecta: "#4bd47a",
};

function RaceDistribution() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.raceDistribution>> | null>(null);
  useEffect(() => { api.raceDistribution().then(setData).catch(() => {}); }, []);
  if (!data || data.total === 0) return null;
  return (
    <div className="race-dist">
      <div className="race-dist-head">🧬 Distribuição de raças <span className="roid-count">· {data.total} comandantes</span></div>
      <div className="race-dist-bar">
        {data.dist.map((r) => r.count > 0 && (
          <div key={r.key} style={{ width: `${r.pct}%`, background: RACE_COLOR[r.key] || "#888" }}
               title={`${r.name}: ${r.pct}% (${r.count})`} />
        ))}
      </div>
      <div className="race-dist-legend">
        {data.dist.map((r) => (
          <span key={r.key}>
            <i style={{ background: RACE_COLOR[r.key] || "#888" }} />
            {r.name} <b>{r.pct}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Ranking() {
  const [tab, setTab] = useState<Tab>("planetas");
  return (
    <div className="panel">
      <h2>🏆 Rankings</h2>
      <RaceDistribution />
      <div className="auth-tabs" style={{ maxWidth: 520, marginBottom: 14 }}>
        <button className={tab === "planetas" ? "active" : ""} onClick={() => setTab("planetas")}>🪐 Planetas</button>
        <button className={tab === "galaxias" ? "active" : ""} onClick={() => setTab("galaxias")}>🌌 Galáxias</button>
        <button className={tab === "aliancas" ? "active" : ""} onClick={() => setTab("aliancas")}>🤝 Alianças</button>
      </div>
      {tab === "planetas" && <RankPlanetas />}
      {tab === "galaxias" && <RankGalaxias />}
      {tab === "aliancas" && <RankAliancas />}
    </div>
  );
}

type SortKey = "score" | "roids" | "username" | "planet";

function RankPlanetas() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.ranking>>["ranking"]>([]);
  // Ordenação tipo "Excel" (pedido do Lythorf): clica no cabeçalho pra ordenar.
  // Default = pontuação desc (como vem do servidor).
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const myRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => { api.ranking().then((d) => setRows(d.ranking)).catch(() => {}); }, []);
  // Posição OFICIAL (por pontuação, como o servidor manda) — não muda com a ordenação.
  const myPos = rows.findIndex((r) => r.you);
  const scrollToMe = () => myRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  // Clica no cabeçalho: alterna direção se já é a coluna atual; senão vira a nova coluna.
  const clickSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir(k === "username" || k === "planet" ? "asc" : "desc"); }
  };
  const arrow = (k: SortKey) => (k === sortKey ? (sortDir === "desc" ? " ▼" : " ▲") : "");
  const sorted = rows.map((r, idx) => ({ r, idx })).sort((a, b) => {
    let cmp = 0;
    if (sortKey === "score") cmp = a.r.score - b.r.score;
    else if (sortKey === "roids") cmp = a.r.roids - b.r.roids;
    else if (sortKey === "username") cmp = a.r.username.localeCompare(b.r.username, "pt-BR");
    else cmp = a.r.planet.localeCompare(b.r.planet, "pt-BR");
    if (cmp === 0) cmp = a.idx - b.idx; // desempate = ordem oficial (pontuação)
    return sortDir === "desc" ? -cmp : cmp;
  }).map((x) => x.r);
  const thSort = { cursor: "pointer", userSelect: "none" as const, whiteSpace: "nowrap" as const };
  return (
    <>
      {myPos >= 0 && (
        <div className="cost" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>⭐ Você está em <b style={{ color: "var(--accent)" }}>{myPos + 1}º</b> lugar.</span>
          <button className="link" onClick={scrollToMe}>ir pra minha posição →</button>
        </div>
      )}
      {/* Legenda dos símbolos (pedido do Kxsto): o que cada bolinha/ícone significa. */}
      <div className="cost rank-legend" style={{ marginBottom: 10, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span><b>Relações:</b></span>
        <span>🔵 mesma galáxia</span>
        <span>🟢 aliado</span>
        <span>⚔️ você ataca</span>
        <span>🔴 te ataca</span>
        <span>🟠 ataca sua galáxia</span>
        <span>⚠️ ataca aliado</span>
        <span style={{ opacity: 0.6 }}>–  nenhuma</span>
        <span style={{ marginLeft: 8 }}><b>Alvo:</b></span>
        <span>🎯 no seu alcance</span>
        <span>🔒 fora do alcance</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th className="rank-num" title="posição oficial (por pontuação)">#</th><th style={thSort} onClick={() => clickSort("username")}>Comandante{arrow("username")}</th><th style={thSort} onClick={() => clickSort("planet")}>Planeta{arrow("planet")}</th><th className="hide-sm">Coord.</th><th title="🔵 mesma galáxia · 🟢 aliado">Relações</th><th style={thSort} onClick={() => clickSort("score")} title="clique pra ordenar">Pontuação{arrow("score")}</th><th style={thSort} onClick={() => clickSort("roids")} title="clique pra ordenar">Roids{arrow("roids")}</th><th title="Dá pra atacar a partir do seu planeta?">Alvo</th></tr></thead>
          <tbody>
            {sorted.map((r) => {
              const oficial = rows.indexOf(r); // posição oficial (por pontuação)
              return (
              <tr key={oficial} ref={r.you ? myRowRef : undefined} className={r.you ? "rank-me" : undefined}>
                <td className="rank-num">{r.you && "⭐ "}{oficial + 1}º</td>
                <td><b>{r.username}</b>{r.you && <span className="roid-count" style={{ color: "var(--accent)" }}> (você)</span>}</td>
                <td>{r.planet}</td>
                <td className="hide-sm"><CoordLink c={r.coords} /></td>
                <td>{r.you ? <span className="roid-count">–</span> : <Relacoes sameGalaxy={r.sameGalaxy} ally={r.ally} iAttack={r.iAttack} attacksMe={r.attacksMe} attacksMyGalaxy={r.attacksMyGalaxy} attacksAlly={r.attacksAlly} />}</td>
                <td>{fmt(r.score)}</td>
                <td className="roid-count">{fmt(r.roids)}</td>
                <td>
                  {r.you ? <span className="roid-count">—</span>
                    : r.inRange
                      ? <span style={{ color: "var(--good, #4bd47a)" }} title="No seu alcance — você pode atacar">🎯 no alcance</span>
                      : <span className="roid-count" title="Fora do alcance (aliado, sob proteção de novato, ou pontuação baixa demais)">🔒 fora</span>}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RankGalaxias() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.galaxyRanking>>["ranking"]>([]);
  const [sortKey, setSortKey] = useState<"score" | "roids" | "planets">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  useEffect(() => { api.galaxyRanking().then((d) => setRows(d.ranking)).catch(() => {}); }, []);
  const clickSort = (k: "score" | "roids" | "planets") => {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const arrow = (k: string) => (k === sortKey ? (sortDir === "desc" ? " ▼" : " ▲") : "");
  const thSort = { cursor: "pointer", userSelect: "none" as const, whiteSpace: "nowrap" as const };
  const sorted = [...rows].sort((a, b) => {
    const cmp = (a[sortKey] as number) - (b[sortKey] as number);
    return sortDir === "desc" ? -cmp : cmp;
  });
  return (
    <div style={{ overflowX: "auto" }}>
      <div className="cost" style={{ marginBottom: 8, fontSize: 12 }}>Clique no cabeçalho pra ordenar por pontuação, roids ou planetas. 📊</div>
      <table>
        <thead><tr><th className="rank-num">#</th><th>Galáxia</th><th style={thSort} onClick={() => clickSort("planets")}>Planetas{arrow("planets")}</th><th style={thSort} onClick={() => clickSort("score")}>Pontuação{arrow("score")}</th><th style={thSort} onClick={() => clickSort("roids")} title="total de roids da galáxia">Roids{arrow("roids")}</th></tr></thead>
        <tbody>
          {sorted.map((g, i) => (
            <tr key={g.galaxy}>
              <td className="rank-num">{i + 1}º</td>
              <td><b>{g.name ?? `Galáxia ${g.coord}`}</b> <span className="roid-count">(<CoordLink c={g.coord} />)</span></td>
              <td>{g.planets}</td>
              <td>{fmt(g.score)}</td>
              <td className="roid-count">{fmt(g.roids)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankAliancas() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.allianceRanking>>["ranking"]>([]);
  useEffect(() => { api.allianceRanking().then((d) => setRows(d.ranking)).catch(() => {}); }, []);
  return (
    <>
      <div className="cost" style={{ marginBottom: 8, fontSize: 12 }}>Todas as alianças do universo, por pontuação somada dos membros.</div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th className="rank-num">#</th><th>Tag</th><th>Nome</th><th>Membros</th><th>Pontuação</th><th className="hide-sm">Média/membro</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={6} className="roid-count">Nenhuma aliança ainda.</td></tr> : rows.map((a, i) => (
              <tr key={a.id}>
                <td className="rank-num">{i + 1}º</td>
                <td><b style={{ color: "var(--accent)" }}>{a.tag}</b></td>
                <td>{a.name}</td>
                <td>{a.members}</td>
                <td>{fmt(a.score)}</td>
                <td className="hide-sm roid-count">{fmt(a.avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
