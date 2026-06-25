import { prisma } from "../db.js";
import { isRaceKey, type RaceKey } from "./races.js";
import { unitByName, raceTable } from "./catalog.js";
import { type ClasseCode } from "./unitTable.js";
import { parseUnits, stringifyUnits, totalUnits, addUnits, type UnitMap } from "./unitmap.js";
import { travelTime } from "./travel.js";
import { levelOf } from "./tech.js";
import { addNews } from "./news.js";

// ===== Balanceamento =====
export const BATTLE_TICKS = 3;
const CAP_MIN = 0.05;   // roid cap mínimo (atacante >> defensor)
const CAP_MAX = 0.15;   // roid cap máximo (equilibrado/azarão)
const ASSIM_RATE = 0.5; // Mech: fração das naves inimigas destruídas que assimila

const CLASS_RANK: Record<ClasseCode, number> = { Ca: 1, Co: 2, Fr: 3, De: 4, Cr: 5, Na: 6, Ro: 0 };
// Capacidade de carga de roids por roider (por classe). Sem coluna na tabela -> assumido.
function roiderCargo(name: string): number {
  const u = unitByName(name);
  if (!u || !u.roider) return 0;
  return CLASS_RANK[u.classe] * 80;
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
}

interface BattleState {
  atkInit: UnitMap; defInit: UnitMap;
  aActive: UnitMap; dActive: UnitMap; // podem atirar
  aLost: UnitMap; dLost: UnitMap;     // destruídas
  aPem: UnitMap; dPem: UnitMap;       // paralisadas (sobrevivem)
  rate: number;
  log?: LogEvent[];                   // log da ÚLTIMA rodada
}

// Uma unidade dispara contra o lado inimigo (alvos por classe; aplica já as baixas).
function fireAt(typeName: string, count: number, enemyActive: UnitMap, enemyLost: UnitMap, enemyPem: UnitMap, log?: LogEvent[], side?: "a" | "d") {
  const A = unitByName(typeName);
  if (!A || A.qarm <= 0 || count <= 0) return;
  const targets = Object.keys(enemyActive).filter((t) => {
    if (enemyActive[t] <= 0) return false;
    const T = unitByName(t); return T ? A.alvos.includes(T.classe) : false;
  });
  if (targets.length === 0) return;
  const sum = targets.reduce((s, t) => s + enemyActive[t], 0);
  const shots = count * A.qarm;
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
      if (log && side && killed > 0) log.push({ side, ini: A.ini, ship: typeName, count, target: t, shots: Math.round(shotsT), action: A.tipo === "Assimiladora" ? "assim" : "destroy", amount: killed, chance: Math.round(cma * 100) });
    }
  }
}

// Uma rodada (1 tick): todos atiram em ordem de INICIATIVA (menor primeiro).
function oneRound(st: BattleState) {
  st.log = []; // registra só a última rodada
  const firers: { side: "a" | "d"; type: string; ini: number }[] = [];
  for (const t of Object.keys(st.aActive)) if (st.aActive[t] > 0) firers.push({ side: "a", type: t, ini: unitByName(t)?.ini ?? 999 });
  for (const t of Object.keys(st.dActive)) if (st.dActive[t] > 0) firers.push({ side: "d", type: t, ini: unitByName(t)?.ini ?? 999 });
  firers.sort((x, y) => x.ini - y.ini);
  for (const f of firers) {
    const me = f.side === "a" ? st.aActive : st.dActive;
    if ((me[f.type] || 0) <= 0) continue; // pode ter sido destruída/paralisada antes de atirar
    if (f.side === "a") fireAt(f.type, me[f.type], st.dActive, st.dLost, st.dPem, st.log, "a");
    else fireAt(f.type, me[f.type], st.aActive, st.aLost, st.aPem, st.log, "d");
  }
}

function survivors(active: UnitMap, pem: UnitMap): UnitMap {
  return addUnits(active, pem);
}
function raidCapacity(active: UnitMap): number {
  let cap = 0;
  for (const n of Object.keys(active)) cap += active[n] * roiderCargo(n);
  return cap;
}

export async function startEngagement(fleetId: string, defenderPlanetId: string, arriveTick: number) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  const def = await prisma.planet.findUnique({ where: { id: defenderPlanetId } });
  if (!fleet || !def) return;

  const atkInit = parseUnits(fleet.units);
  const defInit = parseUnits(def.units);
  const ratio = fleetScore(atkInit) / Math.max(1, fleetScore(defInit));
  const rate = Math.max(CAP_MIN, Math.min(CAP_MAX, CAP_MAX - CAP_MIN * (ratio - 1)));

  const st: BattleState = {
    atkInit, defInit, aActive: { ...atkInit }, dActive: { ...defInit },
    aLost: {}, dLost: {}, aPem: {}, dPem: {}, rate,
  };
  await prisma.fleet.update({
    where: { id: fleetId },
    data: { status: "engaged", battleStartTick: arriveTick, battleTicksDone: 0, battleState: JSON.stringify(st) },
  });
}

