import { prisma, TX_OPTS } from "../db.js";
import { startEngagement, resolveSiege } from "./combat.js";
import { parseUnits, stringifyUnits, totalUnits, addUnits, type UnitMap } from "./unitmap.js";
import { type Coords } from "./geo.js";
import { travelTime } from "./travel.js";
import { travelReductionTicks } from "./tech.js";
import { unitByName } from "./catalog.js";
import { scoreOfUnits } from "./score.js";
import { allianceTags } from "./alliance.js";
import { hasActiveTreaty } from "./governance.js";
import { nextFleetSlotCost, NEWBIE_PROTECTION_TICKS, ATTACK_RANGE_MIN_PCT, SLOTS_PER_SYSTEM } from "./constants.js";

// Combustível (plutonium) para enviar uma frota = soma do Comb de cada nave.
export function fuelCost(units: UnitMap): number {
  let f = 0;
  for (const name of Object.keys(units)) {
    const u = unitByName(name);
    if (u) f += units[name] * u.comb;
  }
  return f;
}

export type { Coords } from "./geo.js";
export type ShipCounts = UnitMap;

function propLevelOf(techJson: string): number {
  try { return travelReductionTicks(JSON.parse(techJson)); } catch { return 0; }
}

async function currentTick(): Promise<number> {
  const s = await prisma.gameState.findUnique({ where: { id: 1 } });
  return s?.tickNumber ?? 0;
}

// Cria uma frota PERSISTENTE vazia (parada na base). Custo ×5 a cada frota, máx 5.
export async function createFleet(planetId: string) {
  return prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const cost = nextFleetSlotCost(planet.fleetSlots);
    if (!cost) throw new Error("Voce ja tem o maximo de frotas (5)");
    if (planet.metalium < cost.metalium || planet.carbonum < cost.carbonum) {
      throw new Error(`Recursos insuficientes: precisa de ${cost.metalium} metalium e ${cost.carbonum} carbonum`);
    }
    await tx.planet.update({
      where: { id: planetId },
      data: { metalium: { decrement: cost.metalium }, carbonum: { decrement: cost.carbonum }, fleetSlots: { increment: 1 } },
    });
    const fleet = await tx.fleet.create({
      data: {
        ownerPlanetId: planetId, name: `Frota ${planet.fleetSlots + 1}`, mission: "attack", status: "idle",
        originGalaxy: planet.galaxy, originSystem: planet.system, originSlot: planet.slot,
        targetGalaxy: planet.galaxy, targetSystem: planet.system, targetSlot: planet.slot,
        departTick: 0, arriveTick: 0, units: "{}",
      },
    });
    return fleet;
  }, TX_OPTS);
}

export async function renameFleet(planetId: string, fleetId: string, name: string) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  if (!fleet || fleet.ownerPlanetId !== planetId) throw new Error("Frota nao encontrada");
  await prisma.fleet.update({ where: { id: fleetId }, data: { name: name.slice(0, 30) || "Frota" } });
}

// Define a composição de uma frota IDLE (move naves entre a Base e a frota).
export async function setFleetComposition(planetId: string, fleetId: string, desired: UnitMap) {
  return prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const fleet = await tx.fleet.findUnique({ where: { id: fleetId } });
    if (!fleet || fleet.ownerPlanetId !== planetId) throw new Error("Frota nao encontrada");
    if (fleet.status !== "idle") throw new Error("So da pra mexer nas naves de uma frota parada na base");
    // Sob ataque: a base está em combate — não dá pra puxar naves (senão elas
    // contariam na defesa E na frota ao mesmo tempo).
    const inBattle = await tx.fleet.count({ where: { status: "engaged", targetGalaxy: planet.galaxy, targetSystem: planet.system, targetSlot: planet.slot } });
    if (inBattle > 0) throw new Error("Seu planeta está em combate — não dá pra mexer nas frotas até a batalha acabar");

    const hangar = parseUnits(planet.units);
    const cur = parseUnits(fleet.units);
    const names = new Set([...Object.keys(hangar), ...Object.keys(cur), ...Object.keys(desired)]);
    const newHangar: UnitMap = {};
    const newFleet: UnitMap = {};
    for (const name of names) {
      const total = (hangar[name] || 0) + (cur[name] || 0); // disponível (base + já na frota)
      const want = Math.max(0, Math.floor(desired[name] ?? cur[name] ?? 0));
      if (want > total) throw new Error(`Naves insuficientes de ${name} (tem ${total})`);
      if (want > 0) newFleet[name] = want;
      if (total - want > 0) newHangar[name] = total - want;
    }
    await tx.planet.update({ where: { id: planetId }, data: { units: stringifyUnits(newHangar) } });
    await tx.fleet.update({ where: { id: fleetId }, data: { units: stringifyUnits(newFleet) } });
    return { ok: true };
  }, TX_OPTS);
}

