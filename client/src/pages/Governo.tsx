import { useEffect, useState } from "react";
import { api, type GovView } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export function Governo() {
  const [gov, setGov] = useState<GovView | null>(null);
  const [error, setError] = useState("");
  const [taxInput, setTaxInput] = useState(0);
  const [galName, setGalName] = useState("");
  const [treatyG, setTreatyG] = useState(1);
  const [donTo, setDonTo] = useState("");
  const [don, setDon] = useState({ metalium: 0, carbonum: 0, plutonium: 0 });
  const [mgFleets, setMgFleets] = useState<{ owner: string; mission: string; status: string; target: string }[]>([]);

  async function load() {
    try {
      const g = await api.gov();
      setGov(g);
      setTaxInput(g.taxRate);
      if (g.iAmMG) {
        try { setMgFleets((await api.mgFleets()).fleets); } catch {}
      }
    } catch (e: any) {
      setError(e.message ?? "Falha");
    }
  }
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  async function act(fn: () => Promise<GovView>) {
    setError("");
    try { setGov(await fn()); } catch (e: any) { setError(e.message ?? "Falha"); }
  }

  function onFlagFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 45000) { setError("Imagem muito grande (máx ~45KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => act(() => api.govFlag(String(reader.result)));
    reader.readAsDataURL(file);
  }

  if (!gov) return <div className="panel"><div className="roid-count">Carregando governo...</div></div>;

  const canEcon = gov.iAmME;

  return (
    <>
      <div className="panel">
        <h2>Governo da Galáxia {gov.galaxy}</h2>
        <div className="status-row"><span>👑 Comandante (CG)</span><b>{gov.cg ?? "— vago —"}</b></div>
        <div className="status-row"><span>💰 Min. da Economia</span><b>{gov.me ?? "— vago —"}</b></div>
        <div className="status-row"><span>⚔️ Min. da Guerra</span><b>{gov.mg ?? "— vago —"}</b></div>
        <div className="status-row"><span>🕊️ Min. da Diplomacia</span><b>{gov.md ?? "— vago —"}</b></div>
        <div className="status-row"><span>Imposto</span><b>{gov.taxRate}%</b></div>
        <div className="cost" style={{ marginTop: 8 }}>
          Fundo da galáxia: <span>{fmt(gov.fund.metalium)} M</span> · <span>{fmt(gov.fund.carbonum)} C</span> · <span>{fmt(gov.fund.plutonium)} P</span>
        </div>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <div className="panel">
        <h2>Votação para Comandante</h2>
        <div className="cost">Vote em um planeta da sua galáxia. O mais votado vira CG.</div>
        <table>
          <thead><tr><th>Planeta</th><th>Comandante</th><th>Coord.</th><th>Votos</th><th></th></tr></thead>
          <tbody>
            {gov.members.map((m) => (
              <tr key={m.id} style={{ background: gov.myVote === m.id ? "rgba(111,227,176,0.1)" : undefined }}>
                <td><b>{m.name}</b>{gov.cgId === m.id && " 👑"}</td>
                <td>{m.commander}</td>
                <td>{m.coords}</td>
                <td>{m.votes}</td>
                <td>
                  {gov.myVote === m.id
                    ? <span className="roid-count">seu voto</span>
                    : <button onClick={() => act(() => api.govVote(m.id))}>votar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gov.iAmCG && (
        <div className="panel">
          <h2>👑 Comandante da Galáxia (você)</h2>
          <div className="roid-row">
            <div>Nome da galáxia</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={galName} onChange={(e) => setGalName(e.target.value)} placeholder="nome..." style={{ width: 160, margin: 0, padding: "4px 8px" }} />
              <button disabled={!galName.trim()} onClick={() => act(() => api.govName(galName.trim()))}>definir</button>
            </div>
          </div>
          <div className="roid-row">
            <div>
              Bandeira da galáxia <span className="roid-count">(imagem, máx ~45KB)</span>
              {gov.flag && <div style={{ marginTop: 6 }}><img src={gov.flag} alt="bandeira" style={{ height: 48, borderRadius: 4, border: "1px solid var(--border)" }} /></div>}
            </div>
            <input type="file" accept="image/*" onChange={onFlagFile} style={{ maxWidth: 200 }} />
          </div>
        </div>
      )}

      {gov.iAmCG && (
        <div className="panel">
          <h2>👑 Nomear ministros</h2>
          {(["me", "mg", "md"] as const).map((role) => (
            <div className="roid-row" key={role}>
              <div>{role === "me" ? "💰 Ministro da Economia" : role === "mg" ? "⚔️ Ministro da Guerra" : "🕊️ Ministro da Diplomacia"}</div>
              <select
                defaultValue=""
                onChange={(e) => e.target.value && act(() => api.govAppoint(role, e.target.value))}
                style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}
              >
                <option value="">nomear...</option>
                {gov.members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.commander})</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {canEcon && (
        <div className="panel">
          <h2>💰 Economia (ME)</h2>
          <div className="roid-row">
            <div>Imposto da galáxia (% da produção → fundo)</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" min={0} max={50} value={taxInput} onChange={(e) => setTaxInput(Number(e.target.value))} style={{ width: 70, margin: 0, padding: "4px 6px" }} />
              <button onClick={() => act(() => api.govTax(taxInput))}>aplicar</button>
            </div>
          </div>
          <div style={{ marginTop: 10 }} className="cost">Doar do fundo (máx 20% por doação, 1 doação a cada 100 ticks por planeta):</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <select value={donTo} onChange={(e) => setDonTo(e.target.value)} style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}>
              <option value="">planeta...</option>
              {gov.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="number" min={0} placeholder="M" value={don.metalium} onChange={(e) => setDon({ ...don, metalium: Number(e.target.value) })} style={{ width: 80, margin: 0, padding: "4px 6px" }} />
            <input type="number" min={0} placeholder="C" value={don.carbonum} onChange={(e) => setDon({ ...don, carbonum: Number(e.target.value) })} style={{ width: 80, margin: 0, padding: "4px 6px" }} />
            <input type="number" min={0} placeholder="P" value={don.plutonium} onChange={(e) => setDon({ ...don, plutonium: Number(e.target.value) })} style={{ width: 80, margin: 0, padding: "4px 6px" }} />
            <button disabled={!donTo} onClick={() => act(() => api.govDonate(donTo, don.metalium, don.carbonum, don.plutonium))}>doar</button>
          </div>
        </div>
      )}

      {gov.iAmMD && (
        <div className="panel">
          <h2>🕊️ Diplomacia (MD)</h2>
          <div className="cost">Tratados de não-agressão entre galáxias (ambas precisam aceitar). Com tratado ativo, ninguém ataca a outra galáxia.</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
            <span className="roid-count">Galáxia</span>
            <input type="number" min={1} value={treatyG} onChange={(e) => setTreatyG(Math.max(1, Number(e.target.value)))} style={{ width: 70, margin: 0, padding: "4px 8px" }} />
            <button onClick={() => act(() => api.treatyAction("propose", treatyG))}>propor tratado</button>
          </div>
          {(gov.treaties?.length ?? 0) === 0 ? <div className="roid-count">Nenhum tratado.</div> : (
            <table>
              <thead><tr><th>Galáxia</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {gov.treaties!.map((t) => (
                  <tr key={t.other}>
                    <td>Galáxia {t.other}</td>
                    <td className="roid-count">{t.status === "active" ? "✅ ativo" : t.proposedByMe ? "⏳ aguardando aceite deles" : "📨 proposta recebida"}</td>
                    <td>
                      {t.status === "proposed" && !t.proposedByMe && <button onClick={() => act(() => api.treatyAction("accept", t.other))}>aceitar</button>}{" "}
                      <button onClick={() => act(() => api.treatyAction("cancel", t.other))}>cancelar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {gov.iAmMG && (
        <div className="panel">
          <h2>⚔️ Frotas da galáxia (MG)</h2>
          {mgFleets.length === 0 ? (
            <div className="roid-count">Nenhuma frota em movimento na galáxia.</div>
          ) : (
            <table>
              <thead><tr><th>Planeta</th><th>Missão</th><th>Estado</th><th>Destino</th></tr></thead>
              <tbody>
                {mgFleets.map((f, i) => (
                  <tr key={i}><td>{f.owner}</td><td>{f.mission}</td><td>{f.status}</td><td>{f.target}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
