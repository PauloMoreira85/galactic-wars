import { useEffect, useState } from "react";
import { api } from "../api";
import { IntelReport } from "../components/IntelReport";

function fmt(n: number) { return n.toLocaleString("pt-BR"); }

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
            Mais CE = maior chance de <b>bloquear</b> espião/sabotador. Cobertura cheia (<b>CE ≥ roids ÷ {prot.roidsPerCE}</b>) bloqueia <b>~85%</b> — nunca 100% (sempre dá pra furar mandando vários agentes).
          </div>
          <div className="roid-row" style={{ marginTop: 6 }}>
            <div className="roid-label"><div>
              <div><b>{fmt(prot.ce)}</b> agentes de CE · cobertura cheia em <b>{fmt(prot.needed)}</b> (você tem {fmt(prot.roids)} roids)</div>
              <div className="roid-count" style={{ color: prot.shielded ? "var(--carbonum)" : "var(--danger)" }}>
                {prot.shielded ? "✅ Bem protegido (~85% de bloqueio)" : `⚠️ Pouco protegido — bloqueio ~${Math.round(Math.min(85, (prot.ce * prot.roidsPerCE / Math.max(1, prot.roids)) * 100))}% (cheio em ${fmt(prot.needed)} CE)`}
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
        <table>
          <thead><tr><th>Agente</th><th>Tenho</th><th>Custo (M/C/P)</th><th>Treino</th><th></th></tr></thead>
          <tbody>
            {data?.catalog.map((a: AgentCat) => (
              <tr key={a.key} style={!a.unlocked ? { opacity: 0.5 } : undefined}>
                <td><b>{a.key}</b> — {a.name}<div className="roid-count">{a.desc}</div></td>
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
        {data && data.training.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="roid-count">Em treino:</div>
            {data.training.map((t) => <div key={t.id} className="roid-count">• {t.quantity}x {t.key} — faltam {t.ticksRemaining}t</div>)}
          </div>
        )}
        {msg && <div className="cost" style={{ marginTop: 8, color: "var(--carbonum)" }}>{msg}</div>}
      </div>

      {/* ===== Espionar ===== */}
      <div className="panel">
        <h2>Espionar planeta</h2>
        <div className="cost">
          Cada missão <b>gasta 1 agente</b> do tipo (dê certo ou não). Falha se o alvo tiver contra-espionagem suficiente.
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
          <h2>🛰️ [{spy.agent}] {spy.name} ({spy.coords})</h2>
          <IntelReport intel={spy} />
        </div>
      )}
    </>
  );
}