// Envia uma frota IDLE (já carregada) para um destino.
export async function dispatchFleet(planetId: string, fleetId: string, target: Coords, mission: "attack" | "transport", ticks = 3, fake = false) {
  const engageTicks = Math.max(1, Math.min(3, Math.floor(ticks)));
  return prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const fleet = await tx.fleet.findUnique({ where: { id: fleetId } });
    if (!fleet || fleet.ownerPlanetId !== planetId) throw new Error("Frota nao encontrada");
    if (fleet.status !== "idle") throw new Error("Essa frota nao esta na base");
    const fleetUnits = parseUnits(fleet.units);
    if (totalUnits(fleetUnits) === 0) throw new Error("Carregue naves na frota antes de enviar");

    const origin: Coords = { galaxy: planet.galaxy, system: planet.system, slot: planet.slot };
    if (target.galaxy === origin.galaxy && target.system === origin.system && target.slot === origin.slot) {
      throw new Error("Voce nao pode enviar frota para o proprio planeta");
    }
    // Sob ataque: a base está em combate — não dá pra enviar frotas (as naves
    // estão na defesa; sair com elas duplicaria).
    const inBattle = await tx.fleet.count({ where: { status: "engaged", targetGalaxy: origin.galaxy, targetSystem: origin.system, targetSlot: origin.slot } });
    if (inBattle > 0) throw new Error("Seu planeta está em combate — não dá pra enviar frotas até a batalha acabar");
    // Não dá pra ATACAR e DEFENDER o mesmo planeta ao mesmo tempo.
    const opposite = mission === "attack" ? "transport" : "attack";
    const conflict = await tx.fleet.count({ where: { ownerPlanetId: planetId, mission: opposite, status: { in: ["outbound", "engaged", "garrison"] }, targetGalaxy: target.galaxy, targetSystem: target.system, targetSlot: target.slot } });
    if (conflict > 0) throw new Error(mission === "attack" ? "Você já tem uma frota DEFENDENDO esse planeta — não dá pra atacar e defender o mesmo ao mesmo tempo" : "Você já tem uma frota ATACANDO esse planeta — não dá pra defender e atacar o mesmo ao mesmo tempo");
    if (mission === "attack" && target.galaxy === origin.galaxy) {
      throw new Error("Nao e possivel atacar planetas da mesma galaxia (sao aliados)");
    }
    if (mission === "attack" && await hasActiveTreaty(origin.galaxy, target.galaxy)) {
      throw new Error("Há um tratado de não-agressão com essa galáxia");
    }
    if (mission === "attack") {
      const nowTick = await currentTick();
      if (nowTick < NEWBIE_PROTECTION_TICKS) {
        throw new Error(`Ataques liberam no tick ${NEWBIE_PROTECTION_TICKS} (proteção inicial do jogo) — faltam ${NEWBIE_PROTECTION_TICKS - nowTick}`);
      }
      const tgt = await tx.planet.findUnique({
        where: { galaxy_system_slot: { galaxy: target.galaxy, system: target.system, slot: target.slot } },
      });
      if (tgt) {
        if (nowTick < tgt.createdTick + NEWBIE_PROTECTION_TICKS) {
          const left = tgt.createdTick + NEWBIE_PROTECTION_TICKS - nowTick;
          throw new Error(`Alvo sob proteção de novato (${left} tick(s) restante(s))`);
        }
        const myFleets = await tx.fleet.findMany({ where: { ownerPlanetId: planetId }, select: { units: true } });
        const tgtFleets = await tx.fleet.findMany({ where: { ownerPlanetId: tgt.id }, select: { units: true } });
        const myScore = scoreOfUnits(parseUnits(planet.units)) + myFleets.reduce((s, f) => s + scoreOfUnits(parseUnits(f.units)), 0);
        const tgtScore = scoreOfUnits(parseUnits(tgt.units)) + tgtFleets.reduce((s, f) => s + scoreOfUnits(parseUnits(f.units)), 0);
        if (myScore > 0 && tgtScore < (myScore * ATTACK_RANGE_MIN_PCT) / 100) {
          throw new Error(`Alvo fora do seu alcance: a pontuação dele é menor que ${ATTACK_RANGE_MIN_PCT}% da sua`);
        }
      }
    }

    const fuel = fuelCost(fleetUnits);
    if (planet.plutonium < fuel) throw new Error(`Plutonium (combustível) insuficiente: precisa de ${fuel}`);
    await tx.planet.update({ where: { id: planetId }, data: { plutonium: { decrement: fuel } } });

    const tick = await currentTick();
    const tt = travelTime(origin.galaxy, target.galaxy, fleetUnits, propLevelOf(planet.tech));
    await tx.fleet.update({
      where: { id: fleetId },
      data: {
        mission, status: "outbound",
        originGalaxy: origin.galaxy, originSystem: origin.system, originSlot: origin.slot,
        targetGalaxy: target.galaxy, targetSystem: target.system, targetSlot: target.slot,
        departTick: tick, arriveTick: tick + tt, capMetalium: 0, capCarbonum: 0, capPlutonium: 0,
        engageTicks, fake,
      },
    });
    const tipoMsg = fake ? (mission === "attack" ? "ataque falso" : "defesa falsa") : (mission === "attack" ? "ataque" : "defesa");
    await tx.news.create({ data: { planetId, tick, message: `${fleet.name} (${tipoMsg}) enviada para ${target.galaxy}:${target.system}:${target.slot} (chega em ${tt}t)` } });
    return { ok: true, arriveIn: tt };
  }, TX_OPTS);
}

