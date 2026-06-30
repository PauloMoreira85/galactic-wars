import { useEffect, useState } from "react";
import { api, type GovView } from "../api";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export function Governo() {
  const [gov, setGov] = useState<GovView | null>(null);
  const [error, setError] = useState("");
  const [taxInput, setTaxInput] = useState(0);
  const [feeInput, setFeeInput] = useState(20);
  const [galName, setGalName] = useState("");
  const [treatySetor, setTreatySetor] = useState(1);
  const [treatySistema, setTreatySistema] = useState(1);
  const treatyGalId = (treatySetor - 1) * 6 + treatySistema; // = galaxyId(setor, sistema)
  const [donTo, setDonTo] = useState("");
  const [don, setDon] = useState({ metalium: 0, carbonum: 0, plutonium: 0 });
  const [mgFleets, setMgFleets] = useState<{ owner: string; mission: string; status: string; target: string }[]>([]);

  async function load() {
    try {
      const g = await api.gov();
      setGov(g);
      setTaxInput(g.taxRate);
      setFeeInput(g.marketFee);
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

  // Aceita QUALQUER imagem: redimensiona pra no máx 256px e comprime até caber
  // (a bandeira é exibida pequena, ~48px). Assim o tamanho do arquivo não importa.
  function onFlagFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 256;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setError("Não foi possível processar a imagem."); return; }
      ctx.drawImage(img, 0, 0, w, h);
      let out = canvas.toDataURL("image/webp", 0.9);
      const webpOk = out.startsWith("data:image/webp"); // navegadores antigos caem pra png
      const type = webpOk ? "image/webp" : "image/jpeg";
      let q = 0.9;
      out = canvas.toDataURL(type, q);
      while (out.length > 55000 && q > 0.3) { q -= 0.1; out = canvas.toDataURL(type, q); }
      if (out.length > 55000) { setError("Não consegui comprimir a bandeira o suficiente — tente outra imagem."); return; }
      act(() => api.govFlag(out));
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError("Não foi possível ler a imagem."); };
    img.src = url;
  }

  if (!gov) return <div className="panel"><div className="roid-count">Carregando governo...</div></div>;

  const canEcon = gov.iAmME;

  return (
    <>
      <div className="panel">
        <h2>Governo da Galáxia {gov.galaxyCoord ?? gov.galaxy}</h2>
        <div className="status-row"><span>👑 Comandante (CG)</span><b>{gov.cg ?? "— vago —"}</b></div>
        <div className="status-row"><span>💰 Min. da Economia</span><b>{gov.me ?? "— vago —"}</b></div>
        <div className="status-row"><span>⚔️ Min. da Guerra</span><b>{gov.mg ?? "— vago —"}</b></div>
        <div className="status-row"><span>🕊️ Min. da Diplomacia</span><b>{gov.md ?? "— vago —"}</b></div>
        <div className="status-row"><span>Imposto</span><b>{gov.taxRate}%</b></div>
        <div className="status-row"><span>Taxa do mercado</span><b>{gov.marketFee}%</b></div>
        <div className="cost" style={{ marginTop: 8 }}>
          Fundo da galáxia: <span>{fmt(gov.fund.metalium)} M</span> · <span>{fmt(gov.fund.carbonum)} C</span> · <span>{fmt(gov.fund.plutonium)} P</span>
        </div>
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>

      <div className="panel">
        <h2>📜 O que cada cargo faz</h2>
        <div className="cost" style={{ lineHeight: 1.8 }}>
          <div><b style={{ color: "#ffd23f" }}>👑 Comandante (CG)</b> — o mais votado da galáxia. Nomeia e troca os ministros e define o nome e a bandeira da galáxia.</div>
          <div><b style={{ color: "#3aa0ff" }}>💰 Ministro da Economia (ME)</b> — define o <b>imposto</b> (% da produção que vai pro fundo), a <b>taxa do mercado</b> da galáxia e <b>doa</b> recursos do fundo aos planetas.</div>
          <div><b style={{ color: "#ff5050" }}>⚔️ Ministro da Guerra (MG)</b> — enxerga as <b>frotas</b> de todos os planetas da galáxia (inteligência militar interna).</div>
          <div><b style={{ color: "#ff9a2b" }}>🕊️ Ministro da Diplomacia (MD)</b> — propõe e aceita <b>tratados</b> de não-agressão com outras galáxias.</div>
        </div>
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
              Bandeira da galáxia <span className="roid-count">(qualquer imagem — redimensiono automaticamente)</span>
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
                {gov.members.filter((m) => m.id !== gov.cgId).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.commander})</option>)}
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
              <input type="number" min={0} max={25} value={taxInput || ""} placeholder="0" onChange={(e) => setTaxInput(Math.max(0, Math.min(25, Math.floor(Number(e.target.value) || 0))))} style={{ width: 70, margin: 0, padding: "4px 6px" }} />
              <button onClick={() => act(() => api.govTax(taxInput))}>aplicar</button>
            </div>
          </div>
          <div className="roid-row">
            <div>Taxa do mercado (% que fica no fundo nas trocas)</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" min={0} max={25} value={feeInput || ""} placeholder="0" onChange={(e) => setFeeInput(Math.max(0, Math.min(25, Math.floor(Number(e.target.value) || 0))))} style={{ width: 70, margin: 0, padding: "4px 6px" }} />
              <button onClick={() => act(() => api.govMarketFee(feeInput))}>aplicar</button>
            </div>
          </div>
          <div className="roid-row">
            <div>Mercado da galáxia: <b style={{ color: gov.marketLocked ? "#ff6b6b" : "#37e07a" }}>{gov.marketLocked ? "🔒 trancado" : "🔓 aberto"}</b></div>
            <button onClick={() => act(() => api.govMarketLock(!gov.marketLocked))}>{gov.marketLocked ? "destrancar" : "trancar"}</button>
          </div>
          <div style={{ marginTop: 10 }} className="cost">Doar do fundo (máx 20% por doação, 1 doação a cada 100 ticks por planeta):</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <select value={donTo} onChange={(e) => setDonTo(e.target.value)} style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px" }}>
              <option value="">planeta...</option>
              {gov.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="number" min={0} placeholder="M" value={don.metalium || ""} onChange={(e) => setDon({ ...don, metalium: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 80, margin: 0, padding: "4px 6px" }} />
            <input type="number" min={0} placeholder="C" value={don.carbonum || ""} onChange={(e) => setDon({ ...don, carbonum: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 80, margin: 0, padding: "4px 6px" }} />
            <input type="number" min={0} placeholder="P" value={don.plutonium || ""} onChange={(e) => setDon({ ...don, plutonium: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 80, margin: 0, padding: "4px 6px" }} />
            <button disabled={!donTo} onClick={() => act(() => api.govDonate(donTo, don.metalium, don.carbonum, don.plutonium))}>doar</button>
          </div>
        </div>
      )}

      {gov.iAmMD && (
        <div className="panel">
          <h2>🕊️ Diplomacia (MD)</h2>
          <div className="cost">Tratados de não-agressão entre galáxias (ambas precisam aceitar). Com tratado ativo, ninguém ataca a outra galáxia.</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
            <span className="roid-count">Galáxia (setor:paralelo)</span>
            <input type="number" min={1} max={5} value={treatySetor} title="Setor (1-5)" onChange={(e) => setTreatySetor(Math.max(1, Math.min(5, Number(e.target.value))))} style={{ width: 56, margin: 0, padding: "4px 8px" }} />
            <span>:</span>
            <input type="number" min={1} max={6} value={treatySistema} title="Paralelo (1-6)" onChange={(e) => setTreatySistema(Math.max(1, Math.min(6, Number(e.target.value))))} style={{ width: 56, margin: 0, padding: "4px 8px" }} />
            <button onClick={() => act(() => api.treatyAction("propose", treatyGalId))}>propor tratado</button>
          </div>
          {(gov.treaties?.length ?? 0) === 0 ? <div className="roid-count">Nenhum tratado.</div> : (
            <table>
              <thead><tr><th>Galáxia</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {gov.treaties!.map((t) => (
                  <tr key={t.other}>
                    <td>Galáxia {t.otherCoord ?? t.other}</td>
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
