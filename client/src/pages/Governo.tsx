import { useEffect, useState } from "react";
import { api, REFRESH_MS, type GovView, type MgPlanet, type WarInfoPlanet, type WarMove } from "../api";
import { CoordLink } from "../components/CoordLink";
import { PlanetTag } from "../components/PlanetTag";

// "Caça ×10 · Hela ×5" a partir do mapa de naves.
function fmtUnits(u: Record<string, number>): string {
  const s = Object.entries(u).filter(([, c]) => c > 0).map(([n, c]) => `${n} ×${c}`).join(" · ");
  return s || "—";
}

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

// Estado claro de uma frota pro MG: diz se está atacando, defendendo, recuando,
// em combate, guarnecendo ou agendada (pedido do lythorf — o TEC sozinho não dizia).
function fleetEstado(mission: string, status: string): { label: string; color: string } {
  if (status === "returning") return { label: "↩️ recuando", color: "var(--muted)" };
  if (status === "engaged") return { label: "⚔️ em combate", color: "var(--danger)" };
  if (status === "garrison") return { label: "🛡️ defendendo", color: "var(--carbonum)" };
  if (status === "scheduled") return { label: "🕓 agendada", color: "var(--accent)" };
  // outbound: depende da missão
  if (mission === "attack") return { label: "⚔️ atacando", color: "var(--danger)" };
  return { label: "🛡️ defendendo", color: "var(--carbonum)" };
}

// Hook compartilhado: carrega o governo + expõe `act` (executa uma ação e atualiza).
function useGov() {
  const [gov, setGov] = useState<GovView | null>(null);
  const [error, setError] = useState("");
  async function load() {
    try { setGov(await api.gov()); } catch (e: any) { setError(e.message ?? "Falha"); }
  }
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, []);
  async function act(fn: () => Promise<GovView>) {
    setError("");
    try { setGov(await fn()); } catch (e: any) { setError(e.message ?? "Falha"); }
  }
  return { gov, error, setError, act, reload: load };
}

const LOADING = <div className="panel"><div className="roid-count">Carregando governo...</div></div>;

// ===================================================================
// VOTAÇÃO — item próprio do menu (todos veem): quem são os ministros +
// votar para Comandante da Galáxia.
// ===================================================================
export function Votacao() {
  const { gov, error, act } = useGov();
  if (!gov) return LOADING;
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
      </div>

      <div className="panel">
        <h2>📜 O que cada cargo faz</h2>
        <div className="cost" style={{ lineHeight: 1.8 }}>
          <div><b style={{ color: "#ffd23f" }}>👑 Comandante (CG)</b> — o mais votado da galáxia. Nomeia e troca os ministros e define o nome e a bandeira da galáxia.</div>
          <div><b style={{ color: "#3aa0ff" }}>💰 Ministro da Economia (ME)</b> — define o <b>imposto</b> (% da produção que vai pro fundo), a <b>taxa do mercado</b> da galáxia e <b>doa</b> recursos do fundo aos planetas.</div>
          <div><b style={{ color: "#ff5050" }}>⚔️ Ministro da Guerra (MG)</b> — enxerga a <b>força militar</b> de todos os planetas da galáxia: naves na base e em frotas (até as invisíveis).</div>
          <div><b style={{ color: "#ff9a2b" }}>🕊️ Ministro da Diplomacia (MD)</b> — propõe e aceita <b>tratados</b> de não-agressão com outras galáxias.</div>
        </div>
        <div className="cost" style={{ marginTop: 8, opacity: 0.85 }}>
          Quando você for eleito ou nomeado, aparece um item próprio no menu (👑 Comandante, 💰 Economia, ⚔️ Guerra, 🕊️ Diplomacia) com as ações do seu cargo.
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
                <td><CoordLink c={m.coords} /></td>
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
        {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
      </div>
    </>
  );
}