// Frota volta pra base: vira IDLE mantendo as naves; espólio (roids) vai pro planeta.
export async function returnFleetToBase(fleetId: string) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  if (!fleet) return;
  if (fleet.capMetalium || fleet.capCarbonum || fleet.capPlutonium) {
    await prisma.planet.update({
      where: { id: fleet.ownerPlanetId },
      data: {
        roidMetalium: { increment: fleet.capMetalium },
        roidCarbonum: { increment: fleet.capCarbonum },
        roidPlutonium: { increment: fleet.capPlutonium },
      },
    });
  }
  await prisma.fleet.update({
    where: { id: fleetId },
    data: { status: "idle", capMetalium: 0, capCarbonum: 0, capPlutonium: 0, departTick: 0, arriveTick: 0 },
  });
}

async function scheduleReturn(fleetId: string, fleet: { ownerPlanetId: string; arriveTick: number; targetGalaxy: number; originGalaxy: number }, units: UnitMap) {
  const owner = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId } });
  const back = travelTime(fleet.targetGalaxy, fleet.originGalaxy, units, propLevelOf(owner?.tech ?? "{}"));
  await prisma.fleet.update({
    where: { id: fleetId },
    data: { status: "returning", departTick: fleet.arriveTick, arriveTick: fleet.arriveTick + back, units: stringifyUnits(units) },
  });
}

export async function processFleets(uptoTick: number) {
  const active = await prisma.fleet.findMany({
    where: { status: { in: ["outbound", "engaged", "returning", "garrison"] }, OR: [{ arriveTick: { lte: uptoTick } }, { status: "engaged" }] },
  });
  if (active.length === 0) return;

  // Planetas que terão combate resolvido NESTE tick (1 batalha combinada cada).
  const besieged = new Set<string>();

  for (const fleet of active) {
    if (fleet.status === "returning") {
      if (fleet.arriveTick <= uptoTick) await returnFleetToBase(fleet.id);
      continue;
    }
    // Já engajada: o combate é resolvido por PLANETA no fim (não por frota).
    if (fleet.status === "engaged") {
      besieged.add(`${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot}`);
      continue;
    }
    if (fleet.status === "garrison") {
      // Guarnição: fica estacionada até arriveTick (= fim do reforço), aí volta.
      if (fleet.arriveTick <= uptoTick) await scheduleReturn(fleet.id, fleet, parseUnits(fleet.units));
      continue;
    }
    if (fleet.arriveTick > uptoTick) continue;

    // Ameaça FALSA: chegou na órbita e volta SEM engajar nem guarnecer.
    if (fleet.fake) {
      await prisma.news.create({ data: { planetId: fleet.ownerPlanetId, tick: uptoTick, message: `${fleet.name} fez a finta e está voltando pra base (não engajou)` } });
      await scheduleReturn(fleet.id, fleet, parseUnits(fleet.units));
      continue;
    }

    const targetPlanet = await prisma.planet.findUnique({
      where: { galaxy_system_slot: { galaxy: fleet.targetGalaxy, system: fleet.targetSystem, slot: fleet.targetSlot } },
    });
    if (fleet.mission === "attack" && targetPlanet) {
      // Chegou pra atacar: marca engajada; o combate combinado roda abaixo.
      await startEngagement(fleet.id, targetPlanet.id, fleet.arriveTick);
      besieged.add(`${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot}`);
      continue;
    }
    // Transporte/defesa: estaciona como GUARNIÇÃO por engageTicks; volta depois.
    if (targetPlanet) {
      await prisma.fleet.update({ where: { id: fleet.id }, data: { status: "garrison", arriveTick: fleet.arriveTick + Math.max(1, fleet.engageTicks ?? 1) } });
      continue;
    }
    await scheduleReturn(fleet.id, fleet, parseUnits(fleet.units));
  }

  // Resolve cada planeta sob ataque UMA vez: junta TODAS as frotas atacantes +
  // a defesa numa só batalha (1 rodada por tick).
  for (const key of besieged) {
    const [g, s, slot] = key.split(":").map(Number);
    await resolveSiege({ galaxy: g, system: s, slot }, uptoTick);
  }
}

