import { useState } from "react";
import { api, type PlanetView } from "../api";

// Preferências do planeta: auto-exílio (mudança de galáxia) + trocar senha.
export function Preferencias({ view, onChanged }: { view: PlanetView; onChanged: () => void }) {
  const [error, setError] = useState("");
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  async function changePassword() {
    setPwMsg(""); setPwErr("");
    if (nw.length < 6) { setPwErr("A nova senha precisa de pelo menos 6 caracteres."); return; }
    if (nw !== confirm) { setPwErr("A confirmação não bate com a nova senha."); return; }
    try {
      await api.changePassword(cur, nw);
      setPwMsg("Senha alterada com sucesso!");
      setCur(""); setNw(""); setConfirm("");
    } catch (e: any) { setPwErr(e.message ?? "Falha ao alterar a senha"); }
  }

  async function doAutoExile() {
    if (!window.confirm(`Auto-exílio: seu planeta vai cair numa galáxia aleatória (não-privada). Restam ${view.planet.autoExiles}. Confirmar?`)) return;
    setError("");
    try { await api.autoExile(); onChanged(); }
    catch (e: any) { setError(e.message ?? "Falha"); }
  }

  return (
    <>
      <div className="panel">
        <h2>🪂 Auto-exílio</h2>
        <div className="cost">
          Faz o seu planeta cair numa <b>galáxia aleatória</b> (não-privada). Útil pra fugir de uma vizinhança ruim. Você perde os cargos de governo da galáxia atual.
        </div>
        <div className="roid-row">
          <div className="roid-label"><div>
            <div><b>Exilar planeta</b></div>
            <div className="roid-count">restam {view.planet.autoExiles} de 3 auto-exílios</div>
          </div></div>
          <button disabled={view.planet.autoExiles <= 0} onClick={doAutoExile}>
            {view.planet.autoExiles > 0 ? "🪂 auto-exílio" : "sem exílios"}
          </button>
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      <div className="panel">
        <h2>🔑 Alterar senha</h2>
        <div className="cost" style={{ marginBottom: 8 }}>Troque sua senha de acesso ao jogo.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
          <input type="password" placeholder="senha atual" value={cur} onChange={(e) => setCur(e.target.value)} style={{ margin: 0, padding: "6px 10px" }} />
          <input type="password" placeholder="nova senha (mín. 6)" value={nw} onChange={(e) => setNw(e.target.value)} style={{ margin: 0, padding: "6px 10px" }} />
          <input type="password" placeholder="confirmar nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ margin: 0, padding: "6px 10px" }} />
          <button disabled={!cur || !nw || !confirm} onClick={changePassword} style={{ alignSelf: "flex-start" }}>Alterar senha</button>
        </div>
        {pwMsg && <div className="cost" style={{ marginTop: 10, color: "var(--carbonum)" }}>{pwMsg}</div>}
        {pwErr && <div className="error" style={{ marginTop: 10 }}>{pwErr}</div>}
      </div>
    </>
  );
}
