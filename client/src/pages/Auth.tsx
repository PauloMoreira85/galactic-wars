import { useEffect, useState } from "react";
import { api, setToken, IS_RUR, MAIN_URL, RUR_URL, type RaceInfo, type HallRound } from "../api";

export function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [planetName, setPlanetName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [preposition, setPreposition] = useState("de");
  const [password, setPassword] = useState("");
  const [races, setRaces] = useState<RaceInfo[]>([]);
  const [race, setRace] = useState<string>("");
  const [hall, setHall] = useState<HallRound[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [meta, setMeta] = useState<{ tickIntervalSeconds: number; roundDurationMinutes: number; startTimes: string[] } | null>(null);

  async function doForgot() {
    setForgotMsg(""); setError("");
    try {
      await api.forgotPassword(login);
      setForgotMsg("Se a conta existir, enviamos um link de recuperação pro e-mail cadastrado.");
    } catch (e: any) { setError(e.message ?? "Falha"); }
  }

  useEffect(() => {
    api.races().then((r) => {
      setRaces(r.races);
      setRace((prev) => prev || r.races[0]?.key || "");
    }).catch(() => {});
    api.hall().then((h) => setHall(h.rounds)).catch(() => {});
    api.meta().then(setMeta).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login({ login, password })
          : await api.register({ email, username, password, planetName, preposition, race, whatsapp });
      setToken(res.token);
      onAuthed();
    } catch (err: any) {
      setError(err.message ?? "Falha");
    } finally {
      setBusy(false);
    }
  }

  const wide = mode === "register";

  return (
    <div className="landing">
      <div className="landing-hero">
        {/* Vídeo da logo (se existir wild-screen.mp4); senão mostra a imagem (poster). */}
        <video className="landing-hero-media" autoPlay loop muted playsInline poster="/art/logo/logo.jpg">
          <source src="/art/logo/logo.mp4" type="video/mp4" />
        </video>
        <div className="landing-tagline">
          {IS_RUR ? "RUR — Round Ultra-Rápido. A galáxia em 100 minutos." : "Conquiste os roids. Domine a galáxia."}
        </div>
      </div>

      {/* Banner do modo: explica o RUR (quando está no RUR) ou divulga o RUR (no principal). */}
      {IS_RUR ? (
        <div className="panel" style={{ maxWidth: 760, margin: "12px auto 0", borderColor: "var(--accent)" }}>
          <h2 style={{ marginTop: 0 }}>⚡ Round Ultra-Rápido (RUR)</h2>
          <div className="cost" style={{ lineHeight: 1.7 }}>
            Esta é a versão <b>turbo</b> do Galactic Wars — universo e contas <b>próprios</b> (separados do jogo principal):
            <ul style={{ margin: "8px 0 8px 18px", padding: 0 }}>
              <li><b>Ticks de {meta?.tickIntervalSeconds ?? 5} segundos</b> — produção, frotas e combate acontecem o tempo todo.</li>
              <li>Round inteiro em <b>~{meta?.roundDurationMinutes ?? 100} minutos</b> ({meta ? meta.startTimes.length : 3}x por dia).</li>
              <li>Começa às <b>{meta ? meta.startTimes.join(" · ") : "12:00 · 18:00 · 22:00"}</b> (horário de Brasília).</li>
              <li>A cada round você <b>escolhe a raça</b> e recomeça do zero — partida rápida e intensa.</li>
            </ul>
            Dá tempo de uma campanha inteira no almoço ou à noite. 🚀
          </div>
          <a className="link" href={MAIN_URL}>🌍 Prefere o jogo clássico? Ir pro Galactic Wars principal →</a>
        </div>
      ) : (
        <div className="panel" style={{ maxWidth: 760, margin: "12px auto 0", borderColor: "var(--accent)" }}>
          <div className="cost" style={{ lineHeight: 1.6 }}>
            ⚡ <b>Novidade: RUR — Round Ultra-Rápido!</b> Ticks de <b>5 segundos</b>, round inteiro em <b>~100 min</b>,
            3 partidas por dia (<b>12:00 · 18:00 · 22:00</b>). Universo próprio, ação na hora.{" "}
            <a className="link" href={RUR_URL}>Jogar o RUR →</a>
          </div>
        </div>
      )}

      <div className={`panel ${wide ? "auth-wide" : "auth-wrap"}`} style={wide ? { maxWidth: 760, margin: "4vh auto 0" } : undefined}>
        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Entrar
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Criar conta
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === "login" ? (
            <input
              placeholder="Email ou usuário"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoFocus
            />
          ) : (
            <>
              <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              <input placeholder="WhatsApp (opcional — p/ premiação)" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input placeholder="Nome do líder" value={username} onChange={(e) => setUsername(e.target.value)} style={{ flex: 1, minWidth: 140, margin: 0 }} />
                <select value={preposition} onChange={(e) => setPreposition(e.target.value)}
                  style={{ background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px" }}>
                  <option value="de">de</option>
                  <option value="da">da</option>
                  <option value="do">do</option>
                </select>
                <input placeholder="Nome do planeta" value={planetName} onChange={(e) => setPlanetName(e.target.value)} style={{ flex: 1, minWidth: 140, margin: 0 }} />
              </div>
              <div className="sub" style={{ margin: "2px 0 6px" }}>
                Como vai aparecer: <b style={{ color: "var(--accent)" }}>{(username || "Líder")} {preposition} {(planetName || "Planeta")}</b>
              </div>

              <div className="race-pick-label">Escolha sua raça (permanente)</div>
              <div className="race-grid">
                {races.map((r) => (
                  <button
                    type="button"
                    key={r.key}
                    className={`race-card ${race === r.key ? "selected" : ""}`}
                    onClick={() => setRace(r.key)}
                  >
                    <div className="race-name">{r.name}</div>
                    <div className="race-tagline">{r.tagline}</div>
                    <div className="race-lore">{r.lore}</div>
                  </button>
                ))}
              </div>
            </>
          )}
          <input
            placeholder="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="error">{error}</div>
          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "..." : mode === "login" ? "Entrar no comando" : "Fundar planeta"}
          </button>
          {mode === "login" && (
            <div style={{ marginTop: 8, textAlign: "center" }}>
              {!forgot ? (
                <button type="button" className="link" onClick={() => { setForgot(true); setForgotMsg(""); }}>Esqueci a senha</button>
              ) : (
                <div className="roid-count">
                  Digite seu <b>e-mail ou usuário</b> no campo "Usuário" acima e clique:
                  <div style={{ marginTop: 6 }}>
                    <button type="button" disabled={!login.trim()} onClick={doForgot}>enviar link de recuperação</button>{" "}
                    <button type="button" className="link" onClick={() => setForgot(false)}>cancelar</button>
                  </div>
                  {forgotMsg && <div style={{ marginTop: 6, color: "var(--carbonum)" }}>{forgotMsg}</div>}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Showcase das raças */}
      <div className="landing-races">
        <h2 className="landing-h2">As 5 Raças do Universo</h2>
        {races.map((r, i) => (
          <div className={`race-show ${i % 2 ? "flip" : ""}`} key={r.key}>
            {r.charImg && (
              <div className="race-show-char">
                {/* Vídeo do personagem (<key>.mp4) com a imagem como poster/fallback. */}
                <video autoPlay loop muted playsInline poster={r.charImg}>
                  <source src={r.charImg.replace(/\.jpg$/, ".mp4")} type="video/mp4" />
                </video>
              </div>
            )}
            <div className="race-show-info">
              <h3>{r.name}</h3>
              <div className="race-show-tag">{r.tagline}</div>
              <p className="race-show-lore">{r.lore}</p>
              <div className="race-show-cols">
                <div>
                  <div className="rs-label good">✓ Forças</div>
                  {(r.strengths ?? []).map((s, k) => <div key={k} className="rs-item">{s}</div>)}
                </div>
                <div>
                  <div className="rs-label bad">✗ Fraquezas</div>
                  {(r.weaknesses ?? []).map((s, k) => <div key={k} className="rs-item">{s}</div>)}
                </div>
              </div>
              {r.ships && r.ships.length > 0 && (
                <div className="race-show-ships">
                  <span className="rs-label">Naves:</span>{" "}
                  {r.ships.map((s) => s.name + (s.roider ? " ⛏️" : "")).join(" · ")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Hall da Fama: campeões dos rounds anteriores (some se ainda não houve round). */}
      {hall.length > 0 && (
        <div className="landing-hall">
          <h2 className="landing-h2">🏆 Hall da Fama</h2>
          <div className="hall-rounds">
            {hall.map((r) => (
              <div className="hall-round" key={r.round}>
                <div className="hall-round-title">Round #{r.round}</div>
                {r.top.map((c) => (
                  <div className={`hall-row pos-${c.position}`} key={c.position}>
                    <span className="hall-medal">{c.position === 1 ? "🥇" : c.position === 2 ? "🥈" : "🥉"}</span>
                    <span className="hall-name">{c.commander}</span>
                    <span className="hall-roids">{c.roids.toLocaleString("pt-BR")} roids</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Espaço de patrocínio (vendável). */}
      <div className="landing-sponsors">
        <div className="sponsor-label">Patrocínio</div>
        <a className="sponsor-slot" href="mailto:contato@galacticwar.com.br?subject=Patroc%C3%ADnio%20Galactic%20Wars">
          📣 Seu anúncio aqui — fale com a gente: contato@galacticwar.com.br
        </a>
      </div>

      <div className="landing-foot">Galactic Wars · {new Date().getFullYear()}</div>
    </div>
  );
}
