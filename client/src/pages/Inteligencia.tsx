import { useEffect, useState } from "react";
import { api } from "../api";
import { CoordLink } from "../components/CoordLink";
import { IntelReport } from "../components/IntelReport";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }

// Emoji de fallback por tipo de agente (usado se a arte dedicada não carregar).
const AGENT_EMOJI: Record<string, string> = {
  P: "🔍", // Padrão (recon)
  M: "🎖️", // Militar (naves)
  T: "📡", // Transmissão (notícias)
  D: "🕵️", // Duplo (frotas)
  AE: "🗡️", // Espionagem ofensiva
  CE: "🛡️", // Contra-Espionagem
};
// Artes dos agentes (game asset). Cada raça tem a sua; cascata de fallback:
// arte da raça -> arte genérica -> emoji. Só o dono vê (não vaza raça).
const AGENT_ART = new Set(["P", "M", "T", "D", "AE", "CE"]);
const AGENT_RACES = new Set(["humanos", "daharan", "rakshasa", "mech", "insecta"]);
// onZoom: se passado, clicar na ARTE amplia no lightbox (igual às naves no Hangar).
function AgentIcon({ k, race, size = 30, onZoom }: { k: string; race?: string; size?: number; onZoom?: (src: string, alt: string) => void }) {
  // Candidatos de imagem em ordem de preferência.
  const sources: string[] = [];
  if (AGENT_ART.has(k)) {
    if (race && AGENT_RACES.has(race)) sources.push(`/art/agents/${race}/${k}.jpg`);
    sources.push(`/art/agents/${k}.jpg`);
  }
  const [idx, setIdx] = useState(0);
  const box = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: size, height: size, borderRadius: 7, border: "1px solid var(--border)",
    background: "rgba(0,0,0,0.3)", overflow: "hidden", flex: "0 0 auto",
  } as const;
  if (idx < sources.length) {
    const src = sources[idx];
    return (
      <span style={box}>
        <img src={src} alt={k} width={size} height={size}
          title={onZoom ? "Clique para ampliar" : undefined}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: onZoom ? "zoom-in" : undefined }}
          onClick={onZoom ? (e) => { e.stopPropagation(); onZoom(src, k); } : undefined}
          onError={() => setIdx((i) => i + 1)} />
      </span>
    );
  }
  return <span style={{ ...box, fontSize: size * 0.56 }}>{AGENT_EMOJI[k] ?? "🕵️"}</span>;
}

type AgentCat = Awaited<ReturnType<typeof api.agents>>["catalog"][number];
type AgentsData = Awaited<ReturnType<typeof api.agents>>;

