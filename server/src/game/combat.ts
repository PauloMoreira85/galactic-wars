import { prisma } from "../db.js";
import { isRaceKey, type RaceKey } from "./races.js";
import { unitByName, raceTable } from "./catalog.js";
import { parseUnits, stringifyUnits, totalUnits, addUnits, type UnitMap } from "./unitmap.js";
import { travelTime } from "./travel.js";
import { galaxyId } from "./geo.js";
import { travelReductionTicks } from "./tech.js";
import { addNews } from "./news.js";
import { addMorale } from "./morale.js";

// ===== Balanceamento =====
export const BATTLE_TICKS = 3;
const CAP_MIN = 0.05;   // roid cap mínimo (atacante >> defensor)
const CAP_MAX = 0.15;   // roid cap máximo (equilibrado/azarão)
// Mech: a assimilação CONSOME a assimiladora e é equilibrada por VALOR (custo),
// não 1:1. Pra assimilar naves inimigas de valor V, gasta V em assimiladoras.

// Carga de roids por roider ATIVO (não-paralisado): cada roider rouba `qarm`
// roids (Quantidade de Armas da tabela). Ex.: Seth=1, Netuno=2, Thoth=3.
// Só naves com a flag `roider` carregam; as demais carregam 0.
function roiderCargo(name: string): number {
  const u = unitByName(name);
  if (!u || !u.roider) return 0;
  return u.qarm;
}

function raceOf(r: string): RaceKey { return isRaceKey(r) ? r : "humanos"; }

// "Pontuação das naves" (canon: 1M de m+c em naves = 100k pts).
function fleetScore(m: UnitMap): number {
  let s = 0;
  for (const name of Object.keys(m)) {
    const u = unitByName(name); if (!u) continue;
    s += m[name] * (u.m + u.c) * 0.1;
  }
  return s;
}

// Evento do log "Combate Completo" (um disparo de um tipo de nave contra um alvo).
interface LogEvent {
  side: "a" | "d"; ini: number; ship: string; count: number;
  target: string; shots: number; action: "pem" | "destroy" | "assim"; amount: number; chance: number;
  assimCost?: number; // naves assimiladoras consumidas nessa assimilação (Mech)
}

interface BattleState {
  atkInit: UnitMap; defInit: UnitMap;
  aActive: UnitMap; dActive: UnitMap; // podem atirar
  aLost: UnitMap; dLost: UnitMap;     // destruídas
  aPem: UnitMap; dPem: UnitMap;       // paralisadas (sobrevivem)
  rate: number;
  // Quem compõe a defesa: "base" (planeta + frotas idle do dono) + cada frota de
  // GUARNIÇÃO (reforço de aliado). Usado pra devolver sobreviventes a cada um.
  defContributors?: { id: string; units: UnitMap }[];
  log?: LogEvent[];                   // log da ÚLTIMA rodada
}

// Distribui os sobreviventes (por tipo) entre os contribuintes, proporcional à
// composição inicial de cada um (sobra vai pros maiores fracionários).
function distributeUnits(survivors: UnitMap, contributors: { id: string; units: UnitMap }[]): Record<string, UnitMap> {
  const out: Record<string, UnitMap> = {};
  for (const c of contributors) out[c.id] = {};
  for (const type of Object.keys(survivors)) {
    const totalInit = contributors.reduce((a, c) => a + (c.units[type] || 0), 0);
    if (totalInit <= 0) {
      // Tipo que NENHUM contribuinte tinha (ex.: naves ASSIMILADAS). Vai todo
      // pro 1º contribuinte (defesa = "base"; ataque = a frota líder).
      const fb = contributors[0]?.id;
      if (fb) out[fb][type] = (out[fb][type] || 0) + survivors[type];
      continue;
    }
    const surv = survivors[type];
    const parts = contributors.map((c) => {
      const init = c.units[type] || 0; const exact = (surv * init) / totalInit;
      return { id: c.id, floor: Math.floor(exact), frac: exact - Math.floor(exact), init };
    });
    let assigned = 0;
    for (const p of parts) { out[p.id][type] = p.floor; assigned += p.floor; }
    let left = surv - assigned;
    parts.sort((a, b) => b.frac - a.frac);
    for (let i = 0; i < parts.length && left > 0; i++) { if (parts[i].init > 0) { out[parts[i].id][type]++; left--; } }
  }
  return out;
}

