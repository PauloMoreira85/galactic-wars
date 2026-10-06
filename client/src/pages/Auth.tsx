import { useEffect, useState } from "react";
import { api, setToken, IS_RUR, MAIN_URL, RUR_URL, DISCORD_URL, type RaceInfo } from "../api";
import { AdBanner } from "../components/AdBanner";

// Vídeo que NÃO toca sozinho — mostra o poster (imagem leve) e só baixa/toca ao
// passar o mouse. Evita vários vídeos decodificando juntos e travando a landing.
function LazyVideo({ src, poster }: { src: string; poster: string }) {
  return (
    <video
      loop muted playsInline preload="none" poster={poster} src={src}
      onMouseEnter={(e) => { e.currentTarget.play?.().catch(() => {}); }}
      onMouseLeave={(e) => { e.currentTarget.pause?.(); }}
    />
  );
}

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
      // Meta Pixel: marca o cadastro concluído (só dispara se o Pixel estiver
      // configurado no index.html). É o evento de conversão que os ads otimizam.
      if (mode === "register") {
        try { (window as any).fbq?.("track", "CompleteRegistration"); } catch { /* pixel off */ }
      }
      setToken(res.token);
      onAuthed();
    } catch (err: any) {
      setError(err.message ?? "Falha");
    } finally {
      setBusy(false);
    }
  }

  const wide = mode === "register";

  // Regras atuais (derivadas do servidor) para a landing do jogo principal.
  const tickLabel = meta
    ? (meta.tickIntervalSeconds >= 60 ? `${Math.round(meta.tickIntervalSeconds / 60)} minuto${meta.tickIntervalSeconds >= 120 ? "s" : ""}` : `${meta.tickIntervalSeconds} segundos`)
    : "1 minuto";
  const roundTicks = meta ? Math.round((meta.roundDurationMinutes * 60) / meta.tickIntervalSeconds) : 1200;
  const roundHours = meta ? Math.round(meta.roundDurationMinutes / 60) : 20;
  const startList = meta ? meta.startTimes.join(" · ") : "08:00";

  return (
    <div className="landing">
      <div className="landing-hero">
        {/* Logo ESTÁTICA (imagem) — o vídeo autoplay de 8MB deixava a landing/cadastro
            travando (renderizador sem resposta). Fica leve e confiável. */}
        <img className="landing-hero-media" src="/art/logo/logo.jpg" alt="Galactic War" />
        <div className="landing-tagline">
          {/* O slogan "THE UNIVERSE AT WAR" já está desenhado na logo — no modo
              principal mostramos só o selo BETA. No RUR a logo não traz o texto
              do round rápido, então ali exibimos a frase do RUR. */}
          {IS_RUR && "RUR — Round Ultra-Rápido. O universo em 100 minutos. "}
          {!IS_RUR && <span style={{ padding: "2px 8px", borderRadius: 999, background: "#ffb020", color: "#1a1205", fontSize: "0.7em", fontWeight: 800, verticalAlign: "middle", letterSpacing: 1 }}>BETA</span>}
          {IS_RUR && <span style={{ marginLeft: 10, padding: "2px 8px", borderRadius: 999, background: "#ffb020", color: "#1a1205", fontSize: "0.6em", fontWeight: 800, verticalAlign: "middle", letterSpacing: 1 }}>BETA</span>}
        </div>
      </div>

      {/* Banner do modo: explica o RUR (quando está no RUR) ou divulga o RUR (no principal). */}
      {IS_RUR ? (
        <div className="panel" style={{ maxWidth: 760, margin: "12px auto 0", borderColor: "var(--accent)" }}>
          <h2 style={{ marginTop: 0 }}>⚡ Round Ultra-Rápido (RUR)</h2>
          <div className="cost" style={{ lineHeight: 1.7 }}>
            Esta é a versão <b>turbo</b> do Galactic War — universo e contas <b>próprios</b> (separados do jogo principal):
            <ul style={{ margin: "8px 0 8px 18px", padding: 0 }}>
              <li><b>Ticks de {meta?.tickIntervalSeconds ?? 5} segundos</b> — produção, frotas e combate acontecem o tempo todo.</li>
              <li>Round inteiro em <b>~{meta?.roundDurationMinutes ?? 100} minutos</b> ({meta ? meta.startTimes.length : 3}x por dia).</li>
              <li>Começa às <b>{meta ? meta.startTimes.join(" · ") : "12:00 · 18:00 · 22:00"}</b> (horário de Brasília).</li>
              <li>A cada round você <b>escolhe a raça</b> e recomeça do zero — partida rápida e intensa.</li>
            </ul>
            Dá tempo de uma campanha inteira no almoço ou à noite. 🚀
          </div>
          <a className="link" href={MAIN_URL} target="_blank" rel="noopener noreferrer">🌍 Prefere o jogo clássico? Abrir o Galactic War principal ↗</a>
        </div>
      ) : (
        <>
          <div className="panel" style={{ maxWidth: 760, margin: "12px auto 0", borderColor: "#ffb020", background: "rgba(255,176,32,0.06)" }}>
            <h2 style={{ marginTop: 0, color: "#ffb020" }}>🧪 BETA — em testes</h2>
            <div className="cost" style={{ lineHeight: 1.7 }}>
              O Galactic War está em <b>fase de testes</b>: estamos validando economia, combate, espionagem, sabotagem e tudo mais <b>antes de lançar o round oficial</b>. Crie sua conta, jogue à vontade e <b>mande seu feedback</b> — os rounds de teste podem ser <b>reiniciados a qualquer momento</b>.
              <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                <li><b>Tick de {tickLabel}</b> — produção, frotas e combate avançam a cada tick.</li>
                <li>Round de <b>{roundTicks} ticks</b> (~{roundHours}h), começando às <b>{startList}</b> (horário de Brasília).</li>
                <li>A cada round você <b>escolhe a raça</b> e recomeça do zero.</li>
              </ul>
            </div>
          </div>
          <div className="panel" style={{ maxWidth: 760, margin: "12px auto 0", borderColor: "var(--accent)" }}>
            <div className="cost" style={{ lineHeight: 1.6 }}>
              ⚡ <b>Quer testar algo mais rápido? RUR — Round Ultra-Rápido!</b> Ticks de <b>5 segundos</b>, round inteiro em <b>~100 min</b>,
              3 partidas por dia (<b>12:00 · 18:00 · 22:00</b>). Universo próprio, ação na hora.{" "}
              <a className="link" href={RUR_URL} target="_blank" rel="noopener noreferrer">Abrir o RUR ↗</a>
            </div>
          </div>
        </>
      )}

      {/* O QUE É + COMO JOGAR (só no modo principal) */}
      {!IS_RUR && (
        <div className="landing-howto">
          <div className="howto-intro panel">
            <h2 className="landing-h2" style={{ marginTop: 0 }}>O que é o Galactic War?</h2>
            <p>
              Um <b>jogo de estratégia espacial multiplayer</b> em tempo real. Você comanda um planeta,
              extrai recursos dos <b>roids</b> (asteroides), pesquisa tecnologias, constrói uma <b>frota de guerra</b> e
              parte pra cima dos outros comandantes: <b>ataca planetas inimigos, saqueia recursos e destrói frotas</b>.
            </p>
            <p style={{ marginBottom: 0 }}>
              A cada <b>tick</b> ({tickLabel}) o universo avança sozinho — sua produção, suas naves e os combates
              acontecem mesmo com você offline. Sua <b>galáxia</b> é o seu grupo de aliados; o resto do universo é território
              a conquistar. No fim do round, quem tiver mais poder fica no topo. <b>É de graça.</b>
            </p>
          </div>

          <h2 className="landing-h2">Como jogar — passo a passo</h2>
          <div className="howto-steps">
            <div className="howto-step">
              <div className="howto-num">1</div>
              <h3>Funde seu planeta</h3>
              <p>Crie sua conta grátis, dê nome ao líder e ao planeta e <b>escolha uma das 5 raças</b> — cada uma com naves e forças diferentes.</p>
            </div>
            <div className="howto-step">
              <div className="howto-num">2</div>
              <h3>Minere os roids</h3>
              <p>Roids geram <b>Metalium, Carbonum e Plutonium</b> a cada tick. Conquiste mais roids pra crescer sua economia — é o combustível de tudo.</p>
            </div>
            <div className="howto-step">
              <div className="howto-num">3</div>
              <h3>Pesquise tecnologia</h3>
              <p>Gaste recursos em <b>pesquisa</b> pra liberar naves melhores, mineração, deslocamento, espionagem e sabotagem.</p>
            </div>
            <div className="howto-step">
              <div className="howto-num">4</div>
              <h3>Construa sua frota</h3>
              <p>Monte <b>naves de ataque, defesa e mineração</b>. Cada raça tem naves únicas — combine-as pra formar um exército letal.</p>
            </div>
            <div className="howto-step">
              <div className="howto-num">5</div>
              <h3>Ataque e saqueie</h3>
              <p>Envie frotas pra <b>atacar outros planetas</b>, roubar recursos e roids e destruir a defesa inimiga. Espione e sabote antes de invadir.</p>
            </div>
            <div className="howto-step">
              <div className="howto-num">6</div>
              <h3>Una-se à sua galáxia</h3>
              <p>Os planetas da sua galáxia são seus <b>aliados</b>. Defendam-se juntos, elejam ministros e dominem o universo em equipe.</p>
            </div>
          </div>

          <div className="howto-cta">
            ⚔️ Pronto pra conquistar o universo? <b>Crie sua conta grátis abaixo.</b>
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
                {/* Vídeo do personagem — só baixa ao rolar até aqui (lazy). */}
                <LazyVideo src={r.charImg.replace(/\.jpg$/, ".mp4")} poster={r.charImg} />
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

      {/* Hall da Fama removido durante o BETA (estamos em testes). */}

      {/* Anunciantes (gerenciados no admin) — login mostra os de "landing", a aba
          Criar conta mostra os de "cadastro". Ou convite "seu anúncio aqui". */}
      <AdBanner variant="stack" placement={mode === "register" ? "cadastro" : "landing"} />

      {DISCORD_URL && (
        <div className="discord-cta">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="discord-btn">
            <span className="discord-ico">💬</span>
            <span>
              <b>Entre no Discord da comunidade</b>
              <small>Avisos de round, alianças, estratégia e feedback</small>
            </span>
          </a>
        </div>
      )}

      <div className="landing-foot">
        Galactic War · {new Date().getFullYear()}
        {DISCORD_URL && <> · <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="link">Discord</a></>}
      </div>
    </div>
  );
}