// ===================================================================
// RESUMO DO FUNDO — vai na aba RECURSOS: fundo, livro-caixa e doar PRA
// o fundo (qualquer membro). O mercado do fundo já está em Recursos.
// ===================================================================
export function FundoGalaxia() {
  const { gov, error, act } = useGov();
  const [contrib, setContrib] = useState({ metalium: 0, carbonum: 0, plutonium: 0 });
  if (!gov) return LOADING;
  return (
    <div className="panel">
      <h2>🏦 Fundo da Galáxia {gov.galaxyCoord ?? gov.galaxy}</h2>
      <div style={{ padding: "10px 14px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "rgba(37,211,255,0.06)" }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: "var(--mono)" }}>
          <span><span className="dot metalium" /> <b>{fmt(gov.fund.metalium)}</b> M</span>
          <span><span className="dot carbonum" /> <b>{fmt(gov.fund.carbonum)}</b> C</span>
          <span><span className="dot plutonium" /> <b>{fmt(gov.fund.plutonium)}</b> P</span>
        </div>
      </div>
      <div className="cost" style={{ marginTop: 8 }}>
        O <b>imposto</b> da galáxia ({gov.taxRate}% da produção) e as trocas no mercado abastecem este fundo. O <b>Ministro da Economia</b> distribui aos planetas.
      </div>

      {/* Doar PRA o fundo — qualquer planeta da galáxia pode contribuir. */}
      <div style={{ marginTop: 10 }}>
        <div className="cost" style={{ marginBottom: 4 }}>🤝 Doar recursos PRA o fundo (o ME distribui depois):</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input type="number" min={0} placeholder="M" value={contrib.metalium || ""} onChange={(e) => setContrib({ ...contrib, metalium: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 90, margin: 0, padding: "4px 6px" }} />
          <input type="number" min={0} placeholder="C" value={contrib.carbonum || ""} onChange={(e) => setContrib({ ...contrib, carbonum: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 90, margin: 0, padding: "4px 6px" }} />
          <input type="number" min={0} placeholder="P" value={contrib.plutonium || ""} onChange={(e) => setContrib({ ...contrib, plutonium: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 90, margin: 0, padding: "4px 6px" }} />
          <button onClick={() => act(async () => { const r = await api.govContribute(contrib.metalium, contrib.carbonum, contrib.plutonium); setContrib({ metalium: 0, carbonum: 0, plutonium: 0 }); return r; })}>doar ao fundo</button>
        </div>
      </div>

      {/* Livro caixa: histórico das doações do fundo (transparência p/ a galáxia). */}
      {gov.donations && gov.donations.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="cost" style={{ marginBottom: 4 }}>📒 Livro caixa — últimas doações do fundo:</div>
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6 }}>
            <table style={{ width: "100%", fontSize: 12 }}>
              <thead><tr><th>Tick</th><th>De (ME)</th><th>Para</th><th>M / C / P</th></tr></thead>
              <tbody>
                {gov.donations.map((d, i) => (
                  <tr key={i}>
                    <td className="roid-count">#{d.tick}</td>
                    <td>{d.from}</td>
                    <td><b>{d.to}</b></td>
                    <td className="roid-count">{fmt(d.metalium)} / {fmt(d.carbonum)} / {fmt(d.plutonium)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// ===================================================================
// 👑 COMANDANTE (CG) — nome/bandeira da galáxia + nomear ministros.
// ===================================================================
export function CargoCG() {
  const { gov, error, act } = useGov();
  const [galName, setGalName] = useState("");

  function onFlagFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      let out = canvas.toDataURL("image/webp", 0.9);
      const webpOk = out.startsWith("data:image/webp");
      const type = webpOk ? "image/webp" : "image/jpeg";
      let q = 0.9;
      out = canvas.toDataURL(type, q);
      while (out.length > 55000 && q > 0.3) { q -= 0.1; out = canvas.toDataURL(type, q); }
      if (out.length > 55000) return;
      act(() => api.govFlag(out));
    };
    img.src = url;
  }

  if (!gov) return LOADING;
  if (!gov.iAmCG) return <div className="panel"><div className="roid-count">Você não é o Comandante da Galáxia. (Este menu só aparece pra quem ocupa o cargo.)</div></div>;

  return (
    <>
      <div className="panel">
        <h2>👑 Comandante da Galáxia</h2>
        <div className="cost" style={{ marginBottom: 8 }}>Você é o CG de <b>{gov.galaxyName || gov.galaxyCoord}</b>. Defina a identidade da galáxia e nomeie seus ministros.</div>
        <div className="roid-row">
          <div>Nome da galáxia</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={galName} onChange={(e) => setGalName(e.target.value)} placeholder={gov.galaxyName || "nome..."} style={{ width: 160, margin: 0, padding: "4px 8px" }} />
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

      <div className="panel">
        <h2>👑 Nomear ministros</h2>
        <div className="cost" style={{ marginBottom: 6 }}>Atuais: 💰 {gov.me ?? "vago"} · ⚔️ {gov.mg ?? "vago"} · 🕊️ {gov.md ?? "vago"}</div>
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
      {error && <div className="error">{error}</div>}
    </>
  );
}

// ===================================================================
// 💰 MINISTRO DA ECONOMIA (ME) — imposto, taxa/trava do mercado e doar
// do fundo aos planetas (com teto por janela visível).
// ===================================================================
export function CargoME() {
  const { gov, error, act } = useGov();
  const [taxInput, setTaxInput] = useState<number | null>(null);
  const [feeInput, setFeeInput] = useState<number | null>(null);
  const [donTo, setDonTo] = useState("");
  const [don, setDon] = useState({ metalium: 0, carbonum: 0, plutonium: 0 });

  if (!gov) return LOADING;
  if (!gov.iAmME) return <div className="panel"><div className="roid-count">Você não é o Ministro da Economia. (Este menu só aparece pra quem ocupa o cargo.)</div></div>;
  const tax = taxInput ?? gov.taxRate;
  const fee = feeInput ?? gov.marketFee;
  const sel = gov.members.find((m) => m.id === donTo);

  return (
    <>
      <div className="panel">
        <h2>💰 Ministro da Economia</h2>
        <div className="roid-row">
          <div>Imposto da galáxia (% da produção → fundo)</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" min={0} max={25} value={tax} onChange={(e) => setTaxInput(Math.max(0, Math.min(25, Math.floor(Number(e.target.value) || 0))))} style={{ width: 70, margin: 0, padding: "4px 6px" }} />
            <button onClick={() => act(() => api.govTax(tax))}>aplicar</button>
          </div>
        </div>
        <div className="roid-row">
          <div>Taxa do mercado (% que fica no fundo nas trocas)</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" min={0} max={25} value={fee} onChange={(e) => setFeeInput(Math.max(0, Math.min(25, Math.floor(Number(e.target.value) || 0))))} style={{ width: 70, margin: 0, padding: "4px 6px" }} />
            <button onClick={() => act(() => api.govMarketFee(fee))}>aplicar</button>
          </div>
        </div>
        <div className="roid-row">
          <div>Mercado da galáxia: <b style={{ color: gov.marketLocked ? "#ff6b6b" : "#37e07a" }}>{gov.marketLocked ? "🔒 trancado" : "🔓 aberto"}</b></div>
          <button onClick={() => act(() => api.govMarketLock(!gov.marketLocked))}>{gov.marketLocked ? "destrancar" : "trancar"}</button>
        </div>
      </div>

      <div className="panel">
        <h2>💰 Doar do fundo aos planetas</h2>
        <div className="cost">
          Cada planeta pode <b>receber até 50% do fundo por janela</b> (somando as doações, livre entre M/C/P). Quando a janela passa, pode receber mais 50%.
          <div style={{ marginTop: 4, fontSize: 12 }}>
            Fundo: <b>{fmt(gov.fund.metalium)}</b> M · <b>{fmt(gov.fund.carbonum)}</b> C · <b>{fmt(gov.fund.plutonium)}</b> P
          </div>
          {sel?.donation && (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              <b>{sel.name}</b> nesta janela: recebeu <b style={{ color: "var(--carbonum)" }}>{fmt(sel.donation.recv)}</b> de <b>{fmt(sel.donation.cap)}</b> ·
              {" "}pode receber mais <b style={{ color: "#3aa0ff" }}>{fmt(sel.donation.canReceive)}</b>
              {sel.donation.resetIn > 0 && <span className="roid-count"> (janela zera em {sel.donation.resetIn}t)</span>}
            </div>
          )}
        </div>
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
      {error && <div className="error">{error}</div>}
    </>
  );
}

// ===================================================================
// ⚔️ MINISTRO DA GUERRA (MG) — força militar de todos os planetas.
// ===================================================================
export function CargoMG() {
  const { gov } = useGov();
  const [mgFleets, setMgFleets] = useState<MgPlanet[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function loadF() { try { const r = await api.mgFleets(); if (alive) setMgFleets(r.planets); } catch (e: any) { if (alive) setError(e.message ?? ""); } }
    loadF(); const t = setInterval(loadF, REFRESH_MS); return () => { alive = false; clearInterval(t); };
  }, []);
  if (!gov) return LOADING;
  if (!gov.iAmMG) return <div className="panel"><div className="roid-count">Você não é o Ministro da Guerra. (Este menu só aparece pra quem ocupa o cargo.)</div></div>;
  return (
    <div className="panel">
      <h2>⚔️ Força militar da galáxia</h2>
      <div className="cost" style={{ marginBottom: 10 }}>Naves de cada planeta — na base (hangar) e em frotas. Inteligência interna: mostra até as naves invisíveis.</div>
      {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
      {mgFleets.length === 0 ? (
        <div className="roid-count">Nenhum planeta na galáxia.</div>
      ) : mgFleets.map((p, i) => (
        <div key={i} className="roid-row" style={{ display: "block" }}>
          <div><b>{p.planet}</b> <span className="roid-count">({p.commander}) · <CoordLink c={p.coords} /></span></div>
          <div className="roid-count fleet-base-row" style={{ marginTop: 2 }}>
            🏠 Base ({p.baseTotal} naves): <span style={{ color: "var(--text)" }}>{fmtUnits(p.base)}</span>
          </div>
          {p.fleets.length === 0 ? (
            <div className="roid-count">Sem frotas montadas.</div>
          ) : p.fleets.map((f, j) => (
            <div key={j} className="roid-count" style={{ marginTop: 2 }}>
              🚀 {f.name} <span style={{ opacity: 0.85 }}>[{f.status === "idle" ? "na base" : (() => { const est = fleetEstado(f.mission, f.status); return <><b style={{ color: est.color }}>{est.label}</b> → <CoordLink c={f.target} />{f.status === "engaged" ? "" : f.ticks > 0 ? <> · <b style={{ color: "var(--accent)" }}>TEC {f.ticks}t</b></> : ""}</>; })()}]</span> ({f.total}): <span style={{ color: "var(--text)" }}>{fmtUnits(f.units)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ===================================================================
// 🗺️ INFORMAÇÃO DE GUERRA (MG + CG) — ataques e defesas por planeta, por TEC.
// ===================================================================
function WarRow({ m, kind }: { m: WarMove; kind: "atk" | "def" }) {
  return (
    <div className="roid-count" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline", marginTop: 2 }}>
      <span style={{ minWidth: 54, fontFamily: "var(--mono)", color: m.engaged ? "var(--danger)" : "var(--accent)" }}>
        {m.engaged ? "em combate" : `TEC ${m.tec}t`}
      </span>
      <span style={{ color: kind === "atk" ? "var(--danger)" : "var(--carbonum)" }}>{kind === "atk" ? "⚔️" : "🛡️"}</span>
      <span><PlanetTag planet={m.fromPlanet} commander={m.fromCommander} /> <span style={{ opacity: 0.7 }}>(<CoordLink c={m.from} />)</span></span>
      {m.ships != null && <span style={{ opacity: 0.8 }}>· {fmt(m.ships)} nave(s)</span>}
    </div>
  );
}

export function InfoGuerra() {
  const { gov } = useGov();
  const [planets, setPlanets] = useState<WarInfoPlanet[]>([]);
  const [canSeeShips, setCanSeeShips] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function load() { try { const r = await api.warInfo(); if (alive) { setPlanets(r.planets); setCanSeeShips(r.canSeeShips); setError(""); } } catch (e: any) { if (alive) setError(e.message ?? ""); } }
    load(); const t = setInterval(load, REFRESH_MS); return () => { alive = false; clearInterval(t); };
  }, []);
  if (!gov) return LOADING;
  if (!gov.iAmMG && !gov.iAmCG) return <div className="panel"><div className="roid-count">Só o Ministro da Guerra ou o Comandante da Galáxia veem a Informação de Guerra.</div></div>;
  // Mostra o planeta se tem movimento, produção de naves (MG) ou combate recente (MG).
  const comInfo = planets.filter((p) => p.attacks.length > 0 || p.defenses.length > 0 || (p.production?.length ?? 0) > 0 || (p.combats?.length ?? 0) > 0);
  return (
    <div className="panel">
      <h2>🗺️ Informação de Guerra</h2>
      <div className="cost" style={{ marginBottom: 10 }}>
        Por planeta da galáxia: os <b style={{ color: "var(--danger)" }}>⚔️ ataques</b> chegando (ordem de TEC) e, embaixo, as <b style={{ color: "var(--carbonum)" }}>🛡️ defesas</b> (reforços) — também por TEC.
        {canSeeShips
          ? <> O MG também vê a <b>🏭 produção de naves</b> e os <b>⚔️ combates recentes</b> de cada planeta.</>
          : <> <span className="roid-count">A <b>força (nº de naves)</b>, a <b>produção</b> e os <b>combates</b> são inteligência do <b>Ministro da Guerra</b> — como CG você vê os movimentos e o TEC, mas não a quantidade.</span></>}
      </div>
      {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
      {comInfo.length === 0 ? (
        <div className="roid-count">Nenhum movimento, produção ou combate na galáxia agora. ✌️</div>
      ) : comInfo.map((p) => (
        <div key={p.coords} className="roid-row" style={{ display: "block", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <div style={{ marginBottom: 2 }}><b>{p.planet}</b> <span className="roid-count">({p.commander}) · <CoordLink c={p.coords} /></span></div>
          {(p.attacks.length > 0 || p.defenses.length > 0) && (
            <>
              {p.attacks.length > 0 ? p.attacks.map((m, i) => <WarRow key={`a${i}`} m={m} kind="atk" />)
                : <div className="roid-count" style={{ opacity: 0.6 }}>⚔️ sem ataques</div>}
              {p.defenses.map((m, i) => <WarRow key={`d${i}`} m={m} kind="def" />)}
            </>
          )}
          {/* Produção de naves (só MG) */}
          {(p.production?.length ?? 0) > 0 && (
            <div className="roid-count" style={{ marginTop: 3 }}>
              🏭 <b>Produção:</b> {p.production.map((pr, i) => (
                <span key={i}>{i > 0 ? " · " : " "}{fmt(pr.quantity)}× {pr.ship} <span style={{ color: "var(--accent)" }}>({pr.ticks}t)</span></span>
              ))}
            </div>
          )}
          {/* Combates recentes (só MG) */}
          {(p.combats?.length ?? 0) > 0 && (
            <div className="roid-count" style={{ marginTop: 3 }}>
              ⚔️ <b>Combates:</b> {p.combats.map((c, i) => (
                <span key={i}>{i > 0 ? " · " : " "}tick #{c.tick} vs <b>{c.attacker}</b> (<CoordLink c={c.attackerCoords} />){c.winner === "attack" ? " 🔴" : c.winner === "defense" || c.winner === "ally-defense" ? " 🟢" : ""}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ===================================================================
// 💰 INFORMAÇÃO DE ECONOMIA (ME + CG) — recursos e roids de cada planeta.
// ===================================================================
export function InfoEconomia() {
  const { gov } = useGov();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.economyInfo>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function load() { try { const r = await api.economyInfo(); if (alive) { setData(r); setError(""); } } catch (e: any) { if (alive) setError(e.message ?? ""); } }
    load(); const t = setInterval(load, REFRESH_MS); return () => { alive = false; clearInterval(t); };
  }, []);
  if (!gov) return LOADING;
  if (!gov.iAmME && !gov.iAmCG) return <div className="panel"><div className="roid-count">Só o Ministro da Economia ou o Comandante da Galáxia veem a Informação de Economia.</div></div>;
  return (
    <div className="panel">
      <h2>💰 Informação de Economia</h2>
      <div className="cost" style={{ marginBottom: 10 }}>
        Recursos em estoque e <b>roids</b> de cada recurso, por planeta da galáxia — pra planejar imposto e doações.
      </div>
      {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
      {!data ? LOADING : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Planeta</th><th title="Metalium / Carbonum / Plutonium em estoque">Recursos (M/C/P)</th><th title="Roids de cada recurso">Roids (M/C/P)</th><th>Total roids</th></tr></thead>
            <tbody>
              {data.planets.map((p) => (
                <tr key={p.coords}>
                  <td><b>{p.planet}</b> <span className="roid-count">({p.commander}) <CoordLink c={p.coords} /></span></td>
                  <td className="roid-count">{fmt(p.resources.metalium)} / {fmt(p.resources.carbonum)} / {fmt(p.resources.plutonium)}</td>
                  <td className="roid-count">{fmt(p.roids.metalium)} / {fmt(p.roids.carbonum)} / {fmt(p.roids.plutonium)}</td>
                  <td><b style={{ color: "var(--accent)" }}>{fmt(p.roidTotal)}</b></td>
                </tr>
              ))}
              <tr className="fg-meta">
                <td><b>Total da galáxia</b></td>
                <td className="roid-count">{fmt(data.totals.metalium)} / {fmt(data.totals.carbonum)} / {fmt(data.totals.plutonium)}</td>
                <td className="roid-count">—</td>
                <td><b style={{ color: "var(--accent)" }}>{fmt(data.totals.roids)}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===================================================================
// 🕊️ MINISTRO DA DIPLOMACIA (MD) — tratados de não-agressão.
// ===================================================================
export function CargoMD() {
  const { gov, error, act } = useGov();
  const [treatySetor, setTreatySetor] = useState(1);
  const [treatySistema, setTreatySistema] = useState(1);
  const treatyGalId = (treatySetor - 1) * 6 + treatySistema;
  if (!gov) return LOADING;
  if (!gov.iAmMD) return <div className="panel"><div className="roid-count">Você não é o Ministro da Diplomacia. (Este menu só aparece pra quem ocupa o cargo.)</div></div>;
  return (
    <div className="panel">
      <h2>🕊️ Ministro da Diplomacia</h2>
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
      {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

// Compat: "Governo" antigo = agora só a Votação (menu geral).
export const Governo = Votacao;