// Uma unidade dispara contra o lado inimigo (alvos por classe; aplica já as baixas).
function fireAt(typeName: string, count: number, enemyActive: UnitMap, enemyLost: UnitMap, enemyPem: UnitMap, log?: LogEvent[], side?: "a" | "d", assimOut?: UnitMap, selfActive?: UnitMap, selfLost?: UnitMap) {
  const A = unitByName(typeName);
  if (!A || A.qarm <= 0 || count <= 0) return;
  const targets = Object.keys(enemyActive).filter((t) => {
    if (enemyActive[t] <= 0) return false;
    const T = unitByName(t); return T ? A.alvos.includes(T.classe) : false;
  });
  if (targets.length === 0) return;
  const sum = targets.reduce((s, t) => s + enemyActive[t], 0);
  const shots = count * A.qarm;
  // Orçamento de assimilação = VALOR total da esquadra assimiladora (custo × qtd).
  // Cada nave inimiga assimilada gasta o custo dela desse orçamento; o Mech perde
  // assimiladoras de valor equivalente. Assim a troca é justa (valor por valor).
  const aCost = (A.m + A.c + A.p) || 1;
  let valueBudget = A.tipo === "Assimiladora" ? count * aCost : 0;
  for (const t of targets) {
    const T = unitByName(t)!;
    const shotsT = shots * (enemyActive[t] / sum);
    if (A.tipo === "PEM") {
      const hit = Math.max(0, (100 - T.rp) / 100); // RP = chance de resistir
      const par = Math.min(enemyActive[t], Math.floor(shotsT * hit));
      enemyActive[t] -= par; enemyPem[t] = (enemyPem[t] || 0) + par;
      if (log && side && par > 0) log.push({ side, ini: A.ini, ship: typeName, count, target: t, shots: Math.round(shotsT), action: "pem", amount: par, chance: Math.round(hit * 100) });
    } else {
      // Chance Média de Acerto (oficial): CMA% = 25 + (Varm atacante - Agi defensor)
      const cma = Math.max(0, Math.min(100, 25 + A.varm - T.agi)) / 100;
      const dmg = shotsT * cma * A.pfog;
      const killed = Math.min(enemyActive[t], Math.floor(dmg / T.fusel));
      enemyActive[t] -= killed; enemyLost[t] = (enemyLost[t] || 0) + killed;
      // Mech: das naves que ABATE, assimila as que couberem no orçamento de VALOR
      // (luta pelo Mech a partir do próximo tick). Gasta assimiladoras de valor
      // equivalente (selfLost) — o resto abatido é só destruído.
      let assimCost = 0;
      if (A.tipo === "Assimiladora" && assimOut && killed > 0 && valueBudget > 0) {
        const tCost = (T.m + T.c + T.p) || 1;
        const g = Math.min(killed, Math.floor(valueBudget / tCost)); // quantas dá pra assimilar
        if (g > 0) {
          assimOut[t] = (assimOut[t] || 0) + g;
          const spent = g * tCost;
          valueBudget -= spent;
          if (selfActive && selfLost) {
            // Arredonda pra CIMA: toda assimilação custa no mínimo 1 nave.
            assimCost = Math.min(selfActive[typeName] ?? 0, Math.max(1, Math.ceil(spent / aCost)));
            selfActive[typeName] = (selfActive[typeName] ?? 0) - assimCost;
            selfLost[typeName] = (selfLost[typeName] ?? 0) + assimCost;
          }
        }
      }
      if (log && side && killed > 0) log.push({ side, ini: A.ini, ship: typeName, count, target: t, shots: Math.round(shotsT), action: A.tipo === "Assimiladora" ? "assim" : "destroy", amount: killed, chance: Math.round(cma * 100), assimCost });
    }
  }
}

