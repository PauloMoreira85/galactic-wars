import { useEffect, useState } from "react";
import { api, type AssociadoView, type PrivateView } from "../api";
import { CoordLink } from "../components/CoordLink";

// Associados: status premium (grátis no início). Benefícios: trocar nome 3x,
// galáxia privada (em breve).
export function Associados({ onChanged }: { onChanged: () => void }) {
  const [view, setView] = useState<AssociadoView | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setView(await api.associado()); } catch (e: any) { setError(e.message ?? "Falha"); }
  }
  useEffect(() => { load(); }, []);

  async function act(fn: () => Promise<AssociadoView>) {
    setBusy(true); setError("");
    try { setView(await fn()); onChanged(); } catch (e: any) { setError(e.message ?? "Falha"); }
    finally { setBusy(false); }
  }

  if (!view) return <div className="panel"><div className="roid-count">Carregando...</div></div>;

  return (
    <>
      <div className="panel">
        <h2>Associados ⭐</h2>
        <div className="cost" style={{ marginBottom: 10 }}>
          No início do jogo qualquer comandante pode se tornar Associado (grátis). Benefícios: <b>escolher a aparência do seu planeta</b>, trocar de nome até 3×, criar galáxia privada e escolher quem participa.
        </div>
        <div className="status-row"><span>Status</span><b style={{ color: view.associado ? "var(--carbonum)" : "var(--muted)" }}>{view.associado ? "⭐ Associado" : "comum"}</b></div>
        <div className="status-row"><span>Comandante</span><b>{view.username}</b></div>
        {view.associado && <div className="status-row"><span>Trocas de nome</span><b>{view.nameChanges}/{view.maxNameChanges} usadas</b></div>}
        {!view.associado && (
          <button style={{ marginTop: 12 }} disabled={busy} onClick={() => act(() => api.associadoJoin())}>
            {busy ? "..." : "⭐ Tornar-se Associado (grátis)"}
          </button>
        )}
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {view.associado && (
        <div className="panel">
          <h2>Trocar nome de comandante</h2>
          <div className="cost">Restam <b>{view.nameChangesLeft}</b> de {view.maxNameChanges} trocas.</div>
          {view.nameChangesLeft > 0 ? (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="novo nome..." maxLength={30} style={{ width: 220, margin: 0, padding: "6px 10px" }} />
              <button disabled={busy || !name.trim()} onClick={() => act(() => api.associadoRename(name.trim()))}>{busy ? "..." : "trocar"}</button>
            </div>
          ) : <div className="roid-count" style={{ marginTop: 8 }}>Você já usou todas as trocas de nome.</div>}
        </div>
      )}

      {view.associado && view.skins && (
        <div className="panel">
          <h2>🪐 Aparência do planeta</h2>
          <div className="cost" style={{ marginBottom: 10 }}>
            Escolha como seu planeta aparece no mapa da galáxia. A aparência é só visual e <b>não revela sua raça</b> — todos veem a mesma, mas ninguém descobre quem você é por ela.
          </div>
          <div className="skin-grid">
            {view.skins.map((s) => (
              <button
                type="button"
                key={s.key}
                className={`skin-card ${view.skin === s.key ? "selected" : ""}`}
                disabled={busy}
                onClick={() => act(() => api.associadoSkin(s.key))}
                title={s.name}
              >
                <img src={`/art/planets/${s.key}.jpg`} alt={s.name} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view.shield && (
        <div className="panel">
          <h2>🛡️ Escudo de proteção</h2>
          <div className="cost" style={{ marginBottom: 10 }}>
            Ativa uma proteção de <b>{view.shield.ticks} ticks</b> — ninguém pode te atacar enquanto durar.
            É um recurso de <b>uso único</b>: só dá pra usar <b>1 vez</b>. Se você ainda estiver sob proteção de novato, o escudo começa a contar quando ela acabar.
          </div>
          {view.shield.active ? (
            <div className="status-row"><span>Escudo</span><b style={{ color: "var(--carbonum)" }}>🛡️ ativo — {view.shield.ticksLeft} tick(s) restantes</b></div>
          ) : view.shield.used ? (
            <div className="status-row"><span>Escudo</span><b style={{ color: "var(--muted)" }}>já utilizado (acabou)</b></div>
          ) : (
            <button style={{ marginTop: 4 }} disabled={busy} onClick={() => {
              if (!window.confirm(`Ativar o escudo de proteção por ${view.shield!.ticks} ticks? É 1 vez só — não dá pra usar de novo depois.`)) return;
              act(() => api.associadoShield());
            }}>{busy ? "..." : `🛡️ Ativar proteção (${view.shield.ticks} ticks) — 1 uso`}</button>
          )}
        </div>
      )}

      {/* Galáxia privada liberada pra TODOS (não só Associados). */}
      <GalaxiaPrivada onChanged={onChanged} />
    </>
  );
}

function GalaxiaPrivada({ onChanged }: { onChanged: () => void }) {
  const [pv, setPv] = useState<PrivateView | null>(null);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() { try { setPv(await api.privateView()); } catch {} }
  useEffect(() => { load(); }, []);
  async function act(fn: () => Promise<PrivateView>) {
    setBusy(true); setError("");
    try { setPv(await fn()); onChanged(); } catch (e: any) { setError(e.message ?? "Falha"); }
    finally { setBusy(false); }
  }

  if (!pv) return null;

  return (
    <div className="panel">
      <h2>🔒 Galáxia privada</h2>
      <div className="cost" style={{ marginBottom: 10 }}>Crie uma galáxia fechada e convide quem pode entrar. O auto-exílio nunca cai numa galáxia privada.</div>

      {!pv.owned ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="nome da galáxia..." maxLength={40} style={{ width: 200, margin: 0, padding: "6px 10px" }} />
          <button disabled={busy} onClick={() => act(() => api.privateCreate(name.trim()))}>{busy ? "..." : "criar galáxia privada"}</button>
        </div>
      ) : (
        <>
          <div className="status-row"><span>Sua galáxia</span><b>{pv.owned.name} (galáxia {pv.owned.galaxy})</b></div>
          {pv.canRecreate && (
            <div style={{ margin: "8px 0", padding: "8px 10px", border: "1px solid var(--accent)", borderRadius: 8, background: "rgba(37,211,255,0.06)" }}>
              <div className="cost" style={{ marginBottom: 6 }}>
                Sua galáxia privada é de uma versão antiga do jogo. Você pode <b>recriá-la no universo novo</b> — <b>só você</b> muda de lugar (sorteado); os membros atuais continuam onde estão.
              </div>
              <button disabled={busy} onClick={() => {
                if (!window.confirm("Recriar sua galáxia privada no universo novo? Só VOCÊ será movido (sorteado); os outros membros ficam onde estão.")) return;
                act(() => api.privateRecreate());
              }}>{busy ? "..." : "🔄 recriar no universo novo"}</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
            <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="convidar (nome do líder)..." style={{ width: 200, margin: 0, padding: "6px 10px" }} />
            <button disabled={busy || !invite.trim()} onClick={() => act(() => api.privateInvite(invite.trim()))}>{busy ? "..." : "convidar"}</button>
          </div>
          <div className="cost">Membros ({pv.owned.members.length}):</div>
          <table><tbody>
            {pv.owned.members.map((m) => (
              <tr key={m.coords}><td><b>{m.name}</b></td><td>{m.commander}</td><td><CoordLink c={m.coords} /></td></tr>
            ))}
          </tbody></table>
        </>
      )}

      {pv.invites.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="cost">Convites recebidos:</div>
          {pv.invites.map((i) => (
            <div className="roid-row" key={i.galaxy}>
              <div>🔒 {i.name} <span className="roid-count">(galáxia {i.galaxy})</span></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={busy} onClick={() => act(() => api.privateJoin(i.galaxy))}>entrar</button>
                <button className="link" disabled={busy} style={{ color: "var(--danger)" }} onClick={() => act(() => api.privateDecline(i.galaxy))}>recusar</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
