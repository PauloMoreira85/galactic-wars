import { useEffect, useState, Fragment } from "react";
import { api } from "../api";

type PM = Awaited<ReturnType<typeof api.pm>>;
function when(s: string) { return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }

export function Mensagens({ initialTo }: { initialTo?: string }) {
  const [data, setData] = useState<PM | null>(null);
  const [tab, setTab] = useState<"recebidas" | "enviadas" | "nova">("recebidas");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [anon, setAnon] = useState(false);

  async function load() { try { setData(await api.pm()); } catch (e: any) { setError(e.message ?? "Falha"); } }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  // Veio da Galáxia (botão ✉): abre a aba Nova já com a coordenada preenchida.
  useEffect(() => { if (initialTo) { setTo(initialTo); setTab("nova"); } }, [initialTo]);

  async function read(id: string) {
    setOpen(open === id ? null : id);
    if (open !== id) { try { await api.pmRead(id); load(); } catch {} }
  }
  async function send() {
    setError("");
    try { setData(await api.pmSend(to, subject, body, anon)); setTo(""); setSubject(""); setBody(""); setAnon(false); setTab("enviadas"); }
    catch (e: any) { setError(e.message ?? "Falha"); }
  }
  // Responder: pré-preenche a aba Nova com o remetente, "Re: assunto" e a mensagem
  // original CITADA (com "> "), pra você escrever embaixo e manter o fio da conversa.
  function reply(m: { from: string; subject: string; body: string }) {
    setError("");
    setTo(m.from);
    setSubject(m.subject.toLowerCase().startsWith("re:") ? m.subject : `Re: ${m.subject}`);
    const quoted = m.body.split("\n").map((l) => "> " + l).join("\n");
    setBody(`> ${m.from} escreveu:\n${quoted}\n\n`);
    setAnon(false);
    setTab("nova");
  }

  if (!data) return <div className="panel"><div className="roid-count">Carregando...</div></div>;

  return (
    <>
      <div className="auth-tabs" style={{ maxWidth: 440, marginBottom: 14 }}>
        <button className={tab === "recebidas" ? "active" : ""} onClick={() => setTab("recebidas")}>📥 Recebidas{data.unread > 0 ? ` (${data.unread})` : ""}</button>
        <button className={tab === "enviadas" ? "active" : ""} onClick={() => setTab("enviadas")}>📤 Enviadas</button>
        <button className={tab === "nova" ? "active" : ""} onClick={() => setTab("nova")}>✉️ Nova</button>
      </div>

      {tab === "recebidas" && (
        <div className="panel">
          <h2>Recebidas</h2>
          {data.inbox.length === 0 ? <div className="roid-count">Nenhuma mensagem.</div> : (
            <table>
              <thead><tr><th></th><th>De</th><th>Assunto</th><th>Data</th></tr></thead>
              <tbody>
                {data.inbox.map((m) => (
                  <Fragment key={m.id}>
                    <tr style={{ cursor: "pointer", fontWeight: m.read ? 400 : 700 }} onClick={() => read(m.id)}>
                      <td>{m.read ? "" : "🔵"}</td><td>{m.from}</td><td>{m.subject}</td><td className="roid-count">{when(m.at)}</td>
                    </tr>
                    {open === m.id && <tr><td></td><td colSpan={3} style={{ color: "var(--text)", padding: "8px 8px 14px" }}>
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                      {m.from !== "Anônimo" && <div style={{ marginTop: 10 }}><button onClick={() => reply(m)}>↩ responder</button></div>}
                    </td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "enviadas" && (
        <div className="panel">
          <h2>Enviadas</h2>
          {data.sent.length === 0 ? <div className="roid-count">Nada enviado ainda.</div> : (
            <table>
              <thead><tr><th>Para</th><th>Assunto</th><th>Data</th></tr></thead>
              <tbody>
                {data.sent.map((m) => (
                  <Fragment key={m.id}>
                    <tr style={{ cursor: "pointer" }} onClick={() => setOpen(open === m.id ? null : m.id)}>
                      <td>{m.to}{m.anonymous && " (anônimo)"}</td><td>{m.subject}</td><td className="roid-count">{when(m.at)}</td>
                    </tr>
                    {open === m.id && <tr><td colSpan={3} style={{ whiteSpace: "pre-wrap", color: "var(--text)", padding: "8px 8px 14px" }}>{m.body}</td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "nova" && (
        <div className="panel">
          <h2>Nova mensagem</h2>
          <input placeholder="Para (coordenada — ex: 2:1:3)" value={to} onChange={(e) => setTo(e.target.value)} />
          <input placeholder="Assunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea placeholder="Mensagem" value={body} onChange={(e) => setBody(e.target.value)} rows={8}
            style={{ width: "100%", background: "rgba(2,8,18,0.7)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", fontFamily: "var(--mono)" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", fontSize: 13, color: "var(--muted)" }}>
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} style={{ width: "auto", margin: 0 }} /> enviar como anônimo
          </label>
          {error && <div className="error">{error}</div>}
          <button disabled={!to.trim() || !body.trim()} onClick={send}>enviar</button>
        </div>
      )}
    </>
  );
}