// Uma rodada (1 tick): todos atiram em ordem de INICIATIVA (menor primeiro).
// Empate de iniciativa: a DEFESA atira primeiro (vantagem sempre da defesa).
function oneRound(st: BattleState): { aAssim: UnitMap; dAssim: UnitMap } {
  st.log = []; // registra só a última rodada
  const firers: { side: "a" | "d"; type: string; ini: number }[] = [];
  for (const t of Object.keys(st.aActive)) if (st.aActive[t] > 0) firers.push({ side: "a", type: t, ini: unitByName(t)?.ini ?? 999 });
  for (const t of Object.keys(st.dActive)) if (st.dActive[t] > 0) firers.push({ side: "d", type: t, ini: unitByName(t)?.ini ?? 999 });
  firers.sort((x, y) => (x.ini - y.ini) || (x.side === y.side ? 0 : x.side === "d" ? -1 : 1));
  const aAssim: UnitMap = {}, dAssim: UnitMap = {}; // naves assimiladas nesta rodada
  for (const f of firers) {
    const me = f.side === "a" ? st.aActive : st.dActive;
    if ((me[f.type] || 0) <= 0) continue; // pode ter sido destruída/paralisada antes de atirar
    if (f.side === "a") fireAt(f.type, me[f.type], st.dActive, st.dLost, st.dPem, st.log, "a", aAssim, st.aActive, st.aLost);
    else fireAt(f.type, me[f.type], st.aActive, st.aLost, st.aPem, st.log, "d", dAssim, st.dActive, st.dLost);
  }
  // Assimiladas entram nos ativos do assimilador AO FIM da rodada -> combatem
  // só a partir do próximo tick (se assimilar mais no tick seguinte, somam de novo).
  for (const t of Object.keys(aAssim)) if (aAssim[t] > 0) st.aActive[t] = (st.aActive[t] || 0) + aAssim[t];
  for (const t of Object.keys(dAssim)) if (dAssim[t] > 0) st.dActive[t] = (st.dActive[t] || 0) + dAssim[t];
  return { aAssim, dAssim };
}

function survivors(active: UnitMap, pem: UnitMap): UnitMap {
  return addUnits(active, pem);
}
function raidCapacity(active: UnitMap): number {
  let cap = 0;
  for (const n of Object.keys(active)) cap += active[n] * roiderCargo(n);
  return cap;
}

// ===== Simulador (Calculadora de Combate) =====
// Roda o MESMO motor do combate real (oneRound) por até `ticks` rodadas, SEM
// tocar no banco. Cada tick parte dos sobreviventes do anterior (PEM dura 1 tick;
// assimiladas entram no fim da rodada). Usado pela ferramenta pra prever o resultado.
export interface SimRow { name: string; before: number; lost: number; pem: number; assim: number; survivors: number }
export interface SimTick {
  tick: number;
  attacker: SimRow[]; defender: SimRow[];
  aBefore: number; dBefore: number; aAfter: number; dAfter: number;
  raidCapacity: number; // roids que os roiders atacantes vivos carregariam neste tick
}
export interface SimResult {
  ticks: SimTick[];
  winner: "atacante" | "defesa" | "ambos_destruidos" | "indefinido";
  finalAttacker: UnitMap; finalDefender: UnitMap;
}
export function simulateCombat(attacker0: UnitMap, defender0: UnitMap, ticks = BATTLE_TICKS): SimResult {
  let aCur: UnitMap = { ...attacker0 };
  let dCur: UnitMap = { ...defender0 };
  const N = Math.max(1, Math.min(BATTLE_TICKS, Math.floor(ticks)));
  const out: SimTick[] = [];
  for (let t = 1; t <= N; t++) {
    if (totalUnits(aCur) <= 0 || totalUnits(dCur) <= 0) break;
    const ratio = fleetScore(aCur) / Math.max(1, fleetScore(dCur));
    const rate = Math.max(CAP_MIN, Math.min(CAP_MAX, CAP_MAX - CAP_MIN * (ratio - 1)));
    const st: BattleState = { atkInit: { ...aCur }, defInit: { ...dCur }, aActive: { ...aCur }, dActive: { ...dCur }, aLost: {}, dLost: {}, aPem: {}, dPem: {}, rate };
    const { aAssim, dAssim } = oneRound(st); // aAssim = atacantes assimilados pela DEFESA; dAssim = defensores assimilados pelo ATACANTE
    const aSurv = survivors(st.aActive, st.aPem);
    const dSurv = survivors(st.dActive, st.dPem);
    const keys = (init: UnitMap, assim: UnitMap, surv: UnitMap) =>
      Array.from(new Set([...Object.keys(init), ...Object.keys(assim), ...Object.keys(surv)]));
    const rowsOf = (init: UnitMap, lost: UnitMap, pem: UnitMap, assim: UnitMap, surv: UnitMap): SimRow[] =>
      keys(init, assim, surv).map((n) => ({ name: n, before: init[n] || 0, lost: lost[n] || 0, pem: pem[n] || 0, assim: assim[n] || 0, survivors: surv[n] || 0 }))
        .filter((r) => r.before > 0 || r.lost > 0 || r.pem > 0 || r.assim > 0 || r.survivors > 0);
    out.push({
      tick: t,
      attacker: rowsOf(st.atkInit, st.aLost, st.aPem, dAssim, aSurv),
      defender: rowsOf(st.defInit, st.dLost, st.dPem, aAssim, dSurv),
      aBefore: totalUnits(st.atkInit), dBefore: totalUnits(st.defInit),
      aAfter: totalUnits(aSurv), dAfter: totalUnits(dSurv),
      raidCapacity: raidCapacity(st.aActive),
    });
    aCur = aSurv; dCur = dSurv;
  }
  const aLeft = totalUnits(aCur), dLeft = totalUnits(dCur);
  const winner: SimResult["winner"] =
    aLeft <= 0 && dLeft <= 0 ? "ambos_destruidos" :
    dLeft <= 0 ? "atacante" :
    aLeft <= 0 ? "defesa" : "indefinido";
  return { ticks: out, winner, finalAttacker: aCur, finalDefender: dCur };
}

