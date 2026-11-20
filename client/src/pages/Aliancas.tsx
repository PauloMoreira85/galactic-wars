import { useEffect, useState } from "react";
import { api, REFRESH_MS, type AllianceView, type AttackBoardView, type AllianceIntelItem, ROLE_LABEL, ALLIANCE_ROLES } from "../api";
import { CoordLink } from "../components/CoordLink";

// Abre a Calculadora (aba nova) com a frota do alvo já carregada na defesa,
// a partir do hash de uma espionagem (reusa o preset lido pela Calculadora).
function abrirCalcComHash(hash: string) {
  try { localStorage.setItem("gw_calc_preset", JSON.stringify({ defHash: hash, at: Date.now() })); } catch {}
  window.open("/ferramentas?tool=calculadora", "_blank", "noopener");
}

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

      <MuralOrdens a={a} act={act} />

      <QuadroAtaque />

      <IntelDaTag />

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

      {(a.myRole === "dc" || a.myRole === "ac" || a.myRole === "lider" || a.myRole === "alto_comando") && <PainelMovimentacao />}

      <div className="panel">
        <h2>Membros</h2>
        <table>
          <thead><tr><th>Comandante</th><th>Planeta</th><th>Coord.</th><th>Cargo</th>{a.canManage && <th>Ações</th>}</tr></thead>
          <tbody>
            {a.members!.map((m) => {
              // Cargos que ESTE usuário pode atribuir a este membro.
              // TL: todos. HC: só os operacionais (não TL/HC) e só em quem não é TL/HC.
              const targetLocked = m.role === "lider" || (!a.isLeader && m.role === "alto_comando");
              const assignable = a.isLeader ? ALLIANCE_ROLES : ALLIANCE_ROLES.filter((r) => r !== "lider" && r !== "alto_comando");
              const canKick = a.canManage && !targetLocked && m.role !== "lider" && (a.isLeader || m.role !== "alto_comando");
              return (
                <tr key={m.planetId}>
                  <td>{m.commander}</td>
                  <td>{m.name}</td>
                  <td><CoordLink c={m.coords} /></td>
                  <td>
                    {a.canManage && !targetLocked ? (
                      <select value={m.role} onChange={(e) => act(() => api.allianceRole(m.planetId, e.target.value))}
                        style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px" }}>
                        {assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    ) : <b>{ROLE_LABEL[m.role] ?? m.role}</b>}
                  </td>
                  {a.canManage && <td>{canKick && <button onClick={() => act(() => api.allianceKick(m.planetId))}>expulsar</button>}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Mural de ordens da tag: recado do TL/HC visível a todos; só TL/HC edita.
function MuralOrdens({ a, act }: { a: AllianceView; act: (fn: () => Promise<AllianceView>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(a.orders ?? "");
  const when = a.ordersAt ? new Date(a.ordersAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
  return (
    <div className="panel" style={{ borderColor: "var(--accent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>📣 Ordens da Tag</h2>
        {a.canManage && !editing && <button className="link" onClick={() => { setText(a.orders ?? ""); setEditing(true); }}>editar</button>}
      </div>
      {editing ? (
        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3}
            placeholder="Ex: Alvo da semana: galáxia 4. Defender 3:2:1 às 20h. Juntar frota pra MASS sexta."
            style={{ width: "100%", margin: "6px 0", resize: "vertical", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => act(async () => { const r = await api.allianceOrders(text); setEditing(false); return r; })}>salvar</button>
            <button className="link" onClick={() => setEditing(false)}>cancelar</button>
          </div>
        </div>
      ) : a.orders ? (
        <>
          <div style={{ whiteSpace: "pre-wrap", margin: "6px 0", fontSize: 15 }}>{a.orders}</div>
          {when && <div className="roid-count" style={{ fontSize: 11 }}>— {a.ordersBy ?? "?"} · {when}</div>}
        </>
      ) : (
        <div className="roid-count">Sem ordens no momento.{a.canManage && " Clique em editar pra definir."}</div>
      )}
    </div>
  );
}

// Quadro de Ataque — sala de alvos (estilo mIRC). Todos veem; comando organiza;
// membro pega quando liberado. 1º a pegar vira dono e decide se abre pra MASS.
function QuadroAtaque() {
  const [b, setB] = useState<AttackBoardView | null>(null);
  const [err, setErr] = useState("");
  const [coord, setCoord] = useState("");
  const [note, setNote] = useState("");
  async function load() { try { setB(await api.attackBoard()); setErr(""); } catch (e: any) { setErr(e.message ?? "Falha"); } }
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, []);
  async function act(fn: () => Promise<AttackBoardView>) { setErr(""); try { setB(await fn()); } catch (e: any) { setErr(e.message ?? "Falha"); } }
  if (!b) return null;

  return (
    <div className="panel" style={{ borderColor: "var(--danger)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2>⚔️ Quadro de Ataque {b.locked ? <span className="roid-count" style={{ fontSize: 13 }}>🔒 travado</span> : <span style={{ color: "var(--carbonum)", fontSize: 13 }}>🔓 liberado — pegue os alvos!</span>}</h2>
        {b.canManage && (
          <button onClick={() => act(() => api.attackLock(!b.locked))} style={{ padding: "4px 12px" }}>
            {b.locked ? "🔓 liberar quadro" : "🔒 travar quadro"}
          </button>
        )}
      </div>
      <div className="cost" style={{ marginBottom: 8 }}>
        {b.canManage ? "Coloque os alvos e trave/libere a sala. " : ""}
        Quem pega o alvo primeiro é o <b>dono</b> e decide se divide (MASS) ou mantém pra si.
      </div>

      {b.canManage && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <input placeholder="coord (g:s:slot)" value={coord} onChange={(e) => setCoord(e.target.value)} style={{ width: 130, margin: 0, padding: "6px 8px" }} />
          <input placeholder="nota (ex: wave 2, 20h, leva tudo)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 240, margin: 0, padding: "6px 8px" }} />
          <button disabled={!coord.trim()} onClick={() => act(async () => { const r = await api.attackAdd(coord.trim(), note.trim()); setCoord(""); setNote(""); return r; })}>+ alvo</button>
        </div>
      )}

      {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}

      {b.targets.length === 0 ? (
        <div className="roid-count">Nenhum alvo no quadro ainda.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Alvo</th><th>Nota</th><th>Quem vai</th><th></th></tr></thead>
            <tbody>
              {b.targets.map((t) => (
                <tr key={t.id}>
                  <td>
                    <CoordLink c={t.coord} />{t.targetName && <span className="roid-count"> · {t.targetName}</span>}
                    {t.shared && <span style={{ color: "var(--carbonum)", fontSize: 11 }}> · MASS aberto</span>}
                    {t.intelHash && <button className="link" title="Espionagem compartilhada deste alvo — abrir na Calculadora" style={{ marginLeft: 6 }} onClick={() => abrirCalcComHash(t.intelHash!)}>🔍 intel</button>}
                  </td>
                  <td className="roid-count">{t.note ?? "—"}</td>
                  <td>
                    {t.claimers.length === 0 ? <span className="roid-count">—</span> : t.claimers.map((c, i) => (
                      <span key={c.planetId}>
                        {i > 0 && ", "}
                        <b style={{ color: c.isOwner ? "var(--accent)" : undefined }}>{c.name}</b>{c.isOwner && " 👑"}
                      </span>
                    ))}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {/* Pegar / largar */}
                    {t.mineClaimed ? (
                      <button className="link" onClick={() => act(() => api.attackUnclaim(t.id))}>largar</button>
                    ) : (
                      <button disabled={b.locked || (!!t.ownerPlanetId && !t.shared)} onClick={() => act(() => api.attackClaim(t.id))}
                        title={b.locked ? "quadro travado" : (!!t.ownerPlanetId && !t.shared ? "alvo fechado pelo dono" : "pegar este alvo")}>
                        pegar
                      </button>
                    )}
                    {/* Dono abre/fecha MASS */}
                    {t.iAmOwner && (
                      <button className="link" style={{ marginLeft: 8 }} onClick={() => act(() => api.attackShare(t.id, !t.shared))}>
                        {t.shared ? "fechar" : "abrir p/ MASS"}
                      </button>
                    )}
                    {/* Comando remove o alvo */}
                    {b.canManage && <button className="link" style={{ marginLeft: 8, color: "var(--danger)" }} onClick={() => act(() => api.attackRemove(t.id))}>remover</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Intel da Tag — espionagens compartilhadas (qualquer membro compartilha e vê).
function IntelDaTag() {
  const [intel, setIntel] = useState<AllianceIntelItem[]>([]);
  const [hash, setHash] = useState("");
  const [err, setErr] = useState("");
  async function load() { try { setIntel((await api.allianceIntel()).intel); setErr(""); } catch (e: any) { setErr(e.message ?? "Falha"); } }
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, []);
  async function share() {
    if (!hash.trim()) return;
    setErr("");
    try { setIntel((await api.allianceIntelShare(hash.trim().toUpperCase())).intel); setHash(""); } catch (e: any) { setErr(e.message ?? "Falha"); }
  }
  async function remove(id: string) { try { setIntel((await api.allianceIntelUnshare(id)).intel); } catch {} }
  const when = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  const AGENT: Record<string, string> = { P: "Padrão", M: "Militar", T: "Transmissão", D: "Duplo" };

  return (
    <div className="panel" style={{ borderColor: "var(--accent)" }}>
      <h2>🛰️ Intel da Tag</h2>
      <div className="cost" style={{ marginBottom: 8 }}>
        Espionagens compartilhadas com a aliança. Pegue o <b>código</b> de um relatório seu (Ferramentas → Espionagens) e compartilhe pra tag ver.
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <input placeholder="código da espionagem (ex: A1B2C3)" value={hash} onChange={(e) => setHash(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") share(); }} maxLength={16} style={{ width: 240, margin: 0, padding: "6px 8px" }} />
        <button disabled={!hash.trim()} onClick={share}>compartilhar</button>
      </div>
      {err && <div className="error" style={{ marginBottom: 8 }}>{err}</div>}
      {intel.length === 0 ? (
        <div className="roid-count">Nenhuma espionagem compartilhada ainda.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Alvo</th><th>Agente</th><th>Por</th><th>Quando</th><th></th></tr></thead>
            <tbody>
              {intel.map((r) => (
                <tr key={r.id}>
                  <td><CoordLink c={r.targetCoords} /> <span className="roid-count">· {r.targetName}</span></td>
                  <td className="roid-count">{AGENT[r.agent] ?? r.agent}</td>
                  <td>{r.sharedBy}</td>
                  <td className="roid-count">{when(r.at)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="link" title="Abrir a frota do alvo na Calculadora" onClick={() => abrirCalcComHash(r.spyHash)}>🔍 calc</button>
                    <button className="link" style={{ marginLeft: 8, color: "var(--danger)" }} onClick={() => remove(r.id)}>remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Painel de Comando — movimentação da aliança (DC/AC/TL/HC veem). Atualiza sozinho.
function PainelMovimentacao() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.allianceFleets>> | null>(null);
  const [err, setErr] = useState("");
  async function load() { try { setData(await api.allianceFleets()); setErr(""); } catch (e: any) { setErr(e.message ?? "Sem acesso"); } }
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, []);

  const isAC = data?.role === "ac";
  // DC foca em defesa; AC foca em ataque. Ambos veem tudo, só muda a ordem/ênfase.
  return (
    <div className="panel" style={{ borderColor: "var(--accent)" }}>
      <h2>🎯 Painel de Comando {isAC ? "— Ataque (AC)" : "— Defesa (DC)"}</h2>
      <div className="cost" style={{ marginBottom: 10 }}>
        Movimentação da aliança — visível ao comando (<b>DC</b>, <b>AC</b>, <b>HC</b> e <b>TL</b>). Organize {isAC ? "as waves de ataque" : "a defesa dos aliados"} e reporte-se ao Alto Comando.
      </div>
      {err && <div className="error">{err}</div>}

      {/* Ataques inimigos a caminho dos aliados (prioridade do DC). */}
      <div style={{ marginBottom: 14 }}>
        <div className="combat-ini" style={{ fontSize: 14, marginBottom: 6 }}>🚨 Ataques inimigos a caminho de aliados ({data?.attacks.length ?? 0})</div>
        {(data?.attacks.length ?? 0) === 0 ? <div className="roid-count">Nenhum ataque detectado a caminho dos aliados. 👍</div> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Atacante</th><th>De</th><th>Alvo (aliado)</th><th>Situação</th><th>Chega</th></tr></thead>
              <tbody>
                {data!.attacks.map((x, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--danger)" }}><b>{x.attacker}</b></td>
                    <td><CoordLink c={x.attackerCoords} /></td>
                    <td><CoordLink c={x.target} /></td>
                    <td className="roid-count">{x.status}</td>
                    <td><b>{x.ticksLeft === 0 ? "agora" : `${x.ticksLeft}t`}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Frotas dos membros em movimento. */}
      <div>
        <div className="combat-ini" style={{ fontSize: 14, marginBottom: 6 }}>🚀 Frotas da aliança em movimento ({data?.memberFleets.length ?? 0})</div>
        {(data?.memberFleets.length ?? 0) === 0 ? <div className="roid-count">Nenhuma frota da aliança em movimento.</div> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Membro</th><th>De</th><th>Frota</th><th>Missão</th><th>Alvo</th><th>Naves</th><th>Situação</th><th>Chega</th></tr></thead>
              <tbody>
                {data!.memberFleets.map((f, i) => (
                  <tr key={i}>
                    <td><b>{f.owner}</b></td>
                    <td><CoordLink c={f.ownerCoords} /></td>
                    <td className="roid-count">{f.name}</td>
                    <td style={{ color: f.mission === "attack" ? "var(--danger)" : "var(--carbonum)" }}>{f.mission === "attack" ? "⚔️ ataque" : "🛡️ defesa"}</td>
                    <td><CoordLink c={f.target} /></td>
                    <td>{f.ships.toLocaleString("pt-BR")}</td>
                    <td className="roid-count">{f.status}</td>
                    <td><b>{f.ticksLeft === 0 ? "—" : `${f.ticksLeft}t`}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
