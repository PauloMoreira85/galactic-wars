import { useState } from "react";
import { api } from "../api";

// Página de redefinição de senha (aberta pelo link do e-mail: /reset?token=...).
export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (pw.length < 6) { setErr("A senha precisa de pelo menos 6 caracteres."); return; }
    if (pw !== confirm) { setErr("As senhas não batem."); return; }
    try { await api.resetPassword(token, pw); setDone(true); }
    catch (e: any) { setErr(e.message ?? "Falha ao redefinir"); }
  }

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", padding: "0 16px" }}>
      <div className="panel">
        <h2>🔑 Redefinir senha</h2>
        {!token ? (
          <div className="error" style={{ marginTop: 10 }}>Link inválido (sem token). Peça outro na tela de login.</div>
        ) : done ? (
          <div style={{ marginTop: 10 }}>
            <div className="cost" style={{ color: "var(--carbonum)" }}>Senha redefinida com sucesso!</div>
            <div style={{ marginTop: 12 }}><a href="/" className="link">← Ir para o login</a></div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 10 }}>
            <input type="password" placeholder="nova senha (mín. 6)" value={pw} onChange={(e) => setPw(e.target.value)} />
            <input type="password" placeholder="confirmar nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {err && <div className="error">{err}</div>}
            <button type="submit" disabled={!pw || !confirm} style={{ width: "100%" }}>Redefinir senha</button>
          </form>
        )}
      </div>
    </div>
  );
}
