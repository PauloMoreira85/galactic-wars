import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useEnterToSend } from "../hooks/useEnterToSend";

type Msg = { id: string; author: string; body: string; at: string };
function hhmm(s: string) { return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function nickColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 65%)`;
}

const ROOMS: { key: string; label: string }[] = [
  { key: "universo", label: "🌌 Universal" },
  { key: "galaxia", label: "🪐 Galáxia" },
  { key: "alianca", label: "🤝 Aliança" },
  { key: "ataque", label: "⚔️ Ataque" },
];

// Renderiza o corpo da mensagem destacando menções (@Nome). Se um @ bate com
// o MEU nome, fica em laranja forte (fui citado).
function renderBody(body: string, myName: string, onMention: (name: string) => void) {
  // Divide mantendo os tokens @palavra (nome pode ter letras, números, _ e -).
  const parts = body.split(/(@[\wÀ-ÿ._-]+)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      const name = p.slice(1);
      const isMe = myName && name.toLowerCase() === myName.toLowerCase();
      return (
        <span key={i} onClick={() => onMention(name)} title={`responder ${name}`}
          style={{ color: isMe ? "#ffb020" : "#5fd0ff", fontWeight: 700, cursor: "pointer", background: isMe ? "rgba(255,176,32,0.15)" : "transparent", borderRadius: 4, padding: isMe ? "0 3px" : 0 }}>
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export function Chat({ myName = "", initialRoom = "universo" }: { myName?: string; initialRoom?: string }) {
  const [room, setRoom] = useState(initialRoom);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const [enterToSend, setEnterToSend] = useEnterToSend();
  const [loadingOld, setLoadingOld] = useState(false);
  const noMoreOld = useRef(false);

  async function load() {
    try {
      const r = await api.chat(room);
      // Só substitui se chegou msg nova (evita apagar o histórico que o usuário já rolou).
      setMsgs((prev) => {
        const last = r.messages[r.messages.length - 1]?.id;
        const prevLast = prev[prev.length - 1]?.id;
        if (prev.length > r.messages.length && last === prevLast) return prev; // já tenho isso + histórico antigo
        return r.messages;
      });
      setLabel(r.label); setError("");
    }
    catch (e: any) { setMsgs([]); setError(e.message ?? "Falha"); }
  }
  // Trocar de sala pelo menu lateral (muda initialRoom) reflete na aba ativa.
  useEffect(() => { setRoom(initialRoom); }, [initialRoom]);
  useEffect(() => { atBottom.current = true; noMoreOld.current = false; load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [room]);
  useEffect(() => { const el = boxRef.current; if (el && atBottom.current) el.scrollTop = el.scrollHeight; }, [msgs]);

  // Rolar pra trás: carrega mensagens antigas quando chega perto do topo.
  async function loadOlder() {
    if (loadingOld || noMoreOld.current || msgs.length === 0) return;
    setLoadingOld(true);
    const el = boxRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const r = await api.chatOlder(room, msgs[0].id);
      if (r.messages.length === 0) { noMoreOld.current = true; }
      else {
        setMsgs((prev) => [...r.messages, ...prev]);
        // Mantém a posição de leitura (não "pula" ao inserir no topo).
        requestAnimationFrame(() => { const e2 = boxRef.current; if (e2) e2.scrollTop = e2.scrollHeight - prevHeight; });
      }
    } catch { /* ignora */ }
    finally { setLoadingOld(false); }
  }
  // Ao abrir o chat, marca como lido (zera o alerta laranja do menu).
  useEffect(() => { api.chatSeen?.().catch(() => {}); }, [msgs]);

  async function send() {
    if (!text.trim()) return;
    setError("");
    try { const r = await api.chatSend(room, text); setMsgs(r.messages); setText(""); atBottom.current = true; }
    catch (e: any) { setError(e.message ?? "Falha"); }
  }

  // Inserir "@Nome " no input e focar (usado por "responder" e por clicar numa menção).
  function mention(name: string) {
    setText((t) => {
      const sep = t && !t.endsWith(" ") ? " " : "";
      return `${t}${sep}@${name} `;
    });
    inputRef.current?.focus();
  }
  // Quote: cita a frase e já menciona o autor.
  function quote(m: Msg) {
    const trecho = m.body.length > 60 ? m.body.slice(0, 60) + "…" : m.body;
    setText(`@${m.author} "${trecho}" `);
    inputRef.current?.focus();
    atBottom.current = true;
  }

  return (
    <div className="panel">
      <div className="auth-tabs" style={{ maxWidth: 420, marginBottom: 12 }}>
        {ROOMS.map((r) => (
          <button key={r.key} className={room === r.key ? "active" : ""} onClick={() => setRoom(r.key)}>{r.label}</button>
        ))}
      </div>
      <h2>Chat — {label || "..."}</h2>
      {room === "ataque" ? (
        <div className="cost" style={{ marginBottom: 8, fontSize: 12 }}>
          ⚡ Sala de ataque. Comandos: <b>!pego 4:2:3</b> (pega o alvo) · <b>!largo</b> · <b>!alvos</b> (lista) · <b>!alvo 4:2:3 nota</b> · <b>!libera</b> / <b>!trava</b> (comando) · <b>!abre 4:2:3</b> · <b>!ajuda</b>.
        </div>
      ) : (
        <div className="cost" style={{ marginBottom: 8, fontSize: 12 }}>
          Clique em <b>↩</b> pra responder alguém, ou digite <b>@</b> pra mencionar um planeta (fica laranja pra quem for citado).
        </div>
      )}
      <div
        ref={boxRef}
        onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; if (el.scrollTop < 60) loadOlder(); }}
        style={{ height: 400, overflowY: "auto", background: "rgba(2,8,18,0.7)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        {!error && msgs.length > 0 && (
          <div className="roid-count" style={{ textAlign: "center", padding: "2px 0 6px", opacity: 0.6 }}>
            {loadingOld ? "carregando mensagens antigas…" : noMoreOld.current ? "— início do histórico —" : "↑ role pra cima pra ver mensagens antigas"}
          </div>
        )}
        {error ? <div className="roid-count">{error}</div>
          : msgs.length === 0 ? <div className="roid-count">Sem mensagens nesta sala ainda. 👋</div>
          : msgs.map((m) => {
            const mine = !!myName && m.author.toLowerCase() === myName.toLowerCase();
            const citedMe = !mine && !!myName && new RegExp(`@${myName}\\b`, "i").test(m.body);
            return (
              <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                <div style={{
                  background: mine ? "rgba(37,211,255,0.16)" : citedMe ? "rgba(255,176,32,0.12)" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${mine ? "var(--border-hi, var(--border))" : citedMe ? "rgba(255,176,32,0.4)" : "var(--border)"}`,
                  borderRadius: 10, padding: "6px 11px", wordBreak: "break-word",
                }}>
                  {!mine && (
                    <span onClick={() => mention(m.author)} title={`mencionar ${m.author}`}
                      style={{ color: nickColor(m.author), fontWeight: 700, cursor: "pointer", fontSize: 12, display: "block", marginBottom: 1 }}>
                      {m.author}
                    </span>
                  )}
                  <span style={{ color: "var(--text)" }}>{renderBody(m.body, myName, mention)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: mine ? "flex-end" : "flex-start", alignItems: "center", marginTop: 1 }}>
                  <span className="roid-count" style={{ fontSize: 10 }}>{hhmm(m.at)}</span>
                  {!mine && <button title={`responder ${m.author}`} onClick={() => quote(m)}
                    style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, margin: 0, fontSize: 12 }}>↩ responder</button>}
                </div>
              </div>
            );
          })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "flex-end" }}>
        <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={1}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && enterToSend) { e.preventDefault(); send(); } }}
          placeholder={error ? "sala indisponível" : enterToSend ? "mensagem... (Enter envia, Shift+Enter quebra linha)" : "mensagem... (Shift+Enter quebra linha)"}
          maxLength={400} disabled={!!error}
          style={{ flex: 1, margin: 0, resize: "none", minHeight: 38, maxHeight: 120, fontFamily: "inherit" }} />
        <button onClick={send} disabled={!!error}>enviar</button>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "var(--muted)", cursor: "pointer", userSelect: "none" }}>
        <input type="checkbox" checked={enterToSend} onChange={(e) => setEnterToSend(e.target.checked)} style={{ margin: 0, width: "auto" }} />
        Enviar com Enter
      </label>
    </div>
  );
}
