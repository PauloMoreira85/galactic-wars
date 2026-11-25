import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CoordLink } from "../components/CoordLink";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }
type Tab = "planetas" | "galaxias" | "aliancas";

// Símbolos de relação (cumulativos): 🔵 mesma galáxia, 🟢 aliado. Legenda no hover.
export function Relacoes({ sameGalaxy, ally }: { sameGalaxy?: boolean; ally?: boolean }) {
  const sym: { e: string; t: string }[] = [];
  if (sameGalaxy) sym.push({ e: "🔵", t: "Mesma galáxia" });
  if (ally) sym.push({ e: "🟢", t: "Aliado" });
  if (sym.length === 0) return <span className="roid-count">–</span>;
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
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

function RankPlanetas() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.ranking>>["ranking"]>([]);
  const myRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => { api.ranking().then((d) => setRows(d.ranking)).catch(() => {}); }, []);
  const myPos = rows.findIndex((r) => r.you); // índice da minha linha (−1 se não achou)
  const scrollToMe = () => myRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <>
      {myPos >= 0 && (
        <div className="cost" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>⭐ Você está em <b style={{ color: "var(--accent)" }}>{myPos + 1}º</b> lugar.</span>
          <button className="link" onClick={scrollToMe}>ir pra minha posição →</button>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th className="rank-num">#</th><th>Comandante</th><th>Planeta</th><th className="hide-sm">Coord.</th><th title="🔵 mesma galáxia · 🟢 aliado">Relações</th><th>Pontuação</th><th>Roids</th><th title="Dá pra atacar a partir do seu planeta?">Alvo</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} ref={r.you ? myRowRef : undefined} className={r.you ? "rank-me" : undefined}>
                <td className="rank-num">{r.you && "⭐ "}{i + 1}º</td>
                <td><b>{r.username}</b>{r.you && <span className="roid-count" style={{ color: "var(--accent)" }}> (você)</span>}</td>
                <td>{r.planet}</td>
                <td className="hide-sm"><CoordLink c={r.coords} /></td>
                <td>{r.you ? <span className="roid-count">–</span> : <Relacoes sameGalaxy={r.sameGalaxy} ally={r.ally} />}</td>
                <td>{fmt(r.score)}</td>
                <td className="roid-count">{fmt(r.roids)}</td>
                <td>
                  {r.you ? <span className="roid-count">—</span>
                    : r.inRange
                      ? <span style={{ color: "var(--good, #4bd47a)" }} title="No seu alcance — você pode atacar">⚔️ no alcance</span>
                      : <span className="roid-count" title="Fora do alcance (aliado, sob proteção de novato, ou pontuação baixa demais)">🔒 fora</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RankGalaxias() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.galaxyRanking>>["ranking"]>([]);
  useEffect(() => { api.galaxyRanking().then((d) => setRows(d.ranking)).catch(() => {}); }, []);
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead><tr><th className="rank-num">#</th><th>Galáxia</th><th>Planetas</th><th>Pontuação</th></tr></thead>
        <tbody>
          {rows.map((g, i) => (
            <tr key={i}>
              <td className="rank-num">{i + 1}º</td>
              <td><b>{g.name ?? `Galáxia ${g.coord}`}</b> <span className="roid-count">(<CoordLink c={g.coord} />)</span></td>
              <td>{g.planets}</td>
              <td>{fmt(g.score)}</td>
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
