import { useEffect, useState } from "react";
import { api } from "../api";
import { CoordLink } from "../components/CoordLink";

type Sab = Awaited<ReturnType<typeof api.sabotage>>;

export function Sabotagem() {
  const [data, setData] = useState<Sab | null>(null);
  // Coordenadas como texto (apagáveis no celular). Validadas no envio.
  const [g, setG] = useState("");
  const [s, setS] = useState("");
  const [slot, setSlot] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const reload = () => api.sabotage().then(setData).catch((e) => setError(e.message));
  useEffect(() => { reload(); }, []);

  async function run(key: string) {
    setError(""); setMsg("");
    const gg = parseInt(g, 10), ss = parseInt(s, 10), sl = parseInt(slot, 10);
    if (!(gg >= 1) || !(ss >= 1) || !(sl >= 1)) { setError("Digite a coordenada completa (setor:paralelo:slot)."); return; }
    try {
      const r = await api.sabotageRun(gg, ss, sl, key);
      setMsg(r.message ?? (r.success ? "Sabotagem aplicada!" : "Sabotagem falhou."));
      reload(); // atualiza "em andamento" e histórico
    } catch (e: any) { setError(e.message ?? "Falha"); }
  }

  if (!data) return <div className="panel"><div className="roid-count">Carregando...</div></div>;

  return (
    <div className="panel">
      <h2>Sabotagem</h2>

      {/* Fila EM ANDAMENTO no topo (igual à produção de agentes na Inteligência). */}
      {data.pending.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--accent)", margin: "0 0 14px" }}>
          <h3 style={{ margin: "0 0 6px" }}>🕓 Em andamento</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Sabotagem</th><th>Alvo</th><th title="Tempo Estimado de Chegada — ticks até o efeito">TEC</th></tr></thead>
              <tbody>
                {data.pending.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b></td>
                    <td><CoordLink c={p.coords} /></td>
                    <td><b style={{ color: "var(--accent)" }}>{p.tec}t</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="cost">Escolha o alvo (outra galáxia) e a sabotagem que você desbloqueou. Pode ser repelida pela contra-espionagem do alvo. <b>Sem Agente de Espionagem (AE) a sabotagem não funciona.</b> Há um <b>cooldown de 5 ticks</b> entre tentativas de sabotagem.</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
        <span className="roid-count">Alvo</span>
        <input type="text" inputMode="numeric" maxLength={3} placeholder="set" title="Setor" value={g} onChange={(e) => setG(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
        <span className="roid-count">:</span>
        <input type="text" inputMode="numeric" maxLength={3} placeholder="par" title="Paralelo" value={s} onChange={(e) => setS(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
        <span className="roid-count">:</span>
        <input type="text" inputMode="numeric" maxLength={2} placeholder="slot" value={slot} onChange={(e) => setSlot(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
      </div>
      {msg && <div className="cost" style={{ color: "var(--carbonum)" }}>{msg}</div>}
      {error && <div className="error">{error}</div>}
      <table>
        <thead><tr><th>Sabotagem</th><th>Efeito</th><th>Custo</th><th>Tempo</th><th></th></tr></thead>
        <tbody>
          {data.all.map((s) => {
            const unlocked = data.available.includes(s.key);
            return (
              <tr key={s.key} style={{ opacity: unlocked ? 1 : 0.45 }}>
                <td><b>{s.name}</b></td>
                <td className="roid-count">{s.desc}</td>
                <td className="roid-count">{s.plut.toLocaleString("pt-BR")} P</td>
                <td className="roid-count">{s.ticks}t</td>
                <td>{unlocked ? <button onClick={() => run(s.key)}>executar</button> : <span className="roid-count">🔒 pesquisar</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Histórico: sabotagens concluídas (sucesso ou barradas). */}
      {data.history.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ margin: "0 0 6px" }}>📜 Histórico</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Sabotagem</th><th>Alvo</th><th className="hide-sm">Coord.</th><th>Resultado</th><th className="hide-sm">Tick</th></tr></thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id} style={{ opacity: h.success ? 1 : 0.6 }}>
                    <td><b>{h.name}</b></td>
                    <td>{h.target}</td>
                    <td className="hide-sm"><CoordLink c={h.coords} /></td>
                    <td className="roid-count">
                      {h.success ? <span style={{ color: "#37e07a" }}>✅ </span> : <span style={{ color: "#ff6b6b" }}>🛡️ </span>}
                      {h.detail}
                    </td>
                    <td className="hide-sm roid-count">#{h.tick}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
