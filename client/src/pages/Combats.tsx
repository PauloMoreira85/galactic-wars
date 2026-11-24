import { useEffect, useState } from "react";
import { api, REFRESH_MS } from "../api";
import { CoordLink } from "../components/CoordLink";
import { ShipName } from "../components/ShipIcon";
import { CombatChart } from "../components/CombatChart";
import { CombatStats } from "../components/CombatStats";
import { pickCombatVideo } from "../components/combatVideo";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export function Combats() {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.combats>>["combats"]>([]);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.combat>> | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setList((await api.combats()).combats);
    } catch {}
  }
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  async function open(id: string) {
    setLoading(true);
    try {
      setDetail(await api.combat(id));
    } catch {} finally {
      setLoading(false);
    }
  }

  if (detail) {
    const d = detail.detail;

    // Registro de DEFESA (frota guarneceu, sem combate): mostra as naves que defenderam.
    if (d.defense) {
      const ships = d.attacker ?? []; // defRows = naves da frota que defendeu
      const iAmSender = detail.iAmAttacker; // "atacante" aqui = quem mandou a defesa
      return (
        <>
          <button className="link" onClick={() => setDetail(null)}>← voltar aos combates</button>
          <div className="panel" style={{ marginTop: 10 }}>
            <h2>🛡️ Relatório de Defesa</h2>
            <div className="cost">
              No tick <b>#{detail.tick}</b>, a frota de <b>{detail.attackerName}</b> (<CoordLink c={detail.attackerCoords} />) estava guarnecendo o planeta <b>{detail.defenderName}</b> (<CoordLink c={detail.defenderCoords} />). Sem ataque neste tick.
              {iAmSender ? " Você mandou essa defesa." : " Você foi defendido."}
              <div style={{ marginTop: 4, opacity: 0.7 }}>A defesa gera um registro por tick (igual ao ataque) — veja os outros ticks na lista de combates.</div>
            </div>
          </div>
          <div className="panel">
            <h2>Naves em defesa ({ships.reduce((s, x) => s + x.survivors, 0).toLocaleString("pt-BR")})</h2>
            {ships.length === 0 ? <div className="roid-count">Sem naves registradas.</div> : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Nave</th><th>Quantidade</th></tr></thead>
                  <tbody>
                    {ships.map((r) => <tr key={r.name}><td className="fg-name"><ShipName name={r.name} /></td><td>{fmt(r.survivors || r.before)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      );
    }

    const cap = d.captured ?? { metalium: 0, carbonum: 0, plutonium: 0 };
    const iAmAtk = detail.iAmAttacker;
    type Row = { name: string; before: number; lost: number; pem: number; assim: number; survivors: number };
    const defMap = new Map<string, Row>(d.defender.map((r) => [r.name, r]));
    const atkMap = new Map<string, Row>(d.attacker.map((r) => [r.name, r]));
    const names = Array.from(new Set([...d.defender.map((r) => r.name), ...d.attacker.map((r) => r.name)]));
    const cell = (r?: Row) => r
      ? <><td>{fmt(r.before)}</td><td style={{ color: r.lost > 0 ? "var(--danger)" : undefined }}>{fmt(r.lost)}{r.assim > 0 && <span title="dessas perdas, quantas foram assimiladas pelo inimigo" style={{ color: "var(--accent)" }}> ({fmt(r.assim)})</span>}</td><td style={{ color: r.pem > 0 ? "var(--plutonium)" : undefined }}>{r.pem ? fmt(r.pem) : "—"}</td></>
      : <><td className="fg-zero">·</td><td className="fg-zero">·</td><td className="fg-zero">·</td></>;
    // No ally-defense você é DEFENSOR (mesmo com iAmAtk=true no registro).
    const youIsDefender = d.allyDefense ? true : !iAmAtk;
    const youDef = youIsDefender ? { background: "rgba(37,211,255,0.06)" } : undefined;
    const youAtk = !youIsDefender ? { background: "rgba(37,211,255,0.06)" } : undefined;

    // Vídeo cinematográfico do combate (mostra a raça vencedora em ação).
    // No ally-defense você é DEFENSOR (iAmAtk vem true no registro, mas é falso aqui).
    const iAmAtkReal = d.allyDefense ? false : iAmAtk;
    const atkLostTot = d.attacker.reduce((s, r) => s + r.lost + r.pem, 0);
    const defLostTot = d.defender.reduce((s, r) => s + r.lost + r.pem, 0);
    const myLostTot = iAmAtkReal ? atkLostTot : defLostTot;
    const oppLostTot = iAmAtkReal ? defLostTot : atkLostTot;
    const videoSrc = pickCombatVideo(iAmAtkReal, d.attackerRace, d.defenderRace, myLostTot, oppLostTot);

    return (
      <>
        <button className="link" onClick={() => setDetail(null)}>← voltar aos combates</button>
        {videoSrc && (
          <div className="panel" style={{ marginTop: 10, padding: 0, overflow: "hidden" }}>
            <video src={videoSrc} autoPlay loop muted playsInline
              style={{ width: "100%", display: "block", borderRadius: 12 }}
              onError={(e) => { (e.currentTarget.closest(".panel") as HTMLElement)?.style.setProperty("display", "none"); }} />
          </div>
        )}
        <div className="panel" style={{ marginTop: 10 }}>
          <h2>{d.allyDefense ? "🛡️ Relatório de Defesa (combate)" : "Relatório de Combate"}</h2>
          {d.allyDefense && (
            <div className="cost" style={{ color: "var(--carbonum)" }}>
              O planeta atacado foi o seu aliado <b>{d.defendedName}</b> (<CoordLink c={d.defendedCoords ?? ""} />). <b>Você</b> (<b>{detail.defenderName}</b> <CoordLink c={detail.defenderCoords} />) enviou defesa e participou do combate — suas naves e as do aliado estão juntas no lado <b>defensor</b> abaixo.
            </div>
          )}
          <div className="cost">
            Combate ocorrido no tick <b>#{detail.tick}</b> ({d.ticks ?? 3} ticks), em órbita do planeta atacado <b>{d.allyDefense ? d.defendedName : detail.defenderName}</b> (<CoordLink c={d.allyDefense ? (d.defendedCoords ?? "") : detail.defenderCoords} />).
          </div>
          {/* No ally-defense o registro guarda attackerName = planeta DEFENDIDO (não o
              atacante real), e iAmAttacker vem true porque você é o attackerPlanetId.
              Então exibimos os papéis certos: você/aliado = defensor; atacante real
              vem de d.attackers. Fora do ally-defense, usa os campos normais. */}
          {d.allyDefense ? (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 8 }}>
              <div><div className="roid-count">Atacante</div><b style={{ color: "var(--danger)" }}>{d.attackers?.[0]?.name ?? "inimigo"}</b> <span className="roid-count">{d.attackers?.[0]?.coords ? <>(<CoordLink c={d.attackers[0].coords} />) </> : ""}· {d.attackerRace}</span></div>
              <div><div className="roid-count">Planeta atacado (aliado)</div><b style={{ color: "var(--carbonum)" }}>{d.defendedName}</b> <span className="roid-count">(<CoordLink c={d.defendedCoords ?? ""} />) · {d.defenderRace}</span></div>
              <div><div className="roid-count">Você (defensor)</div><b style={{ color: "var(--accent)" }}>{detail.defenderName}</b> <span className="roid-count">(<CoordLink c={detail.defenderCoords} />)</span></div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 8 }}>
              <div><div className="roid-count">Atacante {iAmAtk && "(você)"}</div><b style={{ color: "var(--danger)" }}>{detail.attackerName}</b> <span className="roid-count">(<CoordLink c={detail.attackerCoords} />) · {d.attackerRace}</span></div>
              <div><div className="roid-count">Defensor {!iAmAtk && "(você)"}</div><b style={{ color: "var(--carbonum)" }}>{detail.defenderName}</b> <span className="roid-count">(<CoordLink c={detail.defenderCoords} />) · {d.defenderRace}</span></div>
            </div>
          )}
          {((d.attackers?.length ?? 0) > 1 || (d.defenders?.length ?? 0) > 1) && (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div>
                <div className="roid-count">⚔️ Atacantes ({d.attackers!.length})</div>
                {d.attackers!.map((a, i) => <div key={i}><b style={{ color: "var(--danger)" }}>{a.name}</b>{a.coords ? <span className="roid-count"> (<CoordLink c={a.coords} />)</span> : null} <span className="roid-count">{fmt(a.ships)} naves</span></div>)}
              </div>
              <div>
                <div className="roid-count">🛡️ Defensores ({d.defenders!.length})</div>
                {d.defenders!.map((x, i) => {
                  // No ally-defense o backend marca `you` no planeta defendido (errado p/ quem
                  // mandou reforço). "Você" é sempre o dono do relatório = detail.defenderName.
                  const isYou = d.allyDefense ? x.name === detail.defenderName : x.you;
                  return <div key={i}><b style={{ color: isYou ? "var(--accent)" : "var(--carbonum)" }}>{x.name}</b>{x.coords ? <span className="roid-count"> (<CoordLink c={x.coords} />)</span> : null} <span className="roid-count">{isYou ? "(você) " : "· aliado "}{fmt(x.ships)} naves</span></div>;
                })}
              </div>
            </div>
          )}
          {/* Naves que sobraram SEM ATIRAR (não acharam alvo) — por lado. */}
          {((d.aUnused?.length ?? 0) > 0 || (d.dUnused?.length ?? 0) > 0) && (
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              {(d.aUnused?.length ?? 0) > 0 && (
                <div>
                  <div className="roid-count" title="naves vivas que não acharam alvo pra atirar (ex.: excedente de roiders)">🚫 Atacante — sobraram sem atirar</div>
                  <div className="roid-count" style={{ color: "var(--text)" }}>{d.aUnused!.map((u) => `${u.name} ×${fmt(u.count)}`).join(" · ")}</div>
                </div>
              )}
              {(d.dUnused?.length ?? 0) > 0 && (
                <div>
                  <div className="roid-count">🚫 Defesa — sobraram sem atirar</div>
                  <div className="roid-count" style={{ color: "var(--text)" }}>{d.dUnused!.map((u) => `${u.name} ×${fmt(u.count)}`).join(" · ")}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="panel">
          <div style={{ overflowX: "auto" }}>
            <table className="fleet-grid">
              <thead>
                <tr>
                  <th rowSpan={2}>Nave</th>
                  <th colSpan={3} style={youDef}>🛡️ Defendendo{d.allyDefense ? " (você + aliados)" : ""}</th>
                  <th colSpan={3} style={youAtk}>⚔️ Atacando</th>
                </tr>
                <tr>
                  <th style={youDef}>Total</th><th style={youDef}>Perdidas</th><th style={youDef}>PEM</th>
                  <th style={youAtk}>Total</th><th style={youAtk}>Perdidas</th><th style={youAtk}>PEM</th>
                </tr>
              </thead>
              <tbody>
                {names.map((n) => (
                  <tr key={n}>
                    <td className="fg-name"><ShipName name={n} /></td>
                    {cell(defMap.get(n))}
                    {cell(atkMap.get(n))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>Asteroides</h2>
          <table>
            <thead><tr><th>Recurso</th><th>Capturado pelo atacante</th></tr></thead>
            <tbody>
              <tr><td><span className="dot metalium" /> Metalium</td><td>{fmt(cap.metalium)}</td></tr>
              <tr><td><span className="dot carbonum" /> Carbonum</td><td>{fmt(cap.carbonum)}</td></tr>
              <tr><td><span className="dot plutonium" /> Plutonium</td><td>{fmt(cap.plutonium)}</td></tr>
            </tbody>
          </table>
          {!(cap.metalium || cap.carbonum || cap.plutonium) && <div className="roid-count" style={{ marginTop: 6 }}>Nenhum roid capturado neste combate.</div>}

          {d.raid && (
            <div style={{ marginTop: 10 }}>
              <div className="roid-count" style={{ marginBottom: 4 }}>
                Roiders ativos (não-paralisados) e capacidade de roubo:
              </div>
              {d.raid.rows.length > 0 ? (
                <table>
                  <thead><tr><th>Roider</th><th>Ativos</th><th>Roids/nave</th><th>Capacidade</th></tr></thead>
                  <tbody>
                    {d.raid.rows.map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td>{fmt(r.active)}</td>
                        <td>{r.cargo}</td>
                        <td>{fmt(r.capacity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="roid-count">Nenhum roider ativo neste tick (todos paralisados ou ausentes).</div>
              )}
              <div className="roid-count" style={{ marginTop: 6, lineHeight: 1.6 }}>
                Você captura o <b>MENOR</b> entre a capacidade dos seus roiders e o limite do tick:
                <div style={{ marginTop: 2 }}>
                  • Capacidade dos roiders: <b>{fmt(d.raid.capacity)}</b> roids
                </div>
                {d.raid.targetRoids != null && (
                  <div>• Limite do tick: <b>{d.raid.ratePct}%</b> dos roids do alvo = <b>{fmt(Math.floor(d.raid.targetRoids * d.raid.ratePct / 100))}</b> <span style={{ opacity: 0.7 }}>(alvo tem {fmt(d.raid.targetRoids)} roids; {d.raid.ratePct}% do total, por tick)</span></div>
                )}
                <div style={{ marginTop: 2 }}>→ <b style={{ color: "var(--carbonum)" }}>Capturado neste tick: {fmt(d.raid.captured)} roids</b></div>
                <div style={{ marginTop: 2, opacity: 0.7 }}>O combate dura até 3 ticks — você saqueia a cada tick, então o total do ataque é a soma dos ticks.</div>
              </div>
            </div>
          )}
        </div>

        {d.log && d.log.length > 0 && (
          <>
          <CombatStats log={d.log} />

          <div className="panel">
            <h2>Troca de tiros</h2>
            <div className="cost" style={{ marginBottom: 8 }}>Quem atirou em quem nesta rodada — a cor mostra o efeito e a grossura, quantas naves foram abatidas.</div>
            <CombatChart log={d.log} />
          </div>

          <div className="panel">
            <h2>Combate Completo</h2>
            <div className="cost" style={{ marginBottom: 8 }}>Última rodada, por ordem de iniciativa:</div>
            {Array.from(new Set(d.log.map((e) => e.ini))).sort((a, b) => a - b).map((ini) => (
              <div key={ini} style={{ marginBottom: 10 }}>
                <div className="combat-ini">Iniciativa {ini}</div>
                {d.log!.filter((e) => e.ini === ini).map((e, i) => {
                  const who = e.side === "a" ? "Atacante" : "Defensor";
                  const verbo = e.action === "pem" ? "paralisando" : e.action === "assim" ? "assimilando" : "destruindo";
                  const chanceLabel = e.action === "pem" ? "Chance de vencer a resistência ao PEM" : "Chance média de atingir";
                  const porNave = e.count > 0 ? (e.shots / e.count) : 0;
                  return (
                    <div key={i} className="combat-line">
                      <span style={{ color: e.side === "a" ? "var(--danger)" : "var(--carbonum)" }}>{who}:</span>{" "}
                      {fmt(e.count)} {e.ship} dispararam <b>{fmt(e.shots)}</b> tiro(s)
                      <span className="roid-count"> ({porNave.toFixed(1)}/nave)</span> em {e.target}, {verbo} <b>{fmt(e.amount)}</b> naves
                      {e.action === "assim" && (e.assimCost ?? 0) > 0 && <span style={{ color: "var(--danger)" }}> — ao custo de {fmt(e.assimCost!)} naves</span>}
                      <span className="roid-count"> · {chanceLabel}: {e.chance}%</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </>
        )}
      </>
    );
  }

  return (
    <div className="panel">
      <h2>Combates — relatórios de batalha</h2>
      {loading && <div className="roid-count">Carregando...</div>}
      {list.length === 0 ? (
        <div className="roid-count">Nenhum combate ainda. Envie uma frota de ataque a outra galáxia!</div>
      ) : (
        <>
        <div className="roid-count" style={{ marginBottom: 6, fontSize: 12 }}>👆 Toque numa linha pra abrir o relatório do combate.</div>
        <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>Tick</th><th>Papel</th><th>Oponente</th><th className="hide-sm">Coord.</th><th>Perdi</th><th className="hide-sm">Inimigo perdeu</th><th className="hide-sm">Captura (M/C/P)</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((c) => {
              return (
              <tr key={c.id} onClick={() => open(c.id)}
                  style={{ cursor: "pointer" }}
                  title="ver relatório">
                <td className="rank-num">#{c.tick}</td>
                <td>{
                  c.role === "attacker" ? "⚔️ ataque" :
                  c.role === "defender" ? "🛡️ defesa" :
                  c.role === "defense-sent" ? "🛡️ defendi" :
                  c.role === "defense-received" ? "🛡️ fui defendido" : "🛡️ defesa"
                }</td>
                <td>{c.opponent}</td>
                {/* stopPropagation: clicar na coord navega, não abre o relatório */}
                <td className="hide-sm" onClick={(e) => e.stopPropagation()}><CoordLink c={c.opponentCoords} /></td>
                <td style={{ color: c.myLost > 0 ? "var(--danger)" : undefined }}>{fmt(c.myLost)}</td>
                <td className="hide-sm" style={{ color: c.oppLost > 0 ? "var(--carbonum)" : undefined }}>{fmt(c.oppLost)}</td>
                <td className="hide-sm roid-count">{fmt(c.captured.metalium)}/{fmt(c.captured.carbonum)}/{fmt(c.captured.plutonium)}</td>
                <td><button onClick={(e) => { e.stopPropagation(); open(c.id); }}>ver</button></td>
              </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        </>
      )}
    </div>
  );
}
