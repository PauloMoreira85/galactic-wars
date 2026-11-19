import { useEffect, useRef, useState } from "react";
import { api, REFRESH_MS } from "../api";
import { CoordLink } from "../components/CoordLink";

function hhmm(s: string) { return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function when(s: string) { return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }

type Convs = Awaited<ReturnType<typeof api.pmConversations>>["conversations"];
type Msgs = Awaited<ReturnType<typeof api.pmConversation>>["messages"];

// Mensagens privadas em modo CHAT (conversas por jogador, estilo WhatsApp).
export function Mensagens({ initialTo }: { initialTo?: string }) {
  const [convs, setConvs] = useState<Convs>([]);
  const [openId, setOpenId] = useState<string | null>(null); // otherId da conversa aberta
  const [openName, setOpenName] = useState<string>("");
  const [msgs, setMsgs] = useState<Msgs>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Nova conversa (por coordenada) — quando não tenho o userId ainda.
  const [newTo, setNewTo] = useState("");
  const [newMode, setNewMode] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  async function loadConvs() { try { setConvs((await api.pmConversations()).conversations); } catch (e: any) { setError(e.message ?? "Falha"); } }
  async function loadMsgs(otherId: string) {
    try { setMsgs((await api.pmConversation(otherId)).messages); } catch {}
  }
  useEffect(() => { loadConvs(); const t = setInterval(() => { loadConvs(); if (openId) loadMsgs(openId); }, REFRESH_MS); return () => clearInterval(t); }, [openId]);
  useEffect(() => { const el = boxRef.current; if (el && atBottom.current) el.scrollTop = el.scrollHeight; }, [msgs]);

  // Veio da Galáxia (botão ✉) com uma coordenada: abre modo "nova" já preenchido.
  useEffect(() => { if (initialTo) { setNewTo(initialTo); setNewMode(true); setOpenId(null); } }, [initialTo]);

  function openConv(otherId: string, name: string) {
    setOpenId(otherId); setOpenName(name); setNewMode(false); atBottom.current = true;
    loadMsgs(otherId); loadConvs();
  }

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true); setError("");
    try {
      // Conversa aberta → responde por uid; modo nova → envia pela coordenada.
      const to = newMode ? newTo.trim() : `uid:${openId}`;
      await api.pmSend(to, "", t, false);
      setText(""); atBottom.current = true;
      await loadConvs();
      if (newMode) {
        // Após enviar a 1ª msg, acha a conversa recém-criada e abre.
        const cs = (await api.pmConversations()).conversations;
        setConvs(cs);
        const c = cs.find((x) => x.coords === newTo.trim() || x.name === newTo.trim());
        if (c) { setNewMode(false); openConv(c.otherId, c.name); }
      } else if (openId) {
        await loadMsgs(openId);
      }
    } catch (e: any) { setError(e.message ?? "Falha ao enviar"); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h2>✉️ Mensagens</h2>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Lista de conversas */}
        <div style={{ flex: "1 1 240px", minWidth: 220, maxWidth: 340 }}>
          <button onClick={() => { setNewMode(true); setOpenId(null); setNewTo(""); }}
            style={{ width: "100%", marginBottom: 8 }}>✍️ Nova conversa</button>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 440, overflowY: "auto" }}>
            {convs.length === 0 && <div className="roid-count">Nenhuma conversa ainda.</div>}
            {convs.map((c) => (
              <button key={c.otherId} onClick={() => openConv(c.otherId, c.name)}
                className={openId === c.otherId ? "active" : ""}
                style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: 8,
                  border: "1px solid var(--border)", background: openId === c.otherId ? "rgba(37,211,255,0.12)" : "var(--panel)",
                  display: "flex", flexDirection: "column", gap: 2, width: "100%",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <b style={{ color: "#eafcff" }}>{c.name}</b>
                  <span className="roid-count" style={{ fontSize: 10 }}>{hhmm(c.lastAt)}</span>
                </div>
                <div className="roid-count" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.lastMine && "você: "}{c.last}
                </div>
                {c.unread > 0 && <span style={{ alignSelf: "flex-start", fontSize: 10, background: "#ffb020", color: "#1a1205", borderRadius: 999, padding: "1px 7px", fontWeight: 800 }}>{c.unread} nova(s)</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Conversa aberta OU nova */}
        <div style={{ flex: "2 1 360px", minWidth: 280 }}>
          {newMode ? (
            <div>
              <div className="cost" style={{ marginBottom: 8 }}>Nova mensagem — digite a coordenada <b>setor:paralelo:slot</b> (ou o nome do comandante) do destino:</div>
              <input placeholder="ex: 2:1:3" value={newTo} onChange={(e) => setNewTo(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
            </div>
          ) : openId ? (
            <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 15, color: "#eafcff", marginBottom: 8 }}>
              {openName} {convs.find((c) => c.otherId === openId)?.coords && <span className="roid-count" style={{ fontSize: 12 }}>(<CoordLink c={convs.find((c) => c.otherId === openId)!.coords!} />)</span>}
            </div>
          ) : (
            <div className="roid-count" style={{ padding: 20, textAlign: "center" }}>Escolha uma conversa ou clique em "Nova conversa".</div>
          )}

          {(openId || newMode) && (
            <>
              {!newMode && (
                <div ref={boxRef}
                  onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
                  style={{ height: 360, overflowY: "auto", background: "rgba(2,8,18,0.7)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {msgs.length === 0 ? <div className="roid-count">Sem mensagens ainda — mande a primeira. 👋</div>
                    : msgs.map((m) => (
                      <div key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                        <div style={{
                          background: m.mine ? "rgba(37,211,255,0.16)" : "rgba(255,255,255,0.06)",
                          border: `1px solid ${m.mine ? "var(--border-hi, var(--border))" : "var(--border)"}`,
                          borderRadius: 10, padding: "7px 11px", whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>
                          {m.subject && m.subject !== "(sem assunto)" && <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 2 }}>{m.subject}</div>}
                          {m.body}
                        </div>
                        <div className="roid-count" style={{ fontSize: 10, textAlign: m.mine ? "right" : "left", marginTop: 1 }}>{hhmm(m.at)}</div>
                      </div>
                    ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={newMode ? "escreva a mensagem..." : "mensagem... (Enter envia)"} maxLength={1000} disabled={busy || (newMode && !newTo.trim())}
                  style={{ flex: 1, margin: 0 }} />
                <button onClick={send} disabled={busy || !text.trim() || (newMode && !newTo.trim())}>{busy ? "..." : "enviar"}</button>
              </div>
            </>
          )}
          {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
      </div>
      <div className="roid-count" style={{ marginTop: 10, fontSize: 11, opacity: 0.7 }}>
        Última atualização: {when(new Date().toISOString())} · atualiza sozinho
      </div>
    </div>
  );
}
