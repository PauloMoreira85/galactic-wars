import { useEffect, useRef, useState } from "react";
import { api } from "../api";

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
];

export function Chat() {
  const [room, setRoom] = useState("universo");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  async function load() {
    try { const r = await api.chat(room); setMsgs(r.messages); setLabel(r.label); setError(""); }
    catch (e: any) { setMsgs([]); setError(e.message ?? "Falha"); }
  }
  useEffect(() => { atBottom.current = true; load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [room]);
  useEffect(() => { const el = boxRef.current; if (el && atBottom.current) el.scrollTop = el.scrollHeight; }, [msgs]);

  async function send() {
    if (!text.trim()) return;
    setError("");
    try { const r = await api.chatSend(room, text); setMsgs(r.messages); setText(""); atBottom.current = true; }
    catch (e: any) { setError(e.message ?? "Falha"); }
  }

  return (
    <div className="panel">
      <div className="auth-tabs" style={{ maxWidth: 420, marginBottom: 12 }}>
        {ROOMS.map((r) => (
          <button key={r.key} className={room === r.key ? "active" : ""} onClick={() => setRoom(r.key)}>{r.label}</button>
        ))}
      </div>
      <h2>Chat — {label || "..."}</h2>
      <div
        ref={boxRef}
        onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        style={{ height: 400, overflowY: "auto", background: "rgba(2,8,18,0.7)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 13, lineHeight: 1.6 }}
      >
        {error ? <div className="roid-count">{error}</div>
          : msgs.length === 0 ? <div className="roid-count">Sem mensagens nesta sala ainda. 👋</div>
          : msgs.map((m) => (
            <div key={m.id}>
              <span style={{ color: "var(--muted)" }}>[{hhmm(m.at)}] </span>
              <span style={{ color: nickColor(m.author), fontWeight: 700 }}>&lt;{m.author}&gt;</span>{" "}
              <span style={{ color: "var(--text)" }}>{m.body}</span>
            </div>
          ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={error ? "sala indisponível" : "digite e Enter para enviar..."} maxLength={400} disabled={!!error}
          style={{ flex: 1, margin: 0 }} />
        <button onClick={send} disabled={!!error}>enviar</button>
      </div>
    </div>
  );
}
