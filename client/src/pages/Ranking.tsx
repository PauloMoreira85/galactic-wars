import { useEffect, useState } from "react";
import { api } from "../api";
import { CoordLink } from "../components/CoordLink";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }
type Tab = "planetas" | "galaxias" | "aliancas";

export function Ranking() {
  const [tab, setTab] = useState<Tab>("planetas");
  return (
    <div className="panel">
      <h2>🏆 Rankings</h2>
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
  useEffect(() => { api.ranking().then((d) => setRows(d.ranking)).catch(() => {}); }, []);
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead><tr><th className="rank-num">#</th><th>Comandante</th><th>Planeta</th><th className="hide-sm">Coord.</th><th>Pontuação</th><th className="hide-sm">Roids</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="rank-num">{i + 1}º</td>
              <td><b>{r.username}</b></td>
              <td>{r.planet}</td>
              <td className="hide-sm"><CoordLink c={r.coords} /></td>
              <td>{fmt(r.score)}</td>
              <td className="hide-sm roid-count">{fmt(r.roids)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
