import { useEffect, useState } from "react";
import { api } from "../api";

type Sab = Awaited<ReturnType<typeof api.sabotage>>;

export function Sabotagem() {
  const [data, setData] = useState<Sab | null>(null);
  const [g, setG] = useState(1);
  const [s, setS] = useState(1);
  const [slot, setSlot] = useState(1);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { api.sabotage().then(setData).catch((e) => setError(e.message)); }, []);

  async function run(key: string) {
    setError(""); setMsg("");
    try {
      const r = await api.sabotageRun(g, s, slot, key);
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
        <input type="number" min={1} value={g} onChange={(e) => setG(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
        <span className="roid-count">:</span>
        <input type="number" min={1} value={s} onChange={(e) => setS(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
        <span className="roid-count">:</span>
        <input type="number" min={1} max={15} value={slot} onChange={(e) => setSlot(Math.max(1, Number(e.target.value)))} style={{ width: 60, margin: 0, padding: "6px 8px" }} />
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
