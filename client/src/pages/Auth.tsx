import { useEffect, useState } from "react";
import { api, setToken, type RaceInfo } from "../api";

export function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [planetName, setPlanetName] = useState("");
  const [preposition, setPreposition] = useState("de");
  const [password, setPassword] = useState("");
  const [races, setRaces] = useState<RaceInfo[]>([]);
  const [race, setRace] = useState<string>("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.races().then((r) => {
      setRaces(r.races);
      setRace((prev) => prev || r.races[0]?.key || "");
    }).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login({ login, password })
          : await api.register({ email, username, password, planetName, preposition, race });
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
    <div className="app">
      <div className="brand" style={{ justifyContent: "center" }}>
        <span style={{ fontSize: 36 }}>🪐</span>
        <div>
          <h1>Galactic Wars</h1>
          <div className="sub">conquiste os roids. domine a galáxia.</div>
        </div>
      </div>

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
        </form>
      </div>
    </div>
  );
}