// Marca uma frota como ENGAJADA no alvo. A batalha em si é resolvida POR PLANETA
// em resolveSiege (todas as frotas atacantes + a defesa, 1 rodada por tick).
export async function startEngagement(fleetId: string, _defenderPlanetId: string, arriveTick: number) {
  await prisma.fleet.update({
    where: { id: fleetId },
    data: { status: "engaged", battleStartTick: arriveTick, battleTicksDone: 0, battleState: null },
  });
}

// Resolve UMA rodada de combate de um PLANETA num tick: junta TODAS as frotas
// atacantes engajadas + a defesa (base + frotas idle do dono + guarnições),
// roda 1 rodada e redistribui perdas/espólio. Gera 1 relatório por planeta atacante.
export async function resolveSiege(target: { galaxy: number; system: number; slot: number }, tick: number) {
  const engaged = await prisma.fleet.findMany({ where: { status: "engaged", targetGalaxy: target.galaxy, targetSystem: target.system, targetSlot: target.slot } });
  if (engaged.length === 0) return;
  const def = await prisma.planet.findUnique({ where: { galaxy_system_slot: target }, include: { user: { select: { race: true, username: true } } } });
  if (!def) { for (const f of engaged) await finalize(f.id, tick); return; }

  // Atacantes vivos (frotas vazias finalizam direto).
  const atkContribs: { id: string; units: UnitMap }[] = [];
  for (const f of engaged) { const u = parseUnits(f.units); if (totalUnits(u) > 0) atkContribs.push({ id: f.id, units: u }); }
  if (atkContribs.length === 0) { for (const f of engaged) await finalize(f.id, tick); return; }

  // Defesa: base + frotas idle do dono + guarnições estacionadas no planeta.
  const defContribs: { id: string; units: UnitMap }[] = [{ id: "base", units: parseUnits(def.units) }];
  const idle = await prisma.fleet.findMany({ where: { ownerPlanetId: def.id, status: "idle" } });
  for (const f of idle) { const u = parseUnits(f.units); if (totalUnits(u) > 0) defContribs.push({ id: f.id, units: u }); }
  const garr = await prisma.fleet.findMany({ where: { status: "garrison", targetGalaxy: target.galaxy, targetSystem: target.system, targetSlot: target.slot } });
  for (const f of garr) { const u = parseUnits(f.units); if (totalUnits(u) > 0) defContribs.push({ id: f.id, units: u }); }

  const aActive: UnitMap = {}; for (const c of atkContribs) for (const n of Object.keys(c.units)) aActive[n] = (aActive[n] || 0) + c.units[n];
  const dActive: UnitMap = {}; for (const c of defContribs) for (const n of Object.keys(c.units)) dActive[n] = (dActive[n] || 0) + c.units[n];

  const ratio = fleetScore(aActive) / Math.max(1, fleetScore(dActive));
  const rate = Math.max(CAP_MIN, Math.min(CAP_MAX, CAP_MAX - CAP_MIN * (ratio - 1)));
  const st: BattleState = { atkInit: { ...aActive }, defInit: { ...dActive }, aActive: { ...aActive }, dActive: { ...dActive }, aLost: {}, dLost: {}, aPem: {}, dPem: {}, rate };
  // dAssim = atacantes assimilados pela defesa; aAssim = defensores assimilados pelo atacante.
  const { aAssim, dAssim } = oneRound(st);

  // Roids: roiders atacantes ativos × cap% × roids do alvo (por tick).
  const roids = { metalium: def.roidMetalium, carbonum: def.roidCarbonum, plutonium: def.roidPlutonium };
  const capacity = raidCapacity(st.aActive);
  let room = capacity; const roundCap = { metalium: 0, carbonum: 0, plutonium: 0 };
  for (const r of ["metalium", "carbonum", "plutonium"] as const) {
    if (room <= 0) break;
    const take = Math.min(room, Math.floor(roids[r] * st.rate));
    if (take > 0) { roids[r] -= take; room -= take; roundCap[r] += take; }
  }

  // Sobreviventes -> distribui de volta a cada frota/contribuinte.
  const aDist = distributeUnits(survivors(st.aActive, st.aPem), atkContribs);
  const dDist = distributeUnits(survivors(st.dActive, st.dPem), defContribs);

  // Persiste a defesa (base + frotas defensoras) e os roids restantes.
  await prisma.planet.update({ where: { id: def.id }, data: { units: stringifyUnits(dDist["base"] ?? {}), roidMetalium: roids.metalium, roidCarbonum: roids.carbonum, roidPlutonium: roids.plutonium } });
  for (const c of defContribs) if (c.id !== "base") await prisma.fleet.update({ where: { id: c.id }, data: { units: stringifyUnits(dDist[c.id] ?? {}) } });

  // Espólio dividido entre frotas atacantes por capacidade de roider de cada uma.
  const caps = atkContribs.map((c) => ({ id: c.id, cap: raidCapacity(aDist[c.id] ?? {}) }));
  const totalRoiderCap = caps.reduce((s, x) => s + x.cap, 0) || 1;

  // Linhas do relatório (combinado): antes = init do tick, perdas/pem = desta rodada.
  const initKeys = Array.from(new Set([...Object.keys(st.atkInit), ...Object.keys(st.defInit)]));
  const rows = (before: UnitMap, lost: UnitMap, pem: UnitMap, assim: UnitMap) =>
    initKeys.map((n) => ({ name: n, before: before[n] || 0, lost: lost[n] || 0, pem: pem[n] || 0, assim: assim[n] ?? 0, survivors: Math.max(0, (before[n] || 0) - (lost[n] || 0) - (pem[n] || 0)) }))
      .filter((r) => r.before > 0 || r.lost > 0 || r.pem > 0);
  const raidRows = Object.keys(st.aActive).filter((n) => st.aActive[n] > 0 && roiderCargo(n) > 0)
    .map((n) => ({ name: n, active: st.aActive[n], cargo: roiderCargo(n), capacity: st.aActive[n] * roiderCargo(n) }));
  const baseReport = {
    defenderRace: raceTable(raceOf(def.user.race)),
    attacker: rows(st.atkInit, st.aLost, st.aPem, dAssim),
    defender: rows(st.defInit, st.dLost, st.dPem, aAssim),
    captured: roundCap, raid: { capacity, ratePct: Math.round(st.rate * 100), rows: raidRows, captured: roundCap.metalium + roundCap.carbonum + roundCap.plutonium },
    round: 1, ticks: 1, log: st.log ?? [],
  };

  // Aplica sobreviventes + espólio em cada frota atacante; finaliza quem acabou.
  const atkOwners = new Set<string>();
  for (const f of engaged) {
    const surv = aDist[f.id] ?? {};
    const my = caps.find((x) => x.id === f.id);
    const share = my && totalRoiderCap > 0 ? my.cap / totalRoiderCap : 0;
    const done = (f.battleTicksDone ?? 0) + 1;
    const maxT = Math.max(1, Math.min(BATTLE_TICKS, f.engageTicks ?? BATTLE_TICKS));
    await prisma.fleet.update({ where: { id: f.id }, data: {
      units: stringifyUnits(surv), battleTicksDone: done,
      capMetalium: f.capMetalium + Math.floor(roundCap.metalium * share),
      capCarbonum: f.capCarbonum + Math.floor(roundCap.carbonum * share),
      capPlutonium: f.capPlutonium + Math.floor(roundCap.plutonium * share),
    } });
    atkOwners.add(f.ownerPlanetId);
    if (done >= maxT || totalUnits(surv) <= 0) await finalize(f.id, tick);
  }

  // 1 relatório por planeta atacante (cada um vê o combate COMBINADO).
  for (const ownerId of atkOwners) {
    const atk = await prisma.planet.findUnique({ where: { id: ownerId }, include: { user: { select: { race: true } } } });
    if (!atk) continue;
    await prisma.battleReport.create({ data: {
      tick, attackerPlanetId: atk.id, defenderPlanetId: def.id,
      attackerName: atk.name, defenderName: def.name,
      attackerCoords: `${atk.galaxy}:${atk.system}:${atk.slot}`, defenderCoords: `${def.galaxy}:${def.system}:${def.slot}`,
      winner: "engaged",
      capturedMetalium: roundCap.metalium, capturedCarbonum: roundCap.carbonum, capturedPlutonium: roundCap.plutonium,
      report: JSON.stringify({ ...baseReport, attackerRace: raceTable(raceOf(atk.user.race)) }),
    }});
  }
  // Moral do combate (canon): atacar planeta MAIS FORTE (+7/tick); atacar alvo
  // bem mais fraco = bullying (−1/tick); defensor perdendo roids p/ bem mais forte (+3/tick).
  for (const ownerId of atkOwners) {
    if (ratio < 1) await addMorale(ownerId, 7);
    else if (ratio > 2) await addMorale(ownerId, -1);
  }
  if (ratio > 2) await addMorale(def.id, 3);

  await addNews(def.id, tick, `🛡️ Combate no seu planeta — ${atkContribs.length} frota(s) atacante(s); você perdeu ${totalUnits(st.dLost)} nave(s), inimigo perdeu ${totalUnits(st.aLost)}`);
}

