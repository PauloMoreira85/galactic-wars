import { useEffect, useState } from "react";
import { api, type AssociadoView, type PrivateView } from "../api";

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
          No início do jogo qualquer comandante pode se tornar Associado (grátis). Benefícios: trocar de nome até 3×, criar galáxia privada e escolher quem participa.
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

      {view.associado && <GalaxiaPrivada onChanged={onChanged} />}
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
          <div style={{ display: "flex", gap: 8, margin: "10px 0", flexWrap: "wrap" }}>
            <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="convidar (nome do líder)..." style={{ width: 200, margin: 0, padding: "6px 10px" }} />
            <button disabled={busy || !invite.trim()} onClick={() => act(() => api.privateInvite(invite.trim()))}>{busy ? "..." : "convidar"}</button>
          </div>
          <div className="cost">Membros ({pv.owned.members.length}):</div>
          <table><tbody>
            {pv.owned.members.map((m) => (
              <tr key={m.coords}><td><b>{m.name}</b></td><td>{m.commander}</td><td className="roid-count">{m.coords}</td></tr>
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
              <button disabled={busy} onClick={() => act(() => api.privateJoin(i.galaxy))}>entrar</button>
            </div>
          ))}
        </div>
      )}
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
