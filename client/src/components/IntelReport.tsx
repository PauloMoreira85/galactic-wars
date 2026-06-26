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
      {intel.fleets && (
        <table>
          <thead><tr><th>Missão</th><th>Estado</th><th>Destino</th><th>Chega</th><th>Naves</th></tr></thead>
          <tbody>
            {intel.fleets.length === 0
              ? <tr><td colSpan={5} className="roid-count">nenhuma frota em movimento</td></tr>
              : intel.fleets.map((f: any, i: number) => (
                <tr key={i}>
                  <td>{f.mission}</td><td>{f.status}</td><td>{f.target}</td><td>{f.ticksRemaining}t</td>
                  <td className="roid-count">{Object.entries(f.units).map(([n, c]) => `${n}:${c}`).join(", ")}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </>
  );
}
