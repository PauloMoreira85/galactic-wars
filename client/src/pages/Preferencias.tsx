import { useEffect, useState } from "react";
import { api, type PlanetView, type RaceInfo } from "../api";

// Redimensiona uma imagem (File) para um data URL pequeno (máx ~160px, JPEG).
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 160;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponível"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Imagem inválida"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

// Minha Conta: avatar, e-mail, contato p/ premiação, senha + auto-exílio.
export function Preferencias({ view, onChanged }: { view: PlanetView; onChanged: () => void }) {
  const [error, setError] = useState("");

  // ===== Senha =====
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  // ===== Conta (e-mail, whatsapp, pix, avatar) =====
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");

  const [whatsapp, setWhatsapp] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [profMsg, setProfMsg] = useState("");
  const [profErr, setProfErr] = useState("");

  // ===== Raça (trocável durante a proteção de novato) =====
  const [races, setRaces] = useState<RaceInfo[]>([]);
  const [raceMsg, setRaceMsg] = useState("");
  const [raceErr, setRaceErr] = useState("");
  const [raceBusy, setRaceBusy] = useState(false);
  const canChangeRace = view.planet.protection.active;

  useEffect(() => {
    api.account().then((a) => {
      setEmail(a.email);
      setWhatsapp(a.whatsapp ?? "");
      setPixKey(a.pixKey ?? "");
      setAvatar(a.avatar ?? null);
    }).catch(() => {});
    api.races().then((r) => setRaces(r.races)).catch(() => {});
  }, []);

  async function pickRace(key: string) {
    if (key === view.race.key) return;
    const name = races.find((r) => r.key === key)?.name ?? key;
    if (!window.confirm(`Trocar para ${name}? Seu planeta RECOMEÇA do zero (naves, tecnologias, roids e agentes são zerados) com a nova raça.`)) return;
    setRaceMsg(""); setRaceErr(""); setRaceBusy(true);
    try {
      await api.changeRace(key);
      setRaceMsg(`Raça alterada para ${name}! Planeta recomeçado.`);
      onChanged();
    } catch (e: any) { setRaceErr(e.message ?? "Falha ao trocar de raça"); }
    finally { setRaceBusy(false); }
  }

  async function changePassword() {
    setPwMsg(""); setPwErr("");
    if (nw.length < 6) { setPwErr("A nova senha precisa de pelo menos 6 caracteres."); return; }
    if (nw !== confirm) { setPwErr("A confirmação não bate com a nova senha."); return; }
    try {
      await api.changePassword(cur, nw);
      setPwMsg("Senha alterada com sucesso!");
      setCur(""); setNw(""); setConfirm("");
    } catch (e: any) { setPwErr(e.message ?? "Falha ao alterar a senha"); }
  }

  async function changeEmail() {
    setEmailMsg(""); setEmailErr("");
    try {
      const r = await api.changeEmail(emailPw, email);
      setEmail(r.email); setEmailPw("");
      setEmailMsg("E-mail atualizado!");
    } catch (e: any) { setEmailErr(e.message ?? "Falha ao trocar e-mail"); }
  }

  async function saveProfile() {
    setProfMsg(""); setProfErr("");
    try {
      const r = await api.updateProfile({ whatsapp, pixKey, avatar: avatar ?? "" });
      setWhatsapp(r.whatsapp ?? ""); setPixKey(r.pixKey ?? ""); setAvatar(r.avatar ?? null);
      setProfMsg("Dados salvos!");
      onChanged(); // atualiza o avatar no cabeçalho
    } catch (e: any) { setProfErr(e.message ?? "Falha ao salvar"); }
  }

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfErr("");
    try {
      const dataUrl = await fileToAvatar(file);
      if (dataUrl.length > 80000) { setProfErr("Imagem ainda muito grande — escolha uma menor."); return; }
      setAvatar(dataUrl);
    } catch (err: any) { setProfErr(err.message ?? "Falha ao processar imagem"); }
    finally { e.target.value = ""; }
  }

  async function doAutoExile() {
    if (!window.confirm(`Auto-exílio: seu planeta vai cair numa galáxia aleatória (não-privada). Restam ${view.planet.autoExiles}. Confirmar?`)) return;
    setError("");
    try { await api.autoExile(); onChanged(); }
    catch (e: any) { setError(e.message ?? "Falha"); }
  }

  const inp = { margin: 0, padding: "6px 10px" } as const;

  return (
    <>
      {/* ===== Raça do round (trocável só na proteção de novato) ===== */}
      <div className="panel">
        <h2>🧬 Raça</h2>
        <div className="cost" style={{ marginBottom: 8 }}>
          Sua raça atual é <b>{view.race.name}</b>.{" "}
          {canChangeRace
            ? <>Você está sob <b>proteção de novato</b> ({view.planet.protection.ticksLeft} ticks restantes) — dá pra trocar de raça. Trocar <b>recomeça seu planeta do zero</b>.</>
            : <>A troca de raça só é liberada durante a <b>proteção de novato</b> (início do round).</>}
        </div>
        {canChangeRace && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {races.map((r) => (
              <button
                key={r.key}
                disabled={raceBusy || r.key === view.race.key}
                onClick={() => pickRace(r.key)}
                title={r.tagline}
                className={r.key === view.race.key ? "section-active" : ""}
              >
                {r.key === view.race.key ? "✓ " : ""}{r.name}
              </button>
            ))}
          </div>
        )}
        {raceMsg && <div className="cost" style={{ marginTop: 10, color: "var(--carbonum)" }}>{raceMsg}</div>}
        {raceErr && <div className="error" style={{ marginTop: 10 }}>{raceErr}</div>}
      </div>

      {/* ===== Perfil: avatar + contato ===== */}
      <div className="panel">
        <h2>👤 Meu perfil</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 96, height: 96, borderRadius: "50%", overflow: "hidden", border: "1px solid var(--border)", background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {avatar ? <img src={avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 40 }}>🪐</span>}
            </div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="link" style={{ cursor: "pointer" }}>
                trocar foto
                <input type="file" accept="image/*" onChange={pickAvatar} style={{ display: "none" }} />
              </label>
              {avatar && <button type="button" className="link" onClick={() => setAvatar(null)}>remover</button>}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="cost" style={{ marginBottom: 2 }}>
              <b>Contato para premiação</b> (privado — usado só se você ficar no top-3 do round).
            </div>
            <input placeholder="WhatsApp (ex: 19 99999-9999)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={inp} />
            <input placeholder="Chave PIX (premiação)" value={pixKey} onChange={(e) => setPixKey(e.target.value)} style={inp} />
            <button onClick={saveProfile} style={{ alignSelf: "flex-start" }}>Salvar perfil</button>
            {profMsg && <div className="cost" style={{ color: "var(--carbonum)" }}>{profMsg}</div>}
            {profErr && <div className="error">{profErr}</div>}
          </div>
        </div>
      </div>

      {/* ===== E-mail ===== */}
      <div className="panel">
        <h2>✉️ E-mail</h2>
        <div className="cost" style={{ marginBottom: 8 }}>Usado para recuperar a senha. Confirme com a senha atual para trocar.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
          <input type="email" placeholder="seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} style={inp} />
          <input type="password" placeholder="senha atual (confirmar)" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} style={inp} />
          <button disabled={!email || !emailPw} onClick={changeEmail} style={{ alignSelf: "flex-start" }}>Salvar e-mail</button>
        </div>
        {emailMsg && <div className="cost" style={{ marginTop: 10, color: "var(--carbonum)" }}>{emailMsg}</div>}
        {emailErr && <div className="error" style={{ marginTop: 10 }}>{emailErr}</div>}
      </div>

      {/* ===== Senha ===== */}
      <div className="panel">
        <h2>🔑 Alterar senha</h2>
        <div className="cost" style={{ marginBottom: 8 }}>Troque sua senha de acesso ao jogo.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
          <input type="password" placeholder="senha atual" value={cur} onChange={(e) => setCur(e.target.value)} style={inp} />
          <input type="password" placeholder="nova senha (mín. 6)" value={nw} onChange={(e) => setNw(e.target.value)} style={inp} />
          <input type="password" placeholder="confirmar nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inp} />
          <button disabled={!cur || !nw || !confirm} onClick={changePassword} style={{ alignSelf: "flex-start" }}>Alterar senha</button>
        </div>
        {pwMsg && <div className="cost" style={{ marginTop: 10, color: "var(--carbonum)" }}>{pwMsg}</div>}
        {pwErr && <div className="error" style={{ marginTop: 10 }}>{pwErr}</div>}
      </div>

      {/* ===== Auto-exílio ===== */}
      <div className="panel">
        <h2>🪂 Auto-exílio</h2>
        <div className="cost">
          Faz o seu planeta cair numa <b>galáxia aleatória</b> (não-privada). Útil pra fugir de uma vizinhança ruim. Você perde os cargos de governo da galáxia atual.
        </div>
        <div className="roid-row">
          <div className="roid-label"><div>
            <div><b>Exilar planeta</b></div>
            <div className="roid-count">restam {view.planet.autoExiles} de 3 auto-exílios</div>
          </div></div>
          <button disabled={view.planet.autoExiles <= 0} onClick={doAutoExile}>
            {view.planet.autoExiles > 0 ? "🪂 auto-exílio" : "sem exílios"}
          </button>
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </div>
    </>
  );
}
