import { useEffect, useState } from "react";
import { api } from "../api";

type Sab = Awaited<ReturnType<typeof api.sabotage>>;

export function Sabotagem() {
  const [data, setData] = useState<Sab | null>(null);
  // Coordenadas como texto (apagáveis no celular). Validadas no envio.
  const [g, setG] = useState("");
  const [s, setS] = useState("");
  const [slot, setSlot] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { api.sabotage().then(setData).catch((e) => setError(e.message)); }, []);

  async function run(key: string) {
    setError(""); setMsg("");
    const gg = parseInt(g, 10), ss = parseInt(s, 10), sl = parseInt(slot, 10);
    if (!(gg >= 1) || !(ss >= 1) || !(sl >= 1)) { setError("Digite a coordenada completa (galáxia:sistema:slot)."); return; }
    try {
      const r = await api.sabotageRun(gg, ss, sl, key);
      setMsg(r.message ?? (r.success ? "Sabotagem aplicada!" : "Sabotagem falhou."));
    } catch (e: any) { setError(e.message ?? "Falha"); }
  }

  if (!data) return <div className="panel"><div className="roid-count">Carregando...</div></div>;

  return (
    <div className="panel">
      <h2>Sabotagem</h2>
      <div className="cost">Escolha o alvo (outra galáxia) e a sabotagem que você desbloqueou. Pode ser repelida pela contra-espionagem do alvo.</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
        <span className="roid-count">Alvo</span>
        <input type="text" inputMode="numeric" maxLength={3} placeholder="gal" value={g} onChange={(e) => setG(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
        <span className="roid-count">:</span>
        <input type="text" inputMode="numeric" maxLength={3} placeholder="sis" value={s} onChange={(e) => setS(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
        <span className="roid-count">:</span>
        <input type="text" inputMode="numeric" maxLength={2} placeholder="slot" value={slot} onChange={(e) => setSlot(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
      </div>
      {msg && <div className="cost" style={{ color: "var(--carbonum)" }}>{msg}</div>}
      {error && <div className="error">{error}</div>}
      <table>
        <thead><tr><th>Sabotagem</th><th>Efeito</th><th></th></tr></thead>
        <tbody>
          {data.all.map((s) => {
            const unlocked = data.available.includes(s.key);
            return (
              <tr key={s.key} style={{ opacity: unlocked ? 1 : 0.45 }}>
                <td><b>{s.name}</b></td>
                <td className="roid-count">{s.desc}</td>
                <td>{unlocked ? <button onClick={() => run(s.key)}>executar</button> : <span className="roid-count">🔒 pesquisar</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