export async function advanceEngagement(fleetId: string, tick: number) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  if (!fleet || fleet.status !== "engaged" || !fleet.battleState || fleet.battleStartTick == null) return;
  const def = await prisma.planet.findUnique({ where: { galaxy_system_slot: { galaxy: fleet.targetGalaxy, system: fleet.targetSystem, slot: fleet.targetSlot } }, include: { user: { select: { race: true } } } });
  if (!def) { await finalize(fleetId, tick); return; }
  const atkP = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId }, include: { user: { select: { race: true } } } });

  const st: BattleState = JSON.parse(fleet.battleState);
  const targetDone = Math.min(BATTLE_TICKS, tick - fleet.battleStartTick + 1);
  let done = fleet.battleTicksDone;
  const cap = { metalium: fleet.capMetalium, carbonum: fleet.capCarbonum, plutonium: fleet.capPlutonium };
  let roids = { metalium: def.roidMetalium, carbonum: def.roidCarbonum, plutonium: def.roidPlutonium };

  const initKeys = Array.from(new Set([...Object.keys(st.atkInit), ...Object.keys(st.defInit)]));
  // Linhas da RODADA: o que entrou (ativas no começo do tick), destruídas e paralisadas NESTE tick.
  const roundRows = (activeB: UnitMap, lostB: UnitMap, lostA: UnitMap, pemB: UnitMap, pemA: UnitMap) =>
    initKeys.map((n) => {
      const before = activeB[n] || 0;
      const lost = (lostA[n] || 0) - (lostB[n] || 0);
      const pem = (pemA[n] || 0) - (pemB[n] || 0);
      return { name: n, before, lost, pem, survivors: Math.max(0, before - lost - pem) };
    }).filter((r) => r.before > 0 || r.lost > 0 || r.pem > 0);

  while (done < targetDone) {
    // Snapshot antes da rodada (pra calcular o delta deste tick).
    const aActiveB = { ...st.aActive }, dActiveB = { ...st.dActive };
    const aLostB = { ...st.aLost }, dLostB = { ...st.dLost };
    const aPemB = { ...st.aPem }, dPemB = { ...st.dPem };
    const roundCap = { metalium: 0, carbonum: 0, plutonium: 0 };

    oneRound(st);
    // Captura do tick: roiders ativos do atacante, limitada pela capacidade e pelo cap%.
    const capacity = raidCapacity(st.aActive);
    let room = Math.max(0, capacity - (cap.metalium + cap.carbonum + cap.plutonium));
    for (const r of ["metalium", "carbonum", "plutonium"] as const) {
      if (room <= 0) break;
      const take = Math.min(room, Math.floor(roids[r] * st.rate));
      if (take > 0) { roids[r] -= take; cap[r] += take; room -= take; roundCap[r] += take; }
    }
    done++;

    // 1 relatório de combate POR TICK (este tick).
    if (atkP) {
      const report = JSON.stringify({
        attackerRace: raceTable(raceOf(atkP.user.race)), defenderRace: raceTable(raceOf(def.user.race)),
        attacker: roundRows(aActiveB, aLostB, st.aLost, aPemB, st.aPem),
        defender: roundRows(dActiveB, dLostB, st.dLost, dPemB, st.dPem),
        captured: roundCap, round: done, ticks: 1, log: st.log ?? [],
      });
      await prisma.battleReport.create({ data: {
        tick: fleet.battleStartTick + done - 1,
        attackerPlanetId: atkP.id, defenderPlanetId: def.id,
        attackerName: atkP.name, defenderName: def.name,
        attackerCoords: `${atkP.galaxy}:${atkP.system}:${atkP.slot}`,
        defenderCoords: `${def.galaxy}:${def.system}:${def.slot}`,
        winner: "engaged",
        capturedMetalium: roundCap.metalium, capturedCarbonum: roundCap.carbonum, capturedPlutonium: roundCap.plutonium,
        report,
      }});
    }
  }

  // Persiste: defensor (sobreviventes = ativos + paralisados), roids, estado, espólio.
  const defSurv = survivors(st.dActive, st.dPem);
  await prisma.planet.update({
    where: { id: def.id },
    data: { units: stringifyUnits(defSurv), roidMetalium: roids.metalium, roidCarbonum: roids.carbonum, roidPlutonium: roids.plutonium },
  });
  await prisma.fleet.update({
    where: { id: fleetId },
    data: { battleTicksDone: done, battleState: JSON.stringify(st), capMetalium: cap.metalium, capCarbonum: cap.carbonum, capPlutonium: cap.plutonium },
  });
  if (done >= BATTLE_TICKS) await finalize(fleetId, tick);
}

