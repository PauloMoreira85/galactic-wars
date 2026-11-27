import { useEffect, useState, Fragment } from "react";
import { api, REFRESH_MS, type PlanetView } from "../api";
import { ShipIcon } from "../components/ShipIcon";
import { CoordLink } from "../components/CoordLink";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

const STATUS_LABEL: Record<string, string> = {
  idle: "na base", outbound: "indo", engaged: "em combate", returning: "voltando", garrison: "defendendo",
  scheduled: "🕓 agendada",
};

// Gerenciamento de frotas (estilo "Frotas sob o seu comando"): Base + frotas
// persistentes nomeadas. Move naves entre a Base e cada frota idle.
export function Frotas({ view, onChanged }: { view: PlanetView; onChanged: () => void }) {
  const [fleets, setFleets] = useState<Awaited<ReturnType<typeof api.fleets>>["fleets"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Envio direto daqui: coordenadas + ação + ticks + frota.
  // Coordenadas como TEXTO: assim dá pra apagar o campo no celular (antes ficava
  // travado em "1" e digitar 2 virava "12:1:1"). São validadas no envio.
  const [dGalaxy, setDGalaxy] = useState(String(Number(view.planet.coords.split(":")[0]) || ""));
  const [dSystem, setDSystem] = useState("");
  const [dSlot, setDSlot] = useState("");
  const [dMission, setDMission] = useState<"attack" | "transport">("attack");
  const [dTicks, setDTicks] = useState(3);
  const [dFake, setDFake] = useState(false);
  const [dDelay, setDDelay] = useState(0); // envio agendado: parte em N ticks (0 = agora)
  const [dFleet, setDFleet] = useState("");
  // Transferência direta entre frotas (ou base): origem, destino e qtd por nave.
  const [tFrom, setTFrom] = useState("base");
  const [tTo, setTTo] = useState("");
  const [tUnits, setTUnits] = useState<Record<string, number>>({});

  async function doTransfer() {
    if (!tTo || tFrom === tTo) { setError("Escolha origem e destino diferentes."); return; }
    const units = Object.fromEntries(Object.entries(tUnits).filter(([, n]) => n > 0));
    if (Object.keys(units).length === 0) { setError("Informe quantas naves transferir."); return; }
    setBusy(true); setError("");
    try {
      await api.transferFleet(tFrom, tTo, units);
      setTUnits({});
      await load(); onChanged();
    } catch (e: any) { setError(e.message ?? "Falha ao transferir"); }
    finally { setBusy(false); }
  }
  // Quantas naves de `name` existem na origem escolhida (base ou frota).
  const availAt = (where: string, name: string) =>
    where === "base" ? baseOf(name) : (fleets.find((f) => f.id === where)?.units[name] ?? 0);

  async function dispatch() {
    if (!dFleet) { setError("Escolha uma frota carregada."); return; }
    const g = parseInt(dGalaxy, 10), s = parseInt(dSystem, 10), sl = parseInt(dSlot, 10);
    if (!(g >= 1) || !(s >= 1) || !(sl >= 1)) { setError("Digite a coordenada completa (setor:paralelo:slot)."); return; }
    setBusy(true); setError("");
    try {
      await api.dispatchFleet(dFleet, { galaxy: g, system: s, slot: sl, mission: dMission, ticks: dTicks, fake: dFake, launchDelay: dDelay });
      setDFleet("");
      await load(); onChanged();
    } catch (e: any) { setError(e.message ?? "Falha ao enviar"); }
    finally { setBusy(false); }
  }

  async function load() {
    try {
      const f = (await api.fleets()).fleets;
      setFleets(f);
    } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, REFRESH_MS); return () => clearInterval(t); }, []);

  async function act(fn: () => Promise<any>) {
    setBusy(true); setError("");
    try {
      const r = await fn(); if (r && r.planet) onChanged();
      setFleets((await api.fleets()).fleets);
    }
    catch (e: any) { setError(e.message ?? "Falha"); }
    finally { setBusy(false); }
  }

  // Move naves NA HORA (sem campo intermediário). dir "base" = frota→Base;
  // "frota" = Base→frota. Usa a API de transferência direta.
  async function quickMove(fleetId: string, dir: "base" | "frota", name: string, qty: number, toFleet?: string) {
    if (qty <= 0) return;
    setBusy(true); setError("");
    try {
      if (dir === "base") await api.transferFleet(fleetId, "base", { [name]: qty });
      else await api.transferFleet("base", toFleet!, { [name]: qty });
      const f = (await api.fleets()).fleets; setFleets(f);
      onChanged();
    } catch (e: any) { setError(e.message ?? "Falha ao mover"); }
    finally { setBusy(false); }
  }

  // Renomeia (batiza) uma frota. Nome livre, 1-24 chars (validado no server também).
  async function renameFleetPrompt(fleetId: string, atual: string) {
    const nome = window.prompt("Novo nome da frota:", atual);
    if (nome == null) return;
    const n = nome.trim();
    if (!n || n === atual) return;
    setBusy(true); setError("");
    try {
      await api.renameFleet(fleetId, n.slice(0, 24));
      setFleets((await api.fleets()).fleets);
    } catch (e: any) { setError(e.message ?? "Falha ao renomear"); }
    finally { setBusy(false); }
  }

  // Move TODAS as naves de uma vez entre Base e uma frota (atalho do cabeçalho).
  // dir "base" = frota inteira → Base; "frota" = tudo da Base → frota.
  async function quickMoveAll(fleetId: string, dir: "base" | "frota") {
    const f = fleets.find((x) => x.id === fleetId);
    if (!f) return;
    const units = dir === "base"
      ? { ...f.units } // tudo que está na frota → base
      : Object.fromEntries(view.units.filter((u) => u.count > 0).map((u) => [u.name, u.count])); // tudo da base → frota
    const payload = Object.fromEntries(Object.entries(units).filter(([, n]) => (n as number) > 0));
    if (Object.keys(payload).length === 0) return;
    setBusy(true); setError("");
    try {
      if (dir === "base") await api.transferFleet(fleetId, "base", payload);
      else await api.transferFleet("base", fleetId, payload);
      setFleets((await api.fleets()).fleets);
      onChanged();
    } catch (e: any) { setError(e.message ?? "Falha ao mover"); }
    finally { setBusy(false); }
  }

  // Naves a listar: as que existem na Base OU em qualquer frota — mas SEMPRE na mesma
  // ordem do Hangar (raça própria primeiro, depois por classe Caça>Corveta>...>Roider),
  // pra não bagunçar quando a nave sai da base pra uma frota (pedido do Jah e do áudio).
  const presentes = new Set<string>([
    ...view.units.filter((u) => u.count > 0).map((u) => u.name),
    ...fleets.flatMap((f) => Object.entries(f.units).filter(([, n]) => (n ?? 0) > 0).map(([nm]) => nm)),
  ]);
  const CLASS_ORDER: Record<string, number> = { Ca: 0, Co: 1, Fr: 2, De: 3, Cr: 4, Na: 5, Ro: 6 };
  const ownRace = view.race.name;
  const raceRank = (r: string) => (r === ownRace ? "" : r); // a própria raça primeiro
  const ordenadas = view.units
    .filter((u) => presentes.has(u.name))
    .slice()
    .sort((a, b) =>
      raceRank(a.race).localeCompare(raceRank(b.race), "pt-BR")
      || (CLASS_ORDER[a.classe] ?? 9) - (CLASS_ORDER[b.classe] ?? 9)
      || a.name.localeCompare(b.name, "pt-BR"))
    .map((u) => u.name);
  // Fallback: qualquer nave que esteja só numa frota e não apareça em view.units
  // (não deveria ocorrer) vai pro fim, pra não sumir da tela.
  const ordenadasSet = new Set(ordenadas);
  const shipNames = [...ordenadas, ...[...presentes].filter((n) => !ordenadasSet.has(n))];
  const baseOf = (name: string) => view.units.find((u) => u.name === name)?.count ?? 0;
  // Alvos de uma nave (texto curto) — pra não ter que consultar a tabela de unidades.
  const alvosOf = (name: string) => {
    const u = view.units.find((x) => x.name === name);
    if (!u) return "";
    return u.roider ? "rouba roids" : (u.alvos.join(", ") || "—");
  };
  // Classe (tamanho) da nave — ex.: "Caça", "Cruzador". Pedido do Reda: saber o tamanho.
  const classeOf = (name: string) => view.units.find((x) => x.name === name)?.classeLabel ?? "";
  // Raça da nave — pra agrupar com cabeçalho igual ao Hangar.
  const raceOf = (name: string) => view.units.find((x) => x.name === name)?.race ?? "";
  const totalCols = 2 + fleets.length; // Naves + Base + 1 por frota (colSpan do cabeçalho de raça)
  const nextCost = view.planet.nextFleetSlotCost;

  // === Prévia do envio (pedido do Felipe): quantos ticks a viagem leva (G/S/U) e
  // em qual tick o combate "bate", já considerando o delay do agendamento. ===
  const envioPreview = (() => {
    const g = parseInt(dGalaxy, 10), s = parseInt(dSystem, 10), sl = parseInt(dSlot, 10);
    if (!(g >= 1) || !(s >= 1) || !(sl >= 1)) return null;
    const sel = fleets.find((f) => f.id === dFleet);
    if (!sel) return null;
    const [og, os] = view.planet.coords.split(":").map(Number);
    // Classe de distância: mesma galáxia (setor+paralelo) · mesmo setor OU paralelo · resto.
    let tt: number, dist: string;
    if (g === og && s === os) { tt = sel.travel.galaxia; dist = "mesma galáxia"; }
    else if (g === og || s === os) { tt = sel.travel.setor; dist = "mesmo setor/paralelo"; }
    else { tt = sel.travel.universo; dist = "outro setor"; }
    const tick = view.game.tickNumber;
    const partida = tick + dDelay;        // sai agora, ou daqui a dDelay ticks
    const chegada = partida + tt;         // chega/combate
    return { tt, dist, partida, chegada, tick, fake: dFake, mission: dMission };
  })();

  return (
    <>
      <div className="panel">
        <h2>Frotas sob o seu comando</h2>
        <div className="cost" style={{ marginBottom: 10 }}>
          {view.planet.fleetSlots}/5 frotas criadas. No <b>cabeçalho</b> de cada frota: <b>✏</b> renomeia · <b>« tudo</b> / <b>tudo »</b> movem <b>todas as naves de uma vez</b>. Nas linhas, as setas <b>«</b> <b>»</b> movem <b>um tipo</b> por vez (na hora). Pra mover <b>de uma frota pra outra</b>, use o painel <b>🔀 Transferir naves direto</b>. Depois envie pela <b>Enviar frota</b> ou pela aba <b>Galáxia</b>.
        </div>

        {fleets.length === 0 ? (
          <div className="roid-count">Nenhuma frota ainda. Crie uma abaixo.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="fleet-grid">
              <thead>
                <tr>
                  <th>Naves</th>
                  <th className="fleet-base-col">🏠 Base</th>
                  {fleets.map((f) => (
                    <th key={f.id}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {f.name}
                        <button title="renomear esta frota" disabled={busy} onClick={() => renameFleetPrompt(f.id, f.name)}
                          style={{ padding: "0 4px", margin: 0, fontSize: 11, lineHeight: 1.4, opacity: 0.7 }}>✏</button>
                      </div>
                      {f.idle && (
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 3 }}>
                          <button title="mover TODAS as naves desta frota → Base" disabled={busy || Object.values(f.units).every((n) => (n ?? 0) <= 0)}
                            onClick={() => quickMoveAll(f.id, "base")}
                            style={{ padding: "1px 6px", margin: 0, fontSize: 10, lineHeight: 1.4 }}>« tudo</button>
                          <button title="mover TODAS as naves da Base → esta frota" disabled={busy || view.units.every((u) => u.count <= 0)}
                            onClick={() => quickMoveAll(f.id, "frota")}
                            style={{ padding: "1px 6px", margin: 0, fontSize: 10, lineHeight: 1.4 }}>tudo »</button>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shipNames.map((name, i) => {
                  // Cabeçalho de raça quando a raça muda (igual ao Hangar): ⚙️ própria, 🛸 capturadas.
                  const race = raceOf(name);
                  const prevRace = i > 0 ? raceOf(shipNames[i - 1]) : null;
                  const showHead = race !== prevRace;
                  const captured = race !== ownRace;
                  return (
                  <Fragment key={name}>
                  {showHead && race && (
                    <tr className="ship-race-head"><td colSpan={totalCols}>{captured ? "🛸 " : "⚙️ "}{race}{captured ? " (capturadas)" : ""}</td></tr>
                  )}
                  <tr>
                    <td className="fg-name"><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><ShipIcon name={name} size={26} /><span><b>{name}</b> <span className="roid-count" style={{ fontSize: 10.5 }}>({classeOf(name)})</span><div className="roid-count" style={{ fontSize: 10.5, opacity: 0.85 }}>🎯 {alvosOf(name)}</div></span></span></td>
                    <td className="fleet-base-col">{fmt(baseOf(name))}</td>
                    {fleets.map((f) => (
                      <td key={f.id} className={!f.idle && !(f.units[name]) ? "fg-zero" : ""}>
                        {f.idle ? (
                          <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center" }}>
                            <button title="mover TUDO desta nave desta frota → Base (na hora)" disabled={busy || (f.units[name] ?? 0) <= 0}
                              onClick={() => quickMove(f.id, "base", name, f.units[name] ?? 0)}
                              style={{ padding: "2px 5px", margin: 0, fontSize: 12, lineHeight: 1 }}>«</button>
                            <span style={{ minWidth: 40, textAlign: "center", fontFamily: "var(--mono)" }}>{f.units[name] ? fmt(f.units[name]) : "·"}</span>
                            <button title="mover TUDO desta nave da Base → esta frota (na hora)" disabled={busy || baseOf(name) <= 0}
                              onClick={() => quickMove(f.id, "frota", name, baseOf(name), f.id)}
                              style={{ padding: "2px 5px", margin: 0, fontSize: 12, lineHeight: 1 }}>»</button>
                          </div>
                        ) : (f.units[name] ? fmt(f.units[name]) : "·")}
                      </td>
                    ))}
                  </tr>
                  </Fragment>
                  );
                })}
                <tr className="fg-meta">
                  <td>Estado</td><td>—</td>
                  {fleets.map((f) => (
                    <td key={f.id} style={{ color: f.idle ? "var(--muted)" : f.mission === "attack" ? "var(--danger)" : "var(--carbonum)" }}>
                      {STATUS_LABEL[f.status] ?? f.status}
                      {f.scheduled ? <div className="roid-count"><CoordLink c={f.target} /> · parte em {f.launchIn}t</div>
                        : !f.idle && <div className="roid-count"><CoordLink c={f.target} /> · {f.ticksRemaining}t</div>}
                    </td>
                  ))}
                </tr>
                <tr className="fg-meta">
                  <td title="Galáxia (mesma) / mesmo Setor ou Paralelo / resto do Universo">Viagem (G/S/U)</td><td>—</td>
                  {fleets.map((f) => (
                    <td key={f.id} className="roid-count">{f.travel.galaxia}/{f.travel.setor}/{f.travel.universo}t<div>⛽{fmt(f.travel.fuel)}</div></td>
                  ))}
                </tr>
                <tr className="fg-meta">
                  <td>Espólio (M/C/P)</td><td>—</td>
                  {fleets.map((f) => {
                    const c = f.captured; const has = c.metalium || c.carbonum || c.plutonium;
                    return <td key={f.id} className="roid-count" style={has ? { color: "var(--carbonum)" } : undefined}>
                      {has ? `${fmt(c.metalium)}/${fmt(c.carbonum)}/${fmt(c.plutonium)} roids` : "—"}
                    </td>;
                  })}
                </tr>
                <tr className="fg-meta">
                  <td>Ações</td><td>—</td>
                  {fleets.map((f) => (
                    <td key={f.id}>
                      {!f.idle && f.canRecall ? (
                        f.scheduled ? (
                          <button disabled={busy} className="btn-danger" style={{ padding: "2px 8px", fontSize: 11 }}
                            onClick={() => { if (window.confirm(`Cancelar o envio agendado da ${f.name} (${f.totalShips} naves) pra ${f.target}?\n\nO combustível é devolvido.`)) act(() => api.recallFleet(f.id)); }}>✖ cancelar</button>
                        ) : (
                          <button disabled={busy} className="btn-danger" style={{ padding: "2px 8px", fontSize: 11 }}
                            onClick={() => { if (window.confirm(`Recuar a ${f.name} (${f.totalShips} naves) que vai pra ${f.target}?\n\nA frota volta pra base.`)) act(() => api.recallFleet(f.id)); }}>↩ recuar</button>
                        )
                      ) : <span className="roid-count">—</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {fleets.length > 0 && (
        <div className="panel">
          <h2>🔀 Transferir naves direto</h2>
          <div className="cost" style={{ marginBottom: 10 }}>
            Mova naves <b>direto de uma frota pra outra</b> (ou da Base), sem precisar descarregar antes. Escolha a origem e o destino e quantas naves de cada tipo.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <span className="roid-count">De:</span>
            <select value={tFrom} onChange={(e) => { setTFrom(e.target.value); setTUnits({}); }}
              style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
              <option value="base">🏠 Base</option>
              {fleets.filter((f) => f.idle).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <span style={{ fontSize: 18 }}>➜</span>
            <span className="roid-count">Para:</span>
            <select value={tTo} onChange={(e) => setTTo(e.target.value)}
              style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
              <option value="">destino...</option>
              <option value="base">🏠 Base</option>
              {fleets.filter((f) => f.idle && f.id !== tFrom).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {shipNames.filter((name) => availAt(tFrom, name) > 0).map((name) => (
              <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px" }}>
                <span style={{ fontSize: 12 }}><b>{name}</b></span>
                <span className="roid-count">tem {fmt(availAt(tFrom, name))}</span>
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  <input type="number" min={0} max={availAt(tFrom, name)} placeholder="0" value={tUnits[name] || ""}
                    onChange={(e) => setTUnits({ ...tUnits, [name]: Math.max(0, Math.min(availAt(tFrom, name), Math.floor(Number(e.target.value) || 0))) })}
                    style={{ width: 60, margin: 0, padding: "3px 4px", textAlign: "center" }} />
                  <button title="transferir tudo desta nave" disabled={busy} onClick={() => setTUnits({ ...tUnits, [name]: availAt(tFrom, name) })}
                    style={{ padding: "2px 6px", margin: 0, fontSize: 11, lineHeight: 1 }}>máx</button>
                </div>
              </div>
            ))}
            {shipNames.filter((name) => availAt(tFrom, name) > 0).length === 0 && (
              <div className="roid-count">A origem escolhida não tem naves.</div>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <button disabled={busy || !tTo} onClick={doTransfer}>{busy ? "..." : "🔀 transferir"}</button>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>🚀 Enviar frota</h2>
        <div className="cost" style={{ marginBottom: 10 }}>
          Digite as coordenadas do alvo, escolha a ação e a frota (carregada e na base).
          Mesma galáxia = só defesa; outra galáxia = atacar.
        </div>
        {fleets.filter((f) => f.idle && f.totalShips > 0).length === 0 ? (
          <div className="roid-count">Nenhuma frota carregada na base. Transfira naves pra uma frota acima.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="roid-count">Coords:</span>
            <input type="text" inputMode="numeric" maxLength={3} placeholder="set" title="Setor" value={dGalaxy} onChange={(e) => setDGalaxy(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 6px", textAlign: "center" }} />
            <span>:</span>
            <input type="text" inputMode="numeric" maxLength={3} placeholder="par" title="Paralelo" value={dSystem} onChange={(e) => setDSystem(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 6px", textAlign: "center" }} />
            <span>:</span>
            <input type="text" inputMode="numeric" maxLength={3} placeholder="slot" title="Slot" value={dSlot} onChange={(e) => setDSlot(e.target.value.replace(/\D/g, ""))} style={{ width: 60, margin: 0, padding: "6px 6px", textAlign: "center" }} />
            <select
              value={dFake ? `${dMission}_fake` : dMission}
              onChange={(e) => { const v = e.target.value; const m = v.replace("_fake", "") as "attack" | "transport"; setDFake(v.endsWith("_fake")); setDMission(m); setDTicks((t) => Math.min(t, m === "transport" ? 6 : 3)); }}
              title="Falso = a frota vai até a órbita e volta SEM engajar (finta, pra enganar o inimigo)"
              style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
              <option value="attack">⚔️ Atacar</option>
              <option value="transport">🛡️ Defender</option>
              <option value="attack_fake">🎭 Ataque falso</option>
              <option value="transport_fake">🎭 Defesa falsa</option>
            </select>
            {!dFake && (
              <select value={dTicks} onChange={(e) => setDTicks(Number(e.target.value))} title={dMission === "attack" ? "ticks de combate" : "ticks de defesa"} style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
                {/* ataque: máx 3 ticks · defesa: máx 6 */}
                {Array.from({ length: dMission === "transport" ? 6 : 3 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{dMission === "attack" ? "atacar" : "defender"} {n} tick{n > 1 ? "s" : ""}</option>
                ))}
              </select>
            )}
            <select value={dDelay} onChange={(e) => setDDelay(Number(e.target.value))} title="Envio agendado: a frota só parte daqui a N ticks (o alvo só é avisado na partida). Máx 6." style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
              <option value={0}>🕓 partir agora</option>
              {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>🕓 partir em {n} tick{n > 1 ? "s" : ""}</option>
              ))}
            </select>
            <select value={dFleet} onChange={(e) => setDFleet(e.target.value)} style={{ width: "auto", margin: 0, background: "rgba(0,0,0,0.3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px" }}>
              <option value="">escolha a frota...</option>
              {fleets.filter((f) => f.idle && f.totalShips > 0).map((f) => <option key={f.id} value={f.id}>{f.name} ({fmt(f.totalShips)} naves)</option>)}
            </select>
            <button disabled={busy || !dFleet} onClick={dispatch}>{busy ? "..." : dDelay > 0 ? `🕓 agendar (${dDelay}t)` : "🚀 enviar"}</button>
          </div>
        )}
        {/* Prévia: ticks de viagem (G/S/U) e em qual tick o combate "bate" (Felipe). */}
        {envioPreview && (
          <div className="cost" style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            🧭 <b>{envioPreview.dist}</b> · viagem <b style={{ color: "var(--accent)" }}>{envioPreview.tt}t</b>
            {dDelay > 0 && <> · parte no tick <b>#{envioPreview.partida}</b> (daqui a {dDelay}t)</>}
            {" · "}
            {envioPreview.fake
              ? <>a finta chega no tick <b style={{ color: "var(--accent)" }}>#{envioPreview.chegada}</b> e volta</>
              : envioPreview.mission === "attack"
                ? <>⚔️ o combate <b>bate no tick</b> <b style={{ color: "var(--danger)" }}>#{envioPreview.chegada}</b></>
                : <>🛡️ a defesa <b>chega no tick</b> <b style={{ color: "var(--carbonum)" }}>#{envioPreview.chegada}</b></>}
            <span className="roid-count"> (tick atual #{envioPreview.tick})</span>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Criar frota</h2>
        <div className="cost">Gasta recursos para criar uma frota e usa quando quiser. Custo ×5 a cada nova frota (máx 5).</div>
        <div className="roid-row">
          <div className="roid-label"><div>
            <div><b>Criar frota #{view.planet.fleetSlots + 1}</b></div>
            {nextCost
              ? <div className="roid-count">{fmt(nextCost.metalium)} metalium · {fmt(nextCost.carbonum)} carbonum</div>
              : <div className="roid-count">Você já tem o máximo de frotas (5).</div>}
          </div></div>
          {nextCost && (
            <button disabled={busy || view.planet.resources.metalium < nextCost.metalium || view.planet.resources.carbonum < nextCost.carbonum}
              onClick={() => { if (window.confirm(`Criar a frota #${view.planet.fleetSlots + 1}?\n\nCusta ${fmt(nextCost.metalium)} metalium · ${fmt(nextCost.carbonum)} carbonum.`)) act(() => api.createFleet()); }}>
              {busy ? "..." : "criar frota"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