// Manda a frota de volta pra casa com o que sobrou (+ espólio já acumulado).
export async function finalize(fleetId: string, tick: number) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  if (!fleet) return;
  const atkP = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId } });
  const atkSurv = parseUnits(fleet.units);
  let propLevel = 0;
  try { propLevel = atkP ? travelReductionTicks(JSON.parse(atkP.tech)) : 0; } catch {}
  const arrived = fleet.status === "engaged" || tick >= fleet.arriveTick;
  const back = arrived
    ? travelTime(galaxyId(fleet.targetGalaxy, fleet.targetSystem), galaxyId(fleet.originGalaxy, fleet.originSystem), atkSurv, propLevel)
    : Math.max(1, tick - fleet.departTick);
  if (totalUnits(atkSurv) <= 0) {
    await prisma.fleet.update({ where: { id: fleetId }, data: { status: "idle", units: "{}", battleState: null, departTick: 0, arriveTick: 0, capMetalium: 0, capCarbonum: 0, capPlutonium: 0 } });
    if (atkP) await addNews(atkP.id, tick, `💥 Sua frota foi dizimada no combate em ${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot}`);
    return;
  }
  const cap = fleet.capMetalium + fleet.capCarbonum + fleet.capPlutonium;
  await prisma.fleet.update({ where: { id: fleetId }, data: {
    status: "returning", battleState: null, departTick: tick, arriveTick: tick + back, units: stringifyUnits(atkSurv),
  }});
  if (atkP && arrived) await addNews(atkP.id, tick, `⚔️ Sua frota terminou o combate em ${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot} e está voltando${cap > 0 ? ` (capturou ${cap} roid[s])` : ""}`);
}

export async function recallFleet(fleetId: string, ownerPlanetId: string, tick: number) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  if (!fleet) throw new Error("Frota nao encontrada");
  if (fleet.ownerPlanetId !== ownerPlanetId) throw new Error("Essa frota nao e sua");
  if (fleet.status === "returning") throw new Error("A frota ja esta voltando");
  await finalize(fleetId, tick);
}