export async function finalize(fleetId: string, tick: number) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  if (!fleet) return;
  const atkP = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId }, include: { user: { select: { race: true } } } });
  const def = await prisma.planet.findUnique({ where: { galaxy_system_slot: { galaxy: fleet.targetGalaxy, system: fleet.targetSystem, slot: fleet.targetSlot } }, include: { user: { select: { race: true } } } });
  const st: BattleState | null = fleet.battleState ? JSON.parse(fleet.battleState) : null;

  let atkSurv: UnitMap;
  if (st && atkP && def) {
    const atkRace = raceOf(atkP.user.race);
    atkSurv = survivors(st.aActive, st.aPem);
    // Assimilação Mech: ganha parte das naves inimigas destruídas.
    if (atkRace === "mech") {
      for (const t of Object.keys(st.dLost)) {
        const g = Math.floor(st.dLost[t] * ASSIM_RATE);
        if (g > 0) atkSurv[t] = (atkSurv[t] || 0) + g;
      }
    }
    if (raceOf(def.user.race) === "mech") {
      const inc: UnitMap = {};
      for (const t of Object.keys(st.aLost)) { const g = Math.floor(st.aLost[t] * ASSIM_RATE); if (g > 0) inc[t] = g; }
      if (totalUnits(inc) > 0) {
        const cur = parseUnits(def.units);
        await prisma.planet.update({ where: { id: def.id }, data: { units: stringifyUnits(addUnits(cur, inc)) } });
      }
    }
    // Os relatórios de combate são gerados POR TICK em advanceEngagement.
    // Aqui só fechamos: assimilação (acima), resumo nas notícias e retorno da frota.
    const aLost = totalUnits(st.aLost), dLost = totalUnits(st.dLost);
    const cap = fleet.capMetalium + fleet.capCarbonum + fleet.capPlutonium;
    const defCoords = `${def.galaxy}:${def.system}:${def.slot}`;
    const atkCoords = `${atkP.galaxy}:${atkP.system}:${atkP.slot}`;
    await addNews(atkP.id, tick, `⚔️ Seu ataque a ${def.name} (${defCoords}) terminou — perdeu ${aLost} nave(s), inimigo perdeu ${dLost}, capturou ${cap} roid(s)`);
    await addNews(def.id, tick, `🛡️ Você foi atacado por ${atkP.name} (${atkCoords}) — perdeu ${dLost} nave(s), inimigo perdeu ${aLost}, perdeu ${cap} roid(s)`);
  } else {
    atkSurv = parseUnits(fleet.units);
  }

  let propLevel = 0;
  try { propLevel = atkP ? levelOf(JSON.parse(atkP.tech), "propulsao") : 0; } catch {}
  // Se a frota CHEGOU (combate/defesa concluída no alvo), volta no TEC cheio.
  // Se foi RECUADA no meio do caminho (nunca chegou), volta só o que já viajou.
  const arrived = fleet.status === "engaged" || st != null || tick >= fleet.arriveTick;
  const back = arrived
    ? travelTime(fleet.targetGalaxy, fleet.originGalaxy, atkSurv, propLevel)
    : Math.max(1, tick - fleet.departTick);
  // Frota dizimada: o container (pago) persiste, vazio e parado na base.
  if (totalUnits(atkSurv) <= 0) {
    await prisma.fleet.update({ where: { id: fleetId }, data: { status: "idle", units: "{}", battleState: null, departTick: 0, arriveTick: 0, capMetalium: 0, capCarbonum: 0, capPlutonium: 0 } });
    return;
  }
  await prisma.fleet.update({ where: { id: fleetId }, data: {
    status: "returning", battleState: null, departTick: tick, arriveTick: tick + back, units: stringifyUnits(atkSurv),
  }});
}

export async function recallFleet(fleetId: string, ownerPlanetId: string, tick: number) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  if (!fleet) throw new Error("Frota nao encontrada");
  if (fleet.ownerPlanetId !== ownerPlanetId) throw new Error("Essa frota nao e sua");
  if (fleet.status === "returning") throw new Error("A frota ja esta voltando");
  await finalize(fleetId, tick);
}
