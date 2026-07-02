import { useEffect, useState } from "react";
import { api, REFRESH_MS, type AllianceView, ROLE_LABEL, ALLIANCE_ROLES } from "../api";

export function Aliancas() {
  const [a, setA] = useState<AllianceView | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [invite, setInvite] = useState("");

  async function load() { try { setA(await api.alliance()); } catch (e: any) { setError(e.message ?? "Falha"); } }
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, []);
  async function act(fn: () => Promise<AllianceView>) {
    setError("");
    try { setA(await fn()); } catch (e: any) { setError(e.message ?? "Falha"); }
  }

  if (!a) return <div className="panel"><div className="roid-count">Carregando...</div></div>;

  if (!a.inAlliance) {
    return (
      <>
        <div className="panel">
          <h2>Criar aliança</h2>
          <div className="cost">Você vira o Líder. Depois é só convidar jogadores pelo nome (login).</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <input placeholder="Nome da aliança" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220, margin: 0, padding: "6px 8px" }} />
            <input placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: 100, margin: 0, padding: "6px 8px" }} />
            <button disabled={!name.trim() || !tag.trim()} onClick={() => act(() => api.allianceCreate(name.trim(), tag.trim()))}>criar</button>
          </div>
          {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
        <div className="panel">
          <h2>Convites recebidos</h2>
          {(a.invites?.length ?? 0) === 0 ? (
            <div className="roid-count">Nenhum convite no momento.</div>
          ) : (
            a.invites!.map((i) => (
              <div className="roid-row" key={i.allianceId}>
                <div><b>{i.name}</b> <span className="roid-count">[{i.tag}]</span></div>
                <button onClick={() => act(() => api.allianceAccept(i.allianceId))}>aceitar</button>
              </div>
            ))
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>{a.name} <span className="roid-count">[{a.tag}]</span></h2>
          <button className="link" onClick={() => act(() => api.allianceLeave())}>sair da aliança</button>
        </div>
        <div className="cost">Seu cargo: <span>{ROLE_LABEL[a.myRole!] ?? a.myRole}</span> · {a.members!.length}/60 membros</div>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      {a.canInvite && (
        <div className="panel">
          <h2>Convidar jogador</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <input placeholder="nome (login) do jogador" value={invite} onChange={(e) => setInvite(e.target.value)} style={{ width: 240, margin: 0, padding: "6px 8px" }} />
            <button disabled={!invite.trim()} onClick={() => act(async () => { const r = await api.allianceInvite(invite.trim()); setInvite(""); return r; })}>convidar</button>
          </div>
          {(a.pending?.length ?? 0) > 0 && (
            <div className="cost" style={{ marginTop: 8 }}>Convites pendentes: {a.pending!.map((p) => p.commander).join(", ")}</div>
          )}
        </div>
      )}

      <div className="panel">
        <h2>Membros</h2>
        <table>
          <thead><tr><th>Comandante</th><th>Planeta</th><th>Coord.</th><th>Cargo</th>{a.isLeader && <th>Ações</th>}</tr></thead>
          <tbody>
            {a.members!.map((m) => (
              <tr key={m.planetId}>
                <td>{m.commander}</td>
                <td>{m.name}</td>
                <td>{m.coords}</td>
                <td>
                  {a.isLeader && m.role !== "lider" ? (
                    <select value={m.role} onChange={(e) => act(() => api.allianceRole(m.planetId, e.target.value))}
                      style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px" }}>
                      {ALLIANCE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  ) : <b>{ROLE_LABEL[m.role] ?? m.role}</b>}
                </td>
                {a.isLeader && <td>{m.role !== "lider" && <button onClick={() => act(() => api.allianceKick(m.planetId))}>expulsar</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