export function Inteligencia() {
  // Coordenadas como texto (apagáveis no celular). Validadas no envio.
  const [g, setG] = useState("");
  const [s, setS] = useState("");
  const [slot, setSlot] = useState("");
  const [spy, setSpy] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [data, setData] = useState<AgentsData | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null); // arte ampliada
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  async function loadAgents() {
    try { setData(await api.agents()); } catch {}
  }
  useEffect(() => { loadAgents(); }, []);

  async function train(key: string) {
    setError(""); setMsg("");
    const n = qty[key] ?? 0;
    if (n < 1) return;
    try {
      await api.buildAgent(key, n);
      setMsg(`Treino de ${n}x ${key} iniciado.`);
      setQty((q) => ({ ...q, [key]: 0 }));
      await loadAgents();
    } catch (e: any) { setError(e.message ?? "Falha no treino"); }
  }

  // Cancela um treino em andamento (reembolso proporcional ao tempo restante).
  async function cancelTraining(id: string) {
    setError(""); setMsg("");
    try { await api.cancelOrder(id); setMsg("Treino cancelado (reembolso proporcional)."); await loadAgents(); }
    catch (e: any) { setError(e.message ?? "Falha ao cancelar"); }
  }

  async function doSpy(agent: "P" | "M" | "T" | "D") {
    setError(""); setSpy(null); setMsg("");
    const gg = parseInt(g, 10), ss = parseInt(s, 10), sl = parseInt(slot, 10);
    if (!(gg >= 1) || !(ss >= 1) || !(sl >= 1)) { setError("Digite a coordenada completa (setor:paralelo:slot)."); return; }
    try {
      const r = await api.spy(gg, ss, sl, agent);
      if (r.failed || !r.intel) setError(r.error ?? "Espionagem falhou");
      else setSpy(r.intel);
      await loadAgents(); // atualiza a contagem (gastou 1 agente)
    } catch (e: any) { setError(e.message ?? "Falha"); }
    // Rola até o resultado/erro (que aparece abaixo) pra não parecer que nada aconteceu.
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 120);
  }

  const count = (k: string) => data?.catalog.find((c) => c.key === k)?.count ?? 0;
  const prot = data?.protection;

  return (
    <>
      {/* ===== Minha proteção (contra-espionagem) ===== */}
      {prot && (
        <div className="panel">
          <h2>🛡️ Minha contra-espionagem</h2>
          <div className="cost">
            Mais CE = maior chance de <b>bloquear</b> espião/sabotador. A disputa é <b>AE vs CE ao cubo</b>: ter o <b>dobro</b> de CE que o atacante de AE já bloqueia a grande maioria; com <b>10× mais</b> CE você barra <b>~99,9%</b>. Investir em defesa protege de verdade — e quem quiser furar precisa de muito AE. Sem AE, o atacante não consegue nada.
          </div>
          <div className="roid-row" style={{ marginTop: 6 }}>
            <div className="roid-label"><div>
              <div>Você tem <b>{fmt(prot.ce)}</b> agentes de Contra-Espionagem (CE).</div>
              <div className="roid-count" style={{ lineHeight: 1.6, marginTop: 4 }}>
                A chance do atacante passar depende do <b>AE dele vs seu CE</b> (ao cubo). Referência da sua defesa:
                <div>• Atacante com <b>metade</b> do seu Ce de AE → ele passa só <b>~11%</b> (espionagem) / <b>~6%</b> (sabotagem)</div>
                <div>• Atacante com AE <b>igual</b> ao seu CE → <b>50%</b> / <b>33%</b></div>
                <div>• Atacante com o <b>dobro</b> do seu CE de AE → <b>89%</b> / <b>80%</b></div>
                <div style={{ opacity: 0.8, marginTop: 2 }}>→ pra se blindar, mantenha o CE acima do AE que o inimigo consegue juntar.</div>
              </div>
            </div></div>
          </div>
        </div>
      )}

      {/* ===== Treino de agentes ===== */}
      <div className="panel">
        <h2>🕵️ Treinar agentes</h2>
        <div className="cost" style={{ marginBottom: 8 }}>
          A <b>pesquisa</b> de Inteligência destrava cada tipo; aqui você treina a <b>quantidade</b>. Os agentes funcionam em qualquer planeta (inclusive da sua galáxia).
        </div>
        {/* Fila de produção EM CIMA (igual à árvore de tecnologia). */}
        {data && data.training.length > 0 && (
          <div style={{ marginBottom: 14, border: "1px solid var(--accent)", borderRadius: 10, padding: "10px 12px", background: "rgba(37,211,255,0.08)" }}>
            <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: 13, letterSpacing: 0.5, color: "var(--accent)", marginBottom: 8 }}>
              🕵️ EM PRODUÇÃO ({data.training.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.training.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "rgba(0,0,0,0.2)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <AgentIcon k={t.key} race={data.race} size={34} onZoom={(src, alt) => setZoom({ src, alt })} />
                    <span><b style={{ color: "var(--text)" }}>{t.quantity}x {t.key}</b> <span className="roid-count">— faltam <b style={{ color: "var(--accent)" }}>{t.ticksRemaining}t</b></span></span>
                  </span>
                  <button className="btn-danger" onClick={() => cancelTraining(t.id)} title="Cancelar — reembolso proporcional ao tempo que falta" style={{ padding: "2px 10px", fontSize: 11 }}>cancelar</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <table>
          <thead><tr><th>Agente</th><th>Tenho</th><th>Custo (M/C/P)</th><th>Treino</th><th></th></tr></thead>
          <tbody>
            {data?.catalog.map((a: AgentCat) => (
              <tr key={a.key} style={!a.unlocked ? { opacity: 0.5 } : undefined}>
                <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><AgentIcon k={a.key} race={data?.race} size={28} onZoom={(src, alt) => setZoom({ src, alt })} /><span><b>{a.key}</b> — {a.name}<div className="roid-count">{a.desc}</div></span></span></td>
                <td>{fmt(a.count)}</td>
                <td className="roid-count">{fmt(a.cost.metalium)}/{fmt(a.cost.carbonum)}/{fmt(a.cost.plutonium)} · {a.ticks}t</td>
                <td>
                  {a.unlocked ? (
                    <input type="number" min={0} value={qty[a.key] || ""} placeholder="0"
                      onChange={(e) => setQty((q) => ({ ...q, [a.key]: Math.max(0, Number(e.target.value)) }))}
                      style={{ width: 90, margin: 0, padding: "6px 8px" }} />
                  ) : <span className="roid-count">pesquise nível {a.level}</span>}
                </td>
                <td>{a.unlocked && <button disabled={!(qty[a.key] > 0)} onClick={() => train(a.key)}>treinar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {msg && <div className="cost" style={{ marginTop: 8, color: "var(--carbonum)" }}>{msg}</div>}
      </div>

      {/* ===== Espionar ===== */}
      <div className="panel">
        <h2>Espionar planeta</h2>
        <div className="cost">
          Cada missão <b>gasta 1 agente</b> do tipo (dê certo ou não). A chance depende da <b>sua força de espionagem (AE) contra a contra-espionagem (AC) do alvo</b> — treine <b>mais AE</b> pra aumentar a chance.
          <br /><b>P</b>=Padrão · <b>M</b>=Militar (naves) · <b>T</b>=Transmissão (notícias) · <b>D</b>=Duplo (frotas).
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
          <span className="roid-count">Alvo</span>
          <input type="text" inputMode="numeric" maxLength={3} placeholder="set" title="Setor" value={g} onChange={(e) => setG(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
          <span className="roid-count">:</span>
          <input type="text" inputMode="numeric" maxLength={3} placeholder="par" title="Paralelo" value={s} onChange={(e) => setS(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
          <span className="roid-count">:</span>
          <input type="text" inputMode="numeric" maxLength={2} placeholder="slot" value={slot} onChange={(e) => setSlot(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
          {(["P", "M", "T", "D"] as const).map((a) => (
            <button key={a} disabled={count(a) < 1} onClick={() => doSpy(a)} title={count(a) < 1 ? "Sem agentes desse tipo" : ""}>
              {a} ({fmt(count(a))})
            </button>
          ))}
        </div>
        {error && <div className="error">{error}</div>}
      </div>

      {spy && (
        <div className="panel">
          <h2>🛰️ [{spy.agent}] {spy.name} (<CoordLink c={spy.coords} />)</h2>
          <IntelReport intel={spy} />
        </div>
      )}

      {/* Lightbox: arte do agente ampliada (igual ao Hangar). */}
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)}>
          <button className="lightbox-close" onClick={() => setZoom(null)} aria-label="Fechar">✕</button>
          <img src={zoom.src} alt={zoom.alt} onClick={(e) => e.stopPropagation()} />
          <div className="lightbox-cap">{zoom.alt}</div>
        </div>
      )}
    </>
  );
}
