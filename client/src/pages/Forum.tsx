import { useEffect, useState } from "react";
import { api } from "../api";

type Index = Awaited<ReturnType<typeof api.forum>>["forums"];
type Topics = Awaited<ReturnType<typeof api.forumTopics>>["topics"];
type Topic = Awaited<ReturnType<typeof api.forumTopic>>;

function when(s: string) { return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); }

export function Forum({ board }: { board?: { key: string; name: string } }) {
  const [view, setView] = useState<{ kind: "index" } | { kind: "forum"; key: string; name: string } | { kind: "topic"; id: string }>(
    board ? { kind: "forum", key: board.key, name: board.name } : { kind: "index" }
  );
  const [index, setIndex] = useState<Index>([]);
  const [topics, setTopics] = useState<Topics>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [replyBody, setReplyBody] = useState("");

  useEffect(() => {
    setError("");
    if (view.kind === "index") api.forum().then((r) => setIndex(r.forums)).catch(() => {});
    if (view.kind === "forum") api.forumTopics(view.key).then((r) => setTopics(r.topics)).catch(() => {});
    if (view.kind === "topic") api.forumTopic(view.id).then(setTopic).catch(() => {});
  }, [view]);

  async function createTopic(key: string) {
    setError("");
    try {
      const { id } = await api.forumCreateTopic(key, newTitle, newBody);
      setNewTitle(""); setNewBody("");
      setView({ kind: "topic", id });
    } catch (e: any) { setError(e.message ?? "Falha"); }
  }
  async function sendReply(id: string) {
    setError("");
    try { await api.forumReply(id, replyBody); setReplyBody(""); setTopic(await api.forumTopic(id)); }
    catch (e: any) { setError(e.message ?? "Falha"); }
  }

  // ===== Índice =====
  if (view.kind === "index") {
    const cats = [...new Set(index.map((f) => f.cat))];
    return (
      <>
        {cats.map((cat) => (
          <div className="panel" key={cat}>
            <h2>{cat}</h2>
            <table>
              <thead><tr><th>Fórum</th><th>Tópicos</th><th>Mensagens</th><th>Última</th></tr></thead>
              <tbody>
                {index.filter((f) => f.cat === cat).map((f) => (
                  <tr key={f.key} style={{ cursor: "pointer" }} onClick={() => setView({ kind: "forum", key: f.key, name: f.name })}>
                    <td><b style={{ color: "var(--accent)" }}>{f.name}</b><div className="roid-count">{f.desc}</div></td>
                    <td>{f.topics}</td>
                    <td>{f.messages}</td>
                    <td className="roid-count">{f.last ? `${f.last.authorName} · ${when(f.last.at)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </>
    );
  }

  // ===== Lista de tópicos de um fórum =====
  if (view.kind === "forum") {
    return (
      <>
        {!board && <button className="link" onClick={() => setView({ kind: "index" })}>← voltar ao índice</button>}
        <div className="panel" style={{ marginTop: 10 }}>
          <h2>{view.name}</h2>
          {topics.length === 0 ? <div className="roid-count">Nenhum tópico ainda. Seja o primeiro!</div> : (
            <table>
              <thead><tr><th>Tópico</th><th>Autor</th><th>Respostas</th><th>Atividade</th></tr></thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t.id} style={{ cursor: "pointer" }} onClick={() => setView({ kind: "topic", id: t.id })}>
                    <td><b>{t.title}</b></td><td>{t.author}</td><td>{t.replies}</td><td className="roid-count">{when(t.bumpedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h2>Novo tópico</h2>
          <input placeholder="Título" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <textarea placeholder="Mensagem" value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={4}
            style={{ width: "100%", background: "rgba(2,8,18,0.7)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", fontFamily: "var(--mono)" }} />
          {error && <div className="error">{error}</div>}
          <button disabled={!newTitle.trim() || !newBody.trim()} onClick={() => createTopic(view.key)}>publicar tópico</button>
        </div>
      </>
    );
  }

  // ===== Tópico =====
  if (!topic) return <div className="panel"><div className="roid-count">Carregando...</div></div>;
  return (
    <>
      <button className="link" onClick={() => setView({ kind: "forum", key: topic.forum, name: topic.forum })}>← voltar ao fórum</button>
      <div className="panel" style={{ marginTop: 10 }}>
        <h2>{topic.title}</h2>
        {topic.posts.map((p, i) => (
          <div key={i} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0" }}>
            <div className="roid-count" style={{ marginBottom: 4 }}><b style={{ color: "var(--accent)" }}>{p.author}</b> · {when(p.at)}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{p.body}</div>
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>Responder</h2>
        <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={3}
          style={{ width: "100%", background: "rgba(2,8,18,0.7)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", fontFamily: "var(--mono)" }} />
        {error && <div className="error">{error}</div>}
        <button disabled={!replyBody.trim()} onClick={() => sendReply(topic.id)}>responder</button>
      </div>
    </>
  );
}
