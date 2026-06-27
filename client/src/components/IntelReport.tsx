// Renderiza um relatório de espionagem (intel) de forma legível — usado tanto na
// tela Inteligência (espionagem ao vivo) quanto em Ferramentas (Visualizar Espionagem).
function fmt(n: number) { return n.toLocaleString("pt-BR"); }

export function IntelReport({ intel }: { intel: any }) {
  if (!intel) return null;
  return (
    <>
      <div className="cost">
        Comandante: <b>{intel.commander}</b> · Raça: <b>{intel.race}</b>
        {intel.online != null && ` · ${intel.online ? "online" : "offline"}`}
      </div>
      {intel.score != null && <div className="roid-count">Pontuação: {fmt(intel.score)}</div>}
      {intel.resources && (
        <div className="roid-count">Recursos: {fmt(intel.resources.metalium)} Metalium · {fmt(intel.resources.carbonum)} Carbonum · {fmt(intel.resources.plutonium)} Plutonium</div>
      )}
      {intel.roids && (
        <div className="roid-count">Roids: {fmt(intel.roids.metalium)} M · {fmt(intel.roids.carbonum)} C · {fmt(intel.roids.plutonium)} P</div>
      )}
      {intel.totalShips != null && (
        <div className="roid-count">Total de naves: {fmt(intel.totalShips)} (use agente M p/ detalhar)</div>
      )}
      {intel.ships && (
        <table>
          <thead><tr><th>Nave</th><th>Qtd</th></tr></thead>
          <tbody>{intel.ships.map((x: any) => <tr key={x.name}><td>{x.name}</td><td>{fmt(x.count)}</td></tr>)}</tbody>
        </table>
      )}
      {intel.news && (
        <div>
          <div className="cost">Notícias do alvo:</div>
          {intel.news.length === 0
            ? <div className="roid-count">sem notícias</div>
            : intel.news.map((n: string, i: number) => <div key={i} className="roid-count">{n}</div>)}
        </div>
      )}
      {(intel.base || intel.fleets) && (() => {
        // Grade igual ao menu Frotas do alvo: naves nas linhas, Base + cada frota nas colunas.
        const cols: { key: string; label: string; units: Record<string, number>; info: any }[] = [
          { key: "base", label: "Base", units: intel.base ?? {}, info: null },
          ...((intel.fleets ?? []) as any[]).map((f, i) => ({ key: `f${i}`, label: f.name ?? `Frota ${i + 1}`, units: f.units ?? {}, info: f })),
        ];
        const ships = Array.from(new Set(cols.flatMap((c) => Object.keys(c.units)))).filter((n) => cols.some((c) => (c.units[n] ?? 0) > 0));
        if (ships.length === 0) return <div className="roid-count" style={{ marginTop: 6 }}>Nenhuma nave detectada no alvo.</div>;
        return (
          <div style={{ overflowX: "auto", marginTop: 6 }}>
            <table className="fleet-grid">
              <thead><tr><th>Nave</th>{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {ships.map((n) => (
                  <tr key={n}><td className="fg-name"><b>{n}</b></td>{cols.map((c) => <td key={c.key}>{(c.units[n] ?? 0) > 0 ? fmt(c.units[n]) : "·"}</td>)}</tr>
                ))}
                <tr><td className="roid-count">Estado</td>{cols.map((c) => <td key={c.key} className="roid-count">{c.info ? c.info.status : "na base"}</td>)}</tr>
                <tr><td className="roid-count">Destino</td>{cols.map((c) => <td key={c.key} className="roid-count">{c.info && c.info.target && c.info.target !== "—" ? `${c.info.target} (${c.info.ticksRemaining}t)` : "—"}</td>)}</tr>
              </tbody>
            </table>
          </div>
        );
      })()}
    </>
  );
}
