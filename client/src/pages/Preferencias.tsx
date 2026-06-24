import { useState } from "react";
import { api, type PlanetView } from "../api";

// Preferências do planeta. Por enquanto: auto-exílio (mudança de galáxia).
export function Preferencias({ view, onChanged }: { view: PlanetView; onChanged: () => void }) {
  const [error, setError] = useState("");

  async function doAutoExile() {
    if (!window.confirm(`Auto-exílio: seu planeta vai cair numa galáxia aleatória (não-privada). Restam ${view.planet.autoExiles}. Confirmar?`)) return;
    setError("");
    try { await api.autoExile(); onChanged(); }
    catch (e: any) { setError(e.message ?? "Falha"); }
  }

  return (
    <>
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