const RACE_TAG: Record<string, string> = { humanos: "Hum", daharan: "Dah", rakshasa: "Rak", mech: "c-M", insecta: "Ins" };
const ONLINE_MS = 5 * 60 * 1000;

// Visão rica de um sistema: cabeçalho da galáxia + 15 slots com pontuação/rank/status.
export async function viewSystem(galaxy: number, system: number, viewer: { id: string; galaxy: number } | null = null) {
  const nowMs = Date.now();
  const all = await prisma.planet.findMany({ include: { user: { select: { username: true, race: true, lastSeen: true } } } });
  const fleets = await prisma.fleet.findMany();
  const fleetScore: Record<string, number> = {};
  for (const f of fleets) fleetScore[f.ownerPlanetId] = (fleetScore[f.ownerPlanetId] || 0) + scoreOfUnits(parseUnits(f.units));
  const scoreOf = (p: any) => scoreOfUnits(parseUnits(p.units)) + (fleetScore[p.id] || 0);

  // Rank global por pontuação.
  const ranked = all.map((p) => ({ id: p.id, score: scoreOf(p) })).sort((a, b) => b.score - a.score);
  const rankById: Record<string, number> = {};
  ranked.forEach((r, i) => { rankById[r.id] = i + 1; });

  // Pontuação e rank por galáxia.
  const galScore: Record<number, number> = {};
  for (const p of all) galScore[p.galaxy] = (galScore[p.galaxy] || 0) + scoreOf(p);
  const galRank: Record<number, number> = {};
  Object.entries(galScore).sort((a, b) => b[1] - a[1]).forEach(([g], i) => { galRank[Number(g)] = i + 1; });

  const gst = await prisma.galaxyState.findUnique({ where: { galaxy } });
  const nowTick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const inSystem = all.filter((p) => p.galaxy === galaxy && p.system === system);
  const byslot = new Map(inSystem.map((p) => [p.slot, p]));
  const tags = await allianceTags(inSystem.map((p) => p.id));

  // Cargo de governo de cada planeta (para colorir o nome): cg/me/mg/md.
  const roleOf = (id: string): string | null =>
    gst?.cgPlanetId === id ? "cg" : gst?.mgPlanetId === id ? "mg" : gst?.mePlanetId === id ? "me" : gst?.mdPlanetId === id ? "md" : null;

  // Raça é SEGREDO: só aparece pro próprio planeta, pro MG desta galáxia, ou
  // pra quem já espionou o alvo (fica salvo). Resto vê "?".
  const viewerGalaxy = viewer?.galaxy ?? null;
  const isMG = !!viewer && gst?.mgPlanetId === viewer.id;
  const spiedRace = new Set<string>();
  if (viewer) {
    const reports = await prisma.spyReport.findMany({ where: { spyPlanetId: viewer.id }, select: { targetCoords: true, targetName: true } });
    reports.forEach((r) => spiedRace.add(`${r.targetCoords}|${r.targetName}`));
  }

  const slots = [];
  for (let slot = 1; slot <= SLOTS_PER_SYSTEM; slot++) {
    const p: any = byslot.get(slot);
    if (!p) { slots.push({ slot, occupied: false }); continue; }
    const idleMs = nowMs - new Date(p.user.lastSeen).getTime();
    // Online/inatividade só visível na própria galáxia; fora dela vem null.
    const sameGalaxy = viewerGalaxy == null || galaxy === viewerGalaxy;
    const showRace = viewer?.id === p.id || isMG || spiedRace.has(`${galaxy}:${system}:${slot}|${p.name}`);
    slots.push({
      slot, occupied: true, planetId: p.id, name: p.name, preposition: p.preposition,
      commander: p.user.username,
      race: showRace ? p.user.race : null,
      raceTag: showRace ? (RACE_TAG[p.user.race] ?? "?") : null,
      role: roleOf(p.id),
      allianceTag: tags[p.id] ?? null,
      roids: p.roidMetalium + p.roidCarbonum + p.roidPlutonium,
      score: scoreOf(p), rank: rankById[p.id],
      online: sameGalaxy ? idleMs < ONLINE_MS : null,
      idleMs: sameGalaxy ? idleMs : null,
      protected: nowTick < p.createdTick + NEWBIE_PROTECTION_TICKS,
    });
  }
  return {
    galaxy, system,
    name: gst?.name ?? null,
    flag: gst?.flag ?? null,
    score: galScore[galaxy] ?? 0,
    rank: galRank[galaxy] ?? null,
    morale: null, // a definir
    slots,
  };
}

