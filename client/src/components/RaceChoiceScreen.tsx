import { useEffect, useState } from "react";
import { api, clearToken, type PlanetView, type RaceInfo } from "../api";

// Tela OBRIGATÓRIA de escolha de raça no início de cada round (ciclo diário).
// Bloqueia o jogo até o player escolher. Pode escolher a mesma raça de novo.
export function RaceChoiceScreen({ view, onChosen, onLogout }: {
  view: PlanetView;
  onChosen: () => void;
  onLogout: () => void;
}) {
  const [races, setRaces] = useState<RaceInfo[]>([]);
  const [sel, setSel] = useState<string>(view.race.key);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.races().then((r) => setRaces(r.races)).catch(() => {});
  }, []);

  async function confirm() {
    setErr(""); setBusy(true);
    try {
      await api.changeRace(sel);
      onChosen(); // recarrega a view → mustChooseRace vira false → entra no jogo
    } catch (e: any) { setErr(e.message ?? "Falha ao escolher a raça"); }
    finally { setBusy(false); }
  }

  const selName = races.find((r) => r.key === sel)?.name ?? sel;

  return (
    <div className="app" style={{ display: "block", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>🧬 Novo round — escolha sua raça</h2>
        <div className="cost" style={{ marginBottom: 14 }}>
          Começou um novo round! Escolha a raça que vai comandar hoje. Pode ser a mesma do round anterior.
          Seu planeta começa do zero com a raça escolhida. <b>Você não joga até escolher.</b>
        </div>
        <div className="race-grid">
          {races.map((r) => (
            <button
              type="button"
              key={r.key}
              className={`race-card ${sel === r.key ? "selected" : ""}`}
              onClick={() => setSel(r.key)}
            >
              <div className="race-name">{r.name}</div>
              <div className="race-tagline">{r.tagline}</div>
              <div className="race-lore">{r.lore}</div>
              {(r.strengths?.length || r.weaknesses?.length) ? (
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                  {(r.strengths ?? []).map((s, k) => <div key={`s${k}`} style={{ color: "var(--carbonum)" }}>+ {s}</div>)}
                  {(r.weaknesses ?? []).map((s, k) => <div key={`w${k}`} style={{ color: "var(--plutonium)" }}>− {s}</div>)}
                </div>
              ) : null}
            </button>
          ))}
        </div>
        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}
        <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <button disabled={busy || !sel} onClick={confirm} style={{ fontSize: 16, padding: "10px 22px" }}>
            {busy ? "Confirmando…" : `🚀 Comandar ${selName}`}
          </button>
          <button type="button" className="link" onClick={() => { clearToken(); onLogout(); }}>sair</button>
        </div>
      </div>
    </div>
  );
}