// Tráfego: frotas chegando em planetas da MINHA galáxia (consciência defensiva).
// Ataque (de outra galáxia) = vermelho; transporte (reforço/defesa) = verde.
export async function galaxyTraffic(planetId: string) {
  const me = await prisma.planet.findUnique({ where: { id: planetId }, select: { galaxy: true, system: true, slot: true } });
  if (!me) throw new Error("Planeta nao encontrado");
  const nowTick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;

  const fleets = await prisma.fleet.findMany({ where: { targetGalaxy: me.galaxy, status: { in: ["outbound", "engaged"] } } });
  const ownerIds = [...new Set(fleets.map((f) => f.ownerPlanetId))];
  const owners = await prisma.planet.findMany({ where: { id: { in: ownerIds } }, include: { user: { select: { username: true } } } });
  const ownerMap = new Map(owners.map((o) => [o.id, o]));
  const targets = await prisma.planet.findMany({ where: { galaxy: me.galaxy }, select: { system: true, slot: true, name: true } });
  const targetMap = new Map(targets.map((t) => [`${t.system}:${t.slot}`, t.name]));

  const list = fleets.map((f) => {
    const o = ownerMap.get(f.ownerPlanetId);
    return {
      origin: `${f.originGalaxy}:${f.originSystem}:${f.originSlot}`,
      owner: o?.user.username ?? "?",
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      targetName: targetMap.get(`${f.targetSystem}:${f.targetSlot}`) ?? null,
      mission: f.mission,            // "attack" | "transport"
      status: f.status,              // "outbound" | "engaged"
      ships: totalUnits(parseUnits(f.units)),
      ticks: Math.max(0, f.arriveTick - nowTick),
      toMe: f.targetSystem === me.system && f.targetSlot === me.slot,
      own: f.ownerPlanetId === planetId, // frota MINHA (não conta como ameaça/reforço recebido)
    };
  }).sort((a, b) => a.ticks - b.ticks);

  // Movimentação da galáxia: TODAS as frotas em movimento dos planetas da MINHA
  // galáxia (ataque/defesa), agrupadas por planeta dono.
  const galaxyPlanets = await prisma.planet.findMany({ where: { galaxy: me.galaxy }, include: { user: { select: { username: true } } } });
  const pById = new Map(galaxyPlanets.map((p) => [p.id, p]));
  const moving = await prisma.fleet.findMany({
    where: { ownerPlanetId: { in: galaxyPlanets.map((p) => p.id) }, status: { in: ["outbound", "engaged", "returning", "garrison"] } },
  });
  const byOwner = new Map<string, { planet: string; owner: string; coords: string; fleets: any[] }>();
  for (const f of moving) {
    const o = pById.get(f.ownerPlanetId);
    if (!o) continue;
    if (!byOwner.has(o.id)) byOwner.set(o.id, { planet: o.name, owner: o.user.username, coords: `${o.galaxy}:${o.system}:${o.slot}`, fleets: [] });
    byOwner.get(o.id)!.fleets.push({
      name: f.name, mission: f.mission, status: f.status,
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      ships: totalUnits(parseUnits(f.units)),
      ticks: Math.max(0, f.arriveTick - nowTick),
      captured: { metalium: f.capMetalium, carbonum: f.capCarbonum, plutonium: f.capPlutonium },
    });
  }
  const movements = [...byOwner.values()].sort((a, b) => a.coords.localeCompare(b.coords));

  return {
    galaxy: me.galaxy,
    incomingAttacks: list.filter((x) => x.mission === "attack").length,
    incomingToMe: list.filter((x) => x.toMe && x.mission === "attack").length,
    fleets: list,
    movements,
  };
}
