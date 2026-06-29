import { Router } from "express";
import { z } from "zod";
import { prisma, TX_OPTS, withWrite } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { RESOURCES, ROID_PRODUCTION_PER_TICK, nextRoidCost, nextFleetSlotCost, MARKET_FEE, RESOURCE_CAP, NEWBIE_PROTECTION_TICKS, STARTING } from "../game/constants.js";
import { buildRoid, totalRoids } from "../game/roids.js";
import { RACES, isRaceKey, RACE_KEYS } from "../game/races.js";
import { startUpgrade, buildUnit, buildAgent, parseTech, cancelOrder } from "../game/fleet.js";
import { AGENTS, AGENT_KEYS, AGENT_FULL_NAME, isAgentKey, parseAgents, stringifyAgents, isShielded, ceNeeded, spySuccessChance, ROIDS_POR_CE } from "../game/agents.js";
import { createFleet, setFleetComposition, renameFleet, dispatchFleet, fuelCost, viewSystem, galaxyTraffic, type ShipCounts } from "../game/galaxy.js";
import { galaxyId, galaxyDecompose } from "../game/geo.js";
import { recallFleet, BATTLE_TICKS, simulateCombat } from "../game/combat.js";
import { unitsOfRace, isUnitUnlocked, CLASS_LABEL, unitByName, shipImage, radarVisibleCount } from "../game/catalog.js";
import { UNIT_TABLE } from "../game/unitTable.js";
import { associadoView, becomeAssociado, changeName } from "../game/associados.js";
import { autoExile } from "../game/relocation.js";
import { randomBytes } from "node:crypto";
import { createPrivateGalaxy, invitePrivate, joinPrivate, privateView } from "../game/privategalaxy.js";
import { effectiveTec, galaxyPenalty, travelTime } from "../game/travel.js";
import { vote, appoint, setTax, donate, govView, mgFleets, setGalaxyName, setGalaxyFlag, proposeTreaty, acceptTreaty, cancelTreaty } from "../game/governance.js";
import { planetScore } from "../game/score.js";
import { clampMorale, moraleMult } from "../game/morale.js";
import { addNews, recentNews } from "../game/news.js";
import { createAlliance, invitePlayer, acceptInvite, leaveAlliance, kickMember, setMemberRole, allianceView } from "../game/alliance.js";
import { forumIndex, listTopics, createTopic, getTopic, reply as forumReply, isForum } from "../game/forum.js";
import { sendChat, recentChat, resolveRoom } from "../game/chat.js";
import { sendPM, inbox, sentbox, markRead, unreadCount } from "../game/pm.js";
import { SABOTAGES, availableSabotages, executeSabotage, sabotageOdds, sabotageCatalog } from "../game/sabotage.js";
import { parseUnits, totalUnits } from "../game/unitmap.js";
import {
  TECHS, TECH_BY_KEY, levelOf, upgradeCost, upgradeTicks, reqsMet, espionageLevel,
  miningBonus, travelReductionTicks,
} from "../game/tech.js";
import { config } from "../config.js";
import { nextScheduledStart } from "../game/tick.js";
import { clientIp, trackIp, isLinked, MULTI_BLOCK_MSG } from "../game/ipguard.js";
import bcrypt from "bcryptjs";

export const gameRouter = Router();
gameRouter.use(requireAuth);

// Round encerrado: congela AÇÕES (mutações). Leituras (GET) seguem liberadas.
gameRouter.use(async (req, res, next) => {
  if (req.method === "GET") return next();
  try {
    const st = await prisma.gameState.findUnique({ where: { id: 1 } });
    if (st && st.tickNumber >= config.roundTicks) {
      return res.status(403).json({ error: "Round encerrado — aguarde o próximo round." });
    }
  } catch { /* em dúvida, deixa passar */ }
  next();
});

// Monta o "snapshot" do planeta + dados derivados pro front.
async function planetView(userId: string) {
  const planet = await prisma.planet.findUnique({
    where: { userId },
    include: { user: { select: { username: true, race: true, avatar: true, raceRound: true } } },
  });
  if (!planet) return null;
  const state = await prisma.gameState.findUnique({ where: { id: 1 } });
  // Ciclo diário: se o round atual (roundStartAt) != round da última escolha de
  // raça, o player precisa (re)escolher a raça antes de jogar (tela obrigatória).
  const roundStartMs = state?.roundStartAt ? new Date(state.roundStartAt).getTime() : null;
  const raceRoundMs = planet.user.raceRound ? new Date(planet.user.raceRound).getTime() : null;
  const mustChooseRace = roundStartMs != null && raceRoundMs !== roundStartMs;

  const raceKey = isRaceKey(planet.user.race) ? planet.user.race : "humanos";
  const race = RACES[raceKey];
  const tick = state?.tickNumber ?? 0;
  const levels = parseTech(planet.tech);
  const hangar = parseUnits(planet.units);
  const propLevel = travelReductionTicks(levels); // redução de viagem (ticks)
  const bonus = miningBonus(levels);               // bônus FLAT de produção por recurso

  const orders = await prisma.buildOrder.findMany({ where: { planetId: planet.id }, orderBy: { completeTick: "asc" } });
  const myFleets = await prisma.fleet.findMany({ where: { ownerPlanetId: planet.id } });
  // Total de cada nave = base (hangar) + TODAS as frotas (idle/atacando/defendendo).
  const shipTotals: Record<string, number> = { ...hangar };
  for (const f of myFleets) {
    const fu = parseUnits(f.units);
    for (const n of Object.keys(fu)) shipTotals[n] = (shipTotals[n] || 0) + fu[n];
  }
  const score = planetScore(planet, shipTotals); // pontuação canônica

  // Rank global por pontuação canônica (naves + estoque + roids + agentes + evoluções).
  const allP = await prisma.planet.findMany({ select: { id: true, units: true, metalium: true, carbonum: true, plutonium: true, roidMetalium: true, roidCarbonum: true, roidPlutonium: true, agents: true, tech: true } });
  const allF = await prisma.fleet.findMany({ select: { ownerPlanetId: true, units: true } });
  const fleetUnitsBy: Record<string, Record<string, number>> = {};
  for (const f of allF) { const fu = parseUnits(f.units); const m = (fleetUnitsBy[f.ownerPlanetId] ??= {}); for (const n of Object.keys(fu)) m[n] = (m[n] || 0) + fu[n]; }
  const fullScore = (p: typeof allP[number]) => {
    const u: Record<string, number> = { ...parseUnits(p.units) };
    const fl = fleetUnitsBy[p.id] ?? {}; for (const n of Object.keys(fl)) u[n] = (u[n] || 0) + fl[n];
    return planetScore(p, u);
  };
  let rank = 1;
  for (const p of allP) { if (fullScore(p) > score) rank++; }
  const onlineCount = await prisma.user.count({ where: { lastSeen: { gt: new Date(Date.now() - 5 * 60 * 1000) } } });
  const gstate = await prisma.galaxyState.findUnique({ where: { galaxy: galaxyId(planet.galaxy, planet.system) } });
  const cargo = gstate?.cgPlanetId === planet.id ? "Comandante de Galáxia"
    : gstate?.mePlanetId === planet.id ? "Ministro da Economia"
    : gstate?.mgPlanetId === planet.id ? "Ministro de Guerra"
    : gstate?.mdPlanetId === planet.id ? "Ministro da Diplomacia" : null;
  const afford = (c: { metalium: number; carbonum: number; plutonium: number }) =>
    planet.metalium >= c.metalium && planet.carbonum >= c.carbonum && planet.plutonium >= c.plutonium;

  // Tecnologias (Pesquisa + Construcao).
  const techCatalog = TECHS.map((def) => {
    const level = levelOf(levels, def.key);
    const maxed = level >= def.max;
    const cost = maxed ? null : upgradeCost(def, level);
    const ok = reqsMet(def, levels);
    return {
      key: def.key, name: def.name, category: def.category, kind: def.kind, desc: def.desc,
      level, max: def.max, maxed, cost, ticks: maxed ? null : upgradeTicks(def, level),
      reqsMet: ok, requires: def.requires.map((r) => ({ name: TECH_BY_KEY[r.key]?.name ?? r.key, level: r.level })),
      affordable: !!cost && afford(cost),
      canStart: !maxed && ok && !!cost && afford(cost),
    };
  });

  // Catalogo de naves REAIS da raca (tabela oficial).
  const units = unitsOfRace(raceKey).map((u) => ({
    name: u.nome, classe: u.classe, classeLabel: CLASS_LABEL[u.classe], tipo: u.tipo, roider: u.roider,
    img: shipImage(u.nome),
    alvos: u.alvos.map((a) => CLASS_LABEL[a]),
    stats: { ini: u.ini, agi: u.agi, varm: u.varm, qarm: u.qarm, pfog: u.pfog, fusel: u.fusel, rp: u.rp, tec: u.tec, comb: u.comb },
    travelTec: effectiveTec(u.classe, propLevel), // TEC efetivo dentro da galáxia (com propulsão)
    cost: { metalium: u.m, carbonum: u.c, plutonium: u.p },
    ticks: u.ticks,
    count: hangar[u.nome] ?? 0,           // na BASE (pra Frotas usar)
    total: shipTotals[u.nome] ?? 0,       // base + todas as frotas
    unlocked: isUnitUnlocked(raceKey, u, levels),
    captured: false,
  }));

  // Naves CAPTURADAS/assimiladas: de OUTRA raça (na base ou em frotas). Aparecem
  // pra você ver e CARREGAR em frotas (não dá pra construir — não é sua raça).
  const ownNames = new Set(unitsOfRace(raceKey).map((u) => u.nome));
  for (const name of Object.keys(shipTotals)) {
    if ((shipTotals[name] ?? 0) <= 0 || ownNames.has(name)) continue;
    const u = unitByName(name);
    if (!u) continue;
    units.push({
      name: u.nome, classe: u.classe, classeLabel: CLASS_LABEL[u.classe], tipo: u.tipo, roider: u.roider,
      img: shipImage(u.nome),
      alvos: u.alvos.map((a) => CLASS_LABEL[a]),
      stats: { ini: u.ini, agi: u.agi, varm: u.varm, qarm: u.qarm, pfog: u.pfog, fusel: u.fusel, rp: u.rp, tec: u.tec, comb: u.comb },
      travelTec: effectiveTec(u.classe, propLevel),
      cost: { metalium: u.m, carbonum: u.c, plutonium: u.p },
      ticks: u.ticks,
      count: hangar[name] ?? 0,
      total: shipTotals[name] ?? 0,
      unlocked: false,
      captured: true,
    });
  }

  const queue = orders.map((o) => ({
    id: o.id, kind: o.kind, shipClass: o.shipClass, key: o.techKey ?? null,
    // research | building (pra distinguir pesquisa de construção na fila) | null p/ naves
    techKind: o.kind === "tech" ? (TECH_BY_KEY[o.techKey ?? ""]?.kind ?? null) : null,
    label: o.kind === "ship" && o.shipClass
      ? `${o.quantity}x ${o.shipClass}`
      : o.kind === "agent" && o.shipClass
      ? `${o.quantity}x ${AGENTS[o.shipClass as keyof typeof AGENTS]?.name ?? o.shipClass}`
      : `${TECH_BY_KEY[o.techKey ?? ""]?.name ?? o.techKey} (nv ${o.targetLevel})`,
    quantity: o.quantity,
    ticksRemaining: Math.max(0, o.completeTick - tick),
  }));

  const roids = { metalium: planet.roidMetalium, carbonum: planet.roidCarbonum, plutonium: planet.roidPlutonium, total: totalRoids(planet) };

  return {
    commander: planet.user.username,
    commanderAvatar: planet.user.avatar ?? null,
    commanderTitle: `${planet.user.username} ${planet.preposition} ${planet.name}`,
    race: { key: race.key, name: race.name, tagline: race.tagline, lore: race.lore, traits: race.traits, img: `/art/races/${race.key}.png` },
    planet: {
      id: planet.id, name: planet.name, coords: `${planet.galaxy}:${planet.system}:${planet.slot}`,
      resources: { metalium: planet.metalium, carbonum: planet.carbonum, plutonium: planet.plutonium },
      roids,
      productionPerTick: {
        metalium: roids.metalium * ROID_PRODUCTION_PER_TICK + bonus.metalium,
        carbonum: roids.carbonum * ROID_PRODUCTION_PER_TICK + bonus.carbonum,
        plutonium: roids.plutonium * ROID_PRODUCTION_PER_TICK + bonus.plutonium,
      },
      // Custo (em METALIUM) do próximo roid de CADA recurso — canon original.
      nextRoidCost: {
        metalium: nextRoidCost("metalium", planet.roidMetalium).metalium,
        carbonum: nextRoidCost("carbonum", planet.roidCarbonum).metalium,
        plutonium: nextRoidCost("plutonium", planet.roidPlutonium).metalium,
      },
      miningBonus: bonus, travelReduction: propLevel,
      score, rank, cargo,
      fleetSlots: planet.fleetSlots, fleetsActive: myFleets.length,
      nextFleetSlotCost: nextFleetSlotCost(planet.fleetSlots),
      autoExiles: planet.autoExiles,
      morale: clampMorale(planet.morale),
      moralePct: Math.round(moraleMult(planet.morale) * 100), // % de produção pela moral
      protection: {
        active: tick < planet.createdTick + NEWBIE_PROTECTION_TICKS,
        ticksLeft: Math.max(0, planet.createdTick + NEWBIE_PROTECTION_TICKS - tick),
      },
    },
    agents: (() => {
      const a = parseAgents(planet.agents);
      const myCE = a["CE"] ?? 0;
      const need = ceNeeded(roids.total, raceKey);
      return {
        counts: a,
        protection: { ce: myCE, needed: need, shielded: myCE >= need, roids: roids.total, roidsPerCE: ROIDS_POR_CE },
      };
    })(),
    onlineCount,
    admin: config.adminUsers.includes(planet.user.username.toLowerCase()),
    tech: techCatalog,
    units,
    queue,
    effects: { espionage: espionageLevel(levels) },
    mustChooseRace,
    game: {
      tickNumber: tick, lastTickAt: state?.lastTickAt ?? null, tickIntervalSeconds: config.tickIntervalSeconds,
      roundTicks: config.roundTicks, roundEnded: tick >= config.roundTicks,
      roundStartAt: state?.roundStartAt ?? null,
      nextRoundStartAt: roundStartMs != null ? new Date(nextScheduledStart(roundStartMs)) : null,
    },
  };
}

gameRouter.get("/me", async (req: AuthedRequest, res) => {
  await withWrite(() => prisma.user.update({ where: { id: req.userId! }, data: { lastSeen: new Date() } })).catch(() => {});
  trackIp(req.userId!, clientIp(req)); // anti multi-conta (1 escrita por IP/processo)
  const view = await planetView(req.userId!);
  if (!view) return res.status(404).json({ error: "Planeta nao encontrado" });
  res.json(view);
});

const buildSchema = z.object({ resource: z.enum(["metalium", "carbonum", "plutonium"]) });
gameRouter.post("/roids/build", async (req: AuthedRequest, res) => {
  const parsed = buildSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Recurso invalido" });
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await buildRoid(planet.id, parsed.data.resource); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao produzir roid" }); }
  res.json(await planetView(req.userId!));
});

const upgradeSchema = z.object({ key: z.string() });
gameRouter.post("/upgrade", async (req: AuthedRequest, res) => {
  const parsed = upgradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await startUpgrade(planet.id, parsed.data.key); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha no upgrade" }); }
  res.json(await planetView(req.userId!));
});

// Cancela um item da fila (reembolso proporcional ao tempo restante).
gameRouter.post("/queue/:id/cancel", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await cancelOrder(planet.id, req.params.id); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao cancelar" }); }
  res.json(await planetView(req.userId!));
});

const buildUnitSchema = z.object({ name: z.string(), quantity: z.number().int().min(1).max(100_000_000) });
gameRouter.post("/units/build", async (req: AuthedRequest, res) => {
  const parsed = buildUnitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await buildUnit(planet.id, parsed.data.name, parsed.data.quantity); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha na construcao" }); }
  res.json(await planetView(req.userId!));
});

// ===== Galaxia & frotas =====
gameRouter.get("/galaxy/:galaxy/:system", async (req: AuthedRequest, res) => {
  const galaxy = Number(req.params.galaxy), system = Number(req.params.system);
  if (!Number.isInteger(galaxy) || !Number.isInteger(system) || galaxy < 1 || system < 1) {
    return res.status(400).json({ error: "Coordenadas invalidas" });
  }
  const me = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  // Online/inatividade só na própria galáxia; raça é segredo (própria/MG/espionada).
  const view: any = await viewSystem(galaxy, system, me ? { id: me.id, galaxy: me.galaxy, system: me.system } : null);
  // Agentes que EU posso USAR aqui: precisa ter PESQUISADO o tipo E ter pelo menos
  // 1 TREINADO (espionar gasta 1). Sem treinar, o botão fica desabilitado.
  const lvl = me ? espionageLevel(parseTech(me.tech)) : 0;
  const myAgents = me ? parseAgents(me.agents) : {};
  const usable = (k: string, need: number) => lvl >= need && (myAgents[k] ?? 0) >= 1;
  view.agents = { P: usable("P", 2), M: usable("M", 3), T: usable("T", 4), D: usable("D", 5) };
  res.json(view);
});

gameRouter.get("/fleets", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  const state = await prisma.gameState.findUnique({ where: { id: 1 } });
  const tick = state?.tickNumber ?? 0;
  const prop = levelOf(parseTech(planet.tech), "propulsao");
  const fleets = await prisma.fleet.findMany({ where: { ownerPlanetId: planet.id }, orderBy: { name: "asc" } });
  const out = fleets.map((f) => {
    const units = parseUnits(f.units);
    const myGalId = galaxyId(planet.galaxy, planet.system);
    const tecBase = travelTime(myGalId, myGalId, units, prop); // TEC da frota (penalidade 0)
    return {
      id: f.id, name: f.name, mission: f.mission, status: f.status, idle: f.status === "idle",
      origin: `${f.originGalaxy}:${f.originSystem}:${f.originSlot}`,
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      units, totalShips: totalUnits(units),
      ticksRemaining: f.status === "engaged" ? Math.max(0, BATTLE_TICKS - f.battleTicksDone) : Math.max(0, f.arriveTick - tick),
      captured: { metalium: f.capMetalium, carbonum: f.capCarbonum, plutonium: f.capPlutonium },
      canRecall: f.status === "outbound" || f.status === "engaged",
      // Tempo/custo de viagem por distância (Galáxia / Setor-Paralelo / Universo)
      travel: { galaxia: tecBase, setor: tecBase + 2, universo: tecBase + 4, fuel: fuelCost(units) },
    };
  });
  res.json({ fleets: out });
});

// Tráfego: frotas chegando na sua galáxia (ataques/defesas).
gameRouter.get("/traffic", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  res.json(await galaxyTraffic(planet.id));
});

gameRouter.post("/fleets/:id/recall", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  const state = await prisma.gameState.findUnique({ where: { id: 1 } });
  try { await recallFleet(req.params.id, planet.id, state?.tickNumber ?? 0); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao recuar" }); }
  res.json({ ok: true });
});

// Cria uma frota persistente (paga, custo ×5, máx 5).
gameRouter.post("/fleets/create", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await createFleet(planet.id); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao criar frota" }); }
  res.json(await planetView(req.userId!));
});

// Carrega/descarrega naves de uma frota idle (define a composição desejada).
const loadSchema = z.object({ units: z.record(z.string(), z.number().int().min(0)) });
gameRouter.post("/fleets/:id/load", async (req: AuthedRequest, res) => {
  const parsed = loadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await setFleetComposition(planet.id, req.params.id, parsed.data.units as ShipCounts); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao carregar" }); }
  res.json(await planetView(req.userId!));
});

gameRouter.post("/fleets/:id/rename", async (req: AuthedRequest, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await renameFleet(planet.id, req.params.id, name); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao renomear" }); }
  res.json({ ok: true });
});

// Envia uma frota idle (já carregada) a um destino.
const dispatchSchema = z.object({
  galaxy: z.number().int().min(1), system: z.number().int().min(1), slot: z.number().int().min(1),
  mission: z.enum(["attack", "transport"]),
  ticks: z.number().int().min(1).max(3).optional(),
  fake: z.boolean().optional(),
});
gameRouter.post("/fleets/:id/dispatch", async (req: AuthedRequest, res) => {
  const parsed = dispatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const { galaxy, system, slot, mission, ticks, fake } = parsed.data;
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  // Anti multi-conta: não pode atacar/defender um planeta de conta do mesmo IP.
  const target = await prisma.planet.findUnique({ where: { galaxy_system_slot: { galaxy, system, slot } }, select: { userId: true } });
  if (target && target.userId !== req.userId && (await isLinked(req.userId!, target.userId))) {
    return res.status(403).json({ error: MULTI_BLOCK_MSG });
  }
  try { await dispatchFleet(planet.id, req.params.id, { galaxy, system, slot }, mission, ticks ?? 3, !!fake); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao enviar frota" }); }
  res.json({ ok: true });
});

// Penalidade de distância (TEC) até uma galáxia. O cliente soma o TEC da frota selecionada.
gameRouter.get("/travel/:galaxy/:system/:slot", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  res.json({ penalty: galaxyPenalty(galaxyId(planet.galaxy, planet.system), galaxyId(Number(req.params.galaxy), Number(req.params.system))) });
});

// ===== Treino de agentes de inteligência =====
gameRouter.get("/agents", async (req: AuthedRequest, res) => {
  const me = await prisma.planet.findUnique({ where: { userId: req.userId! }, include: { user: { select: { race: true } } } });
  if (!me) return res.status(404).json({ error: "Planeta nao encontrado" });
  const lvl = espionageLevel(parseTech(me.tech));
  const counts = parseAgents(me.agents);
  const raceKey = isRaceKey(me.user.race) ? me.user.race : "humanos";
  const myRoids = me.roidMetalium + me.roidCarbonum + me.roidPlutonium;
  const myCE = counts["CE"] ?? 0;
  const need = ceNeeded(myRoids, raceKey);
  const orders = await prisma.buildOrder.findMany({ where: { planetId: me.id, kind: "agent" }, orderBy: { completeTick: "asc" } });
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  res.json({
    catalog: AGENT_KEYS.map((k) => {
      const d = AGENTS[k];
      return { key: k, name: d.name, desc: d.desc, level: d.level, offensive: d.offensive,
        cost: { metalium: d.m, carbonum: d.c, plutonium: d.p }, ticks: d.ticks,
        unlocked: lvl >= d.level, count: counts[k] ?? 0 };
    }),
    protection: { ce: myCE, needed: need, shielded: myCE >= need, roids: myRoids, roidsPerCE: ROIDS_POR_CE },
    training: orders.map((o) => ({ id: o.id, key: o.shipClass, quantity: o.quantity, ticksRemaining: Math.max(0, o.completeTick - tick) })),
  });
});

const buildAgentSchema = z.object({ key: z.string(), quantity: z.number().int().min(1).max(1_000_000) });
gameRouter.post("/agents/build", async (req: AuthedRequest, res) => {
  const parsed = buildAgentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await buildAgent(planet.id, parsed.data.key, parsed.data.quantity); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha no treino" }); }
  res.json(await planetView(req.userId!));
});

// Espionagem por AGENTE: P(padrão) M(militar) T(transmissão) D(duplo).
// Gasta 1 agente do tipo (dê certo ou não). Sucesso é DETERMINÍSTICO: o alvo
// está protegido se CE × 2 ≥ roids do alvo (Rakshasa: CE +30%).
const spySchema = z.object({
  galaxy: z.number().int().min(1), system: z.number().int().min(1), slot: z.number().int().min(1).max(15),
  agent: z.enum(["P", "M", "T", "D"]),
});
gameRouter.post("/spy", async (req: AuthedRequest, res) => {
  const parsed = spySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  try {
  const me = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!me) return res.status(404).json({ error: "Planeta nao encontrado" });
  const lvl = espionageLevel(parseTech(me.tech));
  const { galaxy, system, slot, agent } = parsed.data;
  if (lvl < AGENTS[agent].level) return res.status(400).json({ error: `Pesquise mais Inteligência para o agente ${agent}` });

  // Precisa ter o agente treinado. Gasta 1 (dê certo ou não).
  const myAgents = parseAgents(me.agents);
  if ((myAgents[agent] ?? 0) < 1) return res.status(400).json({ error: `Você não tem agentes ${agent} treinados (treine na Inteligência)` });

  const target = await prisma.planet.findUnique({ where: { galaxy_system_slot: { galaxy, system, slot } }, include: { user: { select: { username: true, race: true, lastSeen: true } } } });
  if (!target) return res.status(404).json({ error: "Nenhum planeta nessas coordenadas" });
  if (target.id === me.id) return res.status(400).json({ error: "Você não espiona o próprio planeta" });
  const raceKey = isRaceKey(target.user.race) ? target.user.race : "humanos";

  // Consome 1 agente do tipo, sempre.
  myAgents[agent] = (myAgents[agent] ?? 0) - 1;
  await prisma.planet.update({ where: { id: me.id }, data: { agents: stringifyAgents(myAgents) } });

  // Sucesso = disputa AE (do espião) × AC (do alvo), pesada pelos roids do alvo.
  const tkNow = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const tgtAgents = parseAgents(target.agents);
  const tgtCE = tgtAgents["CE"] ?? 0;
  const tgtRoids = target.roidMetalium + target.roidCarbonum + target.roidPlutonium;
  const myAE = myAgents["AE"] ?? 0;
  const myCoords = `${me.galaxy}:${me.system}:${me.slot}`;
  const succ = spySuccessChance(myAE, tgtCE, tgtRoids, target.user.race);
  if (Math.random() > succ) {
    await addNews(target.id, tkNow, `🛡️ Sua contra-espionagem barrou um ${AGENT_FULL_NAME[agent]} de ${myCoords}`);
    return res.json({ failed: true, error: `Espionagem barrada (chance de sucesso ${Math.round(succ * 100)}% — seu AE ${myAE} vs AC ${tgtCE} do alvo). Perdeu 1 agente ${agent} — treine mais AE.` });
  }
  const units = parseUnits(target.units);
  const intel: any = { agent, coords: `${galaxy}:${system}:${slot}`, name: target.name, commander: target.user.username, race: RACES[raceKey].name };

  if (agent === "P") {
    // Padrão: raça, pontuação, recursos em estoque, roids e qtd TOTAL de naves.
    intel.score = planetScore(target, units);
    intel.morale = clampMorale(target.morale);
    intel.resources = { metalium: target.metalium, carbonum: target.carbonum, plutonium: target.plutonium };
    intel.roids = { metalium: target.roidMetalium, carbonum: target.roidCarbonum, plutonium: target.roidPlutonium };
    // Rakshasa: invisíveis não contam — só roiders. Demais raças: total normal.
    intel.totalShips = radarVisibleCount(units);
    intel.online = Date.now() - new Date(target.user.lastSeen).getTime() < 5 * 60 * 1000;
  } else if (agent === "M") {
    // Militar: QUAIS e quantas naves — TODAS do alvo (base + todas as frotas,
    // inclusive em trânsito). Rakshasa: só roiders aparecem.
    const fleets = await prisma.fleet.findMany({ where: { ownerPlanetId: target.id }, select: { units: true } });
    const all: Record<string, number> = { ...units };
    for (const f of fleets) {
      const fu = parseUnits(f.units);
      for (const n of Object.keys(fu)) all[n] = (all[n] || 0) + fu[n];
    }
    const u = raceKey === "rakshasa" ? Object.fromEntries(Object.entries(all).filter(([n]) => unitByName(n)?.roider)) : all;
    intel.ships = Object.keys(u).map((name) => ({ name, count: u[name] }));
  } else if (agent === "T") {
    // Transmissão: notícias recentes do alvo.
    intel.news = (await recentNews(target.id, 20)).map((n) => `#${n.tick} ${n.message}`);
  } else if (agent === "D") {
    // Duplo: frotas do alvo AGORA (estado atual). Frota parada (idle) aparece
    // como "na base" — sem o destino/missão do último ataque (lixo antigo).
    const state = await prisma.gameState.findUnique({ where: { id: 1 } });
    const tick = state?.tickNumber ?? 0;
    const STATUS_PT: Record<string, string> = { idle: "na base", outbound: "indo", engaged: "em combate", returning: "voltando", garrison: "guarnição" };
    const fleets = await prisma.fleet.findMany({ where: { ownerPlanetId: target.id } });
    intel.fleets = fleets
      .filter((f) => Object.values(parseUnits(f.units)).reduce((a, b) => a + b, 0) > 0) // ignora frotas vazias
      .map((f) => {
        const moving = f.status !== "idle";
        return {
          name: f.name,
          mission: moving ? f.mission : "—",
          status: STATUS_PT[f.status] ?? f.status,
          target: moving ? `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}` : "—",
          ticksRemaining: moving ? (f.status === "engaged" ? Math.max(0, BATTLE_TICKS - f.battleTicksDone) : Math.max(0, f.arriveTick - tick)) : 0,
          units: parseUnits(f.units),
        };
      });
    intel.base = units; // naves que ficaram na base
  }
  // O alvo é notificado da espionagem (com a coordenada do espião — assim, via
  // agente T, dá pra ver quem andou espionando o alvo).
  const tk = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const hash = randomBytes(6).toString("hex").toUpperCase();
  // Notificar o alvo e salvar o relatório são SECUNDÁRIOS: se falharem, ainda
  // devolvemos o intel (não trava a espionagem por causa disso).
  try {
    await addNews(target.id, tk, `🛰️ Você foi espionado (${AGENT_FULL_NAME[agent]}) por ${myCoords}`);
    await prisma.spyReport.create({ data: {
      hash, spyPlanetId: me.id, targetName: target.name, targetCoords: `${target.galaxy}:${target.system}:${target.slot}`,
      agent, tick: tk, data: JSON.stringify(intel),
    } });
  } catch (e) { console.error("[spy] aviso/relatório falhou (intel devolvido mesmo assim):", e); }
  res.json({ intel, hash });
  } catch (e: any) {
    console.error("[spy] erro:", e);
    return res.status(500).json({ error: `Falha na espionagem: ${e?.message ?? e}` });
  }
});

// Histórico de espionagem (Visualizar Espionagem).
gameRouter.get("/spy-reports", async (req: AuthedRequest, res) => {
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  const reports = await prisma.spyReport.findMany({ where: { spyPlanetId: planet.id }, orderBy: { createdAt: "desc" }, take: 50 });
  res.json({ reports: reports.map((r) => ({ id: r.id, hash: r.hash, targetName: r.targetName, targetCoords: r.targetCoords, agent: r.agent, tick: r.tick, intel: JSON.parse(r.data) })) });
});

// Abrir uma espionagem por código (qualquer jogador com o hash pode ver).
gameRouter.get("/spy/lookup/:hash", async (req: AuthedRequest, res) => {
  const r = await prisma.spyReport.findUnique({ where: { hash: req.params.hash.trim().toUpperCase() } });
  if (!r) return res.status(404).json({ error: "Código não encontrado" });
  res.json({ hash: r.hash, targetName: r.targetName, targetCoords: r.targetCoords, agent: r.agent, tick: r.tick, intel: JSON.parse(r.data) });
});

// Notícias do meu planeta.
gameRouter.get("/news", async (req: AuthedRequest, res) => {
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  res.json({ news: await recentNews(planet.id) });
});

// ===== Governo da galáxia (CG, ministros, imposto, fundo) =====
async function myPlanet(userId: string) {
  return prisma.planet.findUnique({ where: { userId } });
}

gameRouter.get("/galaxy/gov", async (req: AuthedRequest, res) => {
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  res.json(await govView(planet.id));
});

gameRouter.post("/galaxy/vote", async (req: AuthedRequest, res) => {
  const parsed = z.object({ candidatePlanetId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await vote(planet.id, parsed.data.candidatePlanetId); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao votar" }); }
  res.json(await govView(planet.id));
});

gameRouter.post("/galaxy/appoint", async (req: AuthedRequest, res) => {
  const parsed = z.object({ role: z.enum(["me", "mg", "md"]), planetId: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await appoint(planet.id, parsed.data.role, parsed.data.planetId); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao nomear" }); }
  res.json(await govView(planet.id));
});

gameRouter.post("/galaxy/tax", async (req: AuthedRequest, res) => {
  const parsed = z.object({ rate: z.number().int().min(0).max(50) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Taxa invalida" });
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await setTax(planet.id, parsed.data.rate); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await govView(planet.id));
});

gameRouter.post("/galaxy/donate", async (req: AuthedRequest, res) => {
  const parsed = z.object({ toPlanetId: z.string(), metalium: z.number().int().min(0), carbonum: z.number().int().min(0), plutonium: z.number().int().min(0) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await donate(planet.id, parsed.data.toPlanetId, parsed.data); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao doar" }); }
  res.json(await govView(planet.id));
});

gameRouter.post("/galaxy/name", async (req: AuthedRequest, res) => {
  const parsed = z.object({ name: z.string().min(1).max(40) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Nome invalido" });
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await setGalaxyName(planet.id, parsed.data.name); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await govView(planet.id));
});

gameRouter.post("/galaxy/flag", async (req: AuthedRequest, res) => {
  const parsed = z.object({ image: z.string().max(80000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Imagem invalida" });
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await setGalaxyFlag(planet.id, parsed.data.image); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await govView(planet.id));
});

// Diplomacia (MD): tratados de não-agressão entre galáxias.
gameRouter.post("/galaxy/treaty/:action", async (req: AuthedRequest, res) => {
  const parsed = z.object({ otherGalaxy: z.number().int().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  const fn = req.params.action === "propose" ? proposeTreaty : req.params.action === "accept" ? acceptTreaty : req.params.action === "cancel" ? cancelTreaty : null;
  if (!fn) return res.status(400).json({ error: "Acao invalida" });
  try { await fn(planet.id, parsed.data.otherGalaxy); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await govView(planet.id));
});

gameRouter.get("/galaxy/mg-fleets", async (req: AuthedRequest, res) => {
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { res.json({ fleets: await mgFleets(planet.id) }); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
});

// ===== Alianças =====
gameRouter.get("/alliance", async (req: AuthedRequest, res) => {
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  res.json(await allianceView(planet.id));
});

async function allianceAction(req: AuthedRequest, res: any, fn: (planetId: string) => Promise<any>) {
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await fn(planet.id); } catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await allianceView(planet.id));
}

gameRouter.post("/alliance/create", (req: AuthedRequest, res) => {
  const p = z.object({ name: z.string(), tag: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  return allianceAction(req, res, (id) => createAlliance(id, p.data.name, p.data.tag));
});
gameRouter.post("/alliance/invite", async (req: AuthedRequest, res) => {
  const p = z.object({ username: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  // Anti multi-conta: não pode convidar uma conta do mesmo IP pra sua aliança.
  const target = await prisma.user.findUnique({ where: { username: p.data.username }, select: { id: true } });
  if (target && (await isLinked(req.userId!, target.id))) return res.status(403).json({ error: MULTI_BLOCK_MSG });
  return allianceAction(req, res, (id) => invitePlayer(id, p.data.username));
});
gameRouter.post("/alliance/accept", async (req: AuthedRequest, res) => {
  const p = z.object({ allianceId: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  // Anti multi-conta: não pode entrar numa aliança que contenha conta do mesmo IP.
  const members = await prisma.allianceMember.findMany({ where: { allianceId: p.data.allianceId }, select: { planetId: true } });
  if (members.length) {
    const owners = await prisma.planet.findMany({ where: { id: { in: members.map((m) => m.planetId) } }, select: { userId: true } });
    for (const o of owners) {
      if (await isLinked(req.userId!, o.userId)) return res.status(403).json({ error: MULTI_BLOCK_MSG });
    }
  }
  return allianceAction(req, res, (id) => acceptInvite(id, p.data.allianceId));
});
gameRouter.post("/alliance/leave", (req: AuthedRequest, res) => allianceAction(req, res, (id) => leaveAlliance(id)));
gameRouter.post("/alliance/kick", (req: AuthedRequest, res) => {
  const p = z.object({ planetId: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  return allianceAction(req, res, (id) => kickMember(id, p.data.planetId));
});
gameRouter.post("/alliance/role", (req: AuthedRequest, res) => {
  const p = z.object({ planetId: z.string(), role: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  return allianceAction(req, res, (id) => setMemberRole(id, p.data.planetId, p.data.role));
});

// ===== Sabotagem =====
gameRouter.get("/sabotage", async (req: AuthedRequest, res) => {
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  const available = availableSabotages(planet.tech);
  res.json({ all: SABOTAGES, available });
});
gameRouter.post("/sabotage", async (req: AuthedRequest, res) => {
  const p = z.object({ galaxy: z.number().int().min(1), system: z.number().int().min(1), slot: z.number().int().min(1).max(15), key: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  const planet = await myPlanet(req.userId!);
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try {
    const r = await executeSabotage(planet.id, { galaxy: p.data.galaxy, system: p.data.system, slot: p.data.slot }, p.data.key);
    res.json(r);
  } catch (e: any) { res.status(400).json({ error: e.message ?? "Falha" }); }
});

// ===== Mensagem privada =====
// Contagem leve de não-lidas (pra destacar o ícone no menu/abas).
gameRouter.get("/pm/unread", async (req: AuthedRequest, res) => {
  res.json({ unread: await unreadCount(req.userId!) });
});
gameRouter.get("/pm", async (req: AuthedRequest, res) => {
  res.json({ inbox: await inbox(req.userId!), sent: await sentbox(req.userId!), unread: await unreadCount(req.userId!) });
});
gameRouter.post("/pm", async (req: AuthedRequest, res) => {
  const p = z.object({ to: z.string(), subject: z.string().optional(), body: z.string(), anonymous: z.boolean().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  try { await sendPM(req.userId!, await myName(req.userId!), p.data.to, p.data.subject ?? "", p.data.body, !!p.data.anonymous); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json({ inbox: await inbox(req.userId!), sent: await sentbox(req.userId!), unread: await unreadCount(req.userId!) });
});
gameRouter.post("/pm/:id/read", async (req: AuthedRequest, res) => {
  await markRead(req.userId!, req.params.id);
  res.json({ ok: true });
});

// ===== Fórum =====
async function myName(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  return u?.username ?? "?";
}

gameRouter.get("/forum", async (_req, res) => res.json({ forums: await forumIndex() }));

// Garante que, num fórum de galáxia (gal-<n>), o jogador é daquela galáxia.
async function galaxyForumOk(userId: string, key: string): Promise<boolean> {
  const m = key.match(/^gal-(\d+)$/);
  if (!m) return true; // fórum universal
  const planet = await prisma.planet.findUnique({ where: { userId } });
  return !!planet && galaxyId(planet.galaxy, planet.system) === Number(m[1]);
}

gameRouter.get("/forum/topics/:key", async (req: AuthedRequest, res) => {
  if (!isForum(req.params.key)) return res.status(404).json({ error: "Fórum inválido" });
  if (!(await galaxyForumOk(req.userId!, req.params.key))) return res.status(403).json({ error: "Fórum de outra galáxia" });
  res.json({ topics: await listTopics(req.params.key) });
});

gameRouter.post("/forum/topics/:key", async (req: AuthedRequest, res) => {
  const p = z.object({ title: z.string(), body: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  if (!(await galaxyForumOk(req.userId!, req.params.key))) return res.status(403).json({ error: "Fórum de outra galáxia" });
  try {
    const id = await createTopic(req.userId!, await myName(req.userId!), req.params.key, p.data.title, p.data.body);
    res.json({ id });
  } catch (e: any) { res.status(400).json({ error: e.message ?? "Falha" }); }
});

// ===== Chat (salas: universo | galaxia | alianca) =====
gameRouter.get("/chat/:room", async (req: AuthedRequest, res) => {
  const room = await resolveRoom(req.userId!, req.params.room);
  if (!room) return res.status(400).json({ error: "Sala indisponível (entre numa aliança?)" });
  res.json({ label: room.label, messages: await recentChat(room.key) });
});
gameRouter.post("/chat/:room", async (req: AuthedRequest, res) => {
  const p = z.object({ body: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  const room = await resolveRoom(req.userId!, req.params.room);
  if (!room) return res.status(400).json({ error: "Sala indisponível" });
  try { await sendChat(room.key, await myName(req.userId!), p.data.body); res.json({ label: room.label, messages: await recentChat(room.key) }); }
  catch (e: any) { res.status(400).json({ error: e.message ?? "Falha" }); }
});

gameRouter.get("/forum/topic/:id", async (req, res) => {
  const t = await getTopic(req.params.id);
  if (!t) return res.status(404).json({ error: "Tópico não encontrado" });
  res.json(t);
});

gameRouter.post("/forum/topic/:id/reply", async (req: AuthedRequest, res) => {
  const p = z.object({ body: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  try { await forumReply(req.userId!, await myName(req.userId!), req.params.id, p.data.body); res.json({ ok: true }); }
  catch (e: any) { res.status(400).json({ error: e.message ?? "Falha" }); }
});

// ===== Combates =====
gameRouter.get("/combats", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  const reports = await prisma.battleReport.findMany({
    where: { OR: [{ attackerPlanetId: planet.id }, { defenderPlanetId: planet.id }] },
    orderBy: { tick: "desc" }, take: 50,
  });
  const out = reports.map((r) => {
    const iAmAttacker = r.attackerPlanetId === planet.id;
    const detail = JSON.parse(r.report);
    const sumLost = (rows: { lost: number }[]) => rows.reduce((s, x) => s + x.lost, 0);
    return {
      id: r.id, tick: r.tick, role: iAmAttacker ? "attacker" : "defender",
      opponent: iAmAttacker ? r.defenderName : r.attackerName,
      opponentCoords: iAmAttacker ? r.defenderCoords : r.attackerCoords,
      myLost: sumLost(iAmAttacker ? detail.attacker : detail.defender),
      oppLost: sumLost(iAmAttacker ? detail.defender : detail.attacker),
      captured: { metalium: r.capturedMetalium, carbonum: r.capturedCarbonum, plutonium: r.capturedPlutonium },
    };
  });
  res.json({ combats: out });
});

gameRouter.get("/combats/:id", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  const r = await prisma.battleReport.findUnique({ where: { id: req.params.id } });
  if (!r || (r.attackerPlanetId !== planet.id && r.defenderPlanetId !== planet.id)) {
    return res.status(404).json({ error: "Relatorio nao encontrado" });
  }
  res.json({
    id: r.id, tick: r.tick, attackerName: r.attackerName, defenderName: r.defenderName,
    attackerCoords: r.attackerCoords, defenderCoords: r.defenderCoords,
    iAmAttacker: r.attackerPlanetId === planet.id, detail: JSON.parse(r.report),
  });
});

gameRouter.get("/ranking", async (_req, res) => {
  const planets = await prisma.planet.findMany({ include: { user: { select: { username: true } } } });
  const ranked = planets
    .map((p) => ({
      username: p.user.username,
      planet: p.name, coords: `${p.galaxy}:${p.system}:${p.slot}`, roids: totalRoids(p),
    }))
    .sort((a, b) => b.roids - a.roids).slice(0, 50);
  res.json({ ranking: ranked });
});

// Mercado Negro: troca um recurso por outro com taxa de MARKET_FEE (recebe 1 - taxa).
const marketSchema = z.object({
  from: z.enum(["metalium", "carbonum", "plutonium"]),
  to: z.enum(["metalium", "carbonum", "plutonium"]),
  amount: z.number().int().min(1),
});
gameRouter.post("/market/trade", async (req: AuthedRequest, res) => {
  const parsed = marketSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const { from, to, amount } = parsed.data;
  if (from === to) return res.status(400).json({ error: "Escolha recursos diferentes" });
  try {
    await prisma.$transaction(async (tx) => {
      const planet = await tx.planet.findUnique({ where: { userId: req.userId! } });
      if (!planet) throw new Error("Planeta nao encontrado");
      if ((planet as any)[from] < amount) throw new Error("Recurso insuficiente para a troca");
      const received = Math.floor(amount * (1 - MARKET_FEE));
      const data: any = {};
      data[from] = { decrement: amount };
      data[to] = Math.min(RESOURCE_CAP, (planet as any)[to] + received); // respeita o teto
      await tx.planet.update({ where: { id: planet.id }, data });
    }, TX_OPTS);
  } catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha na troca" }); }
  res.json(await planetView(req.userId!));
});

// ===== Minha Conta (perfil editável) =====
const MAX_AVATAR_BYTES = 80000; // ~80KB (data URL base64)

gameRouter.get("/account", async (req: AuthedRequest, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { email: true, username: true, whatsapp: true, pixKey: true, avatar: true },
  });
  if (!u) return res.status(404).json({ error: "Usuario nao encontrado" });
  res.json(u);
});

// Atualiza contato/premiação/avatar. Campos ausentes não são alterados;
// string vazia limpa o campo.
const profileSchema = z.object({
  whatsapp: z.string().max(30).optional(),
  pixKey: z.string().max(80).optional(),
  avatar: z.string().max(MAX_AVATAR_BYTES).optional(),
});
gameRouter.post("/account/profile", async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos (avatar muito grande?)" });
  const { whatsapp, pixKey, avatar } = parsed.data;
  const data: any = {};
  if (whatsapp !== undefined) data.whatsapp = whatsapp.trim() || null;
  if (pixKey !== undefined) data.pixKey = pixKey.trim() || null;
  if (avatar !== undefined) {
    const v = avatar.trim();
    if (v && !/^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(v)) return res.status(400).json({ error: "Imagem inválida" });
    data.avatar = v || null;
  }
  await prisma.user.update({ where: { id: req.userId! }, data });
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: { email: true, username: true, whatsapp: true, pixKey: true, avatar: true } });
  res.json(u);
});

// Trocar o e-mail (confirma a senha + checa unicidade).
gameRouter.post("/account/email", async (req: AuthedRequest, res) => {
  const parsed = z.object({ password: z.string(), email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "E-mail inválido" });
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "Usuario nao encontrado" });
  if (!(await bcrypt.compare(parsed.data.password, user.password))) return res.status(400).json({ error: "Senha incorreta" });
  const email = parsed.data.email.toLowerCase().trim();
  const taken = await prisma.user.findFirst({ where: { email, id: { not: user.id } } });
  if (taken) return res.status(409).json({ error: "Esse e-mail já está em uso" });
  await prisma.user.update({ where: { id: user.id }, data: { email } });
  res.json({ ok: true, email });
});

// Escolher/trocar de raça no ciclo diário. Liberado quando o player AINDA não
// escolheu a raça do round atual (tela obrigatória) OU enquanto está na proteção
// de novato (pode mudar de ideia no início). Como as naves são específicas de
// cada raça, recomeça o planeta do zero (naves, tech, roids, agentes, frotas).
gameRouter.post("/account/race", async (req: AuthedRequest, res) => {
  const parsed = z.object({ race: z.enum(RACE_KEYS as [string, ...string[]]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Raça inválida" });
  const planet = await prisma.planet.findUnique({
    where: { userId: req.userId! },
    include: { user: { select: { raceRound: true } } },
  });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  const state = await prisma.gameState.findUnique({ where: { id: 1 } });
  const tick = state?.tickNumber ?? 0;
  const roundStartMs = state?.roundStartAt ? new Date(state.roundStartAt).getTime() : null;
  const raceRoundMs = planet.user.raceRound ? new Date(planet.user.raceRound).getTime() : null;
  const mustChooseRace = roundStartMs != null && raceRoundMs !== roundStartMs;
  const underProtection = tick < planet.createdTick + NEWBIE_PROTECTION_TICKS;
  if (!mustChooseRace && !underProtection) {
    return res.status(400).json({ error: "A escolha de raça só fica liberada no início do round (proteção de novato)." });
  }
  // Recomeça o planeta do zero com a nova raça e marca a raça como escolhida
  // para o round atual (sai da tela obrigatória).
  await prisma.fleet.deleteMany({ where: { ownerPlanetId: planet.id } });
  await prisma.buildOrder.deleteMany({ where: { planetId: planet.id } });
  await prisma.user.update({
    where: { id: req.userId! },
    data: { race: parsed.data.race, raceRound: roundStartMs != null ? new Date(roundStartMs) : null },
  });
  await prisma.planet.update({
    where: { id: planet.id },
    data: {
      metalium: STARTING.metalium, carbonum: STARTING.carbonum, plutonium: STARTING.plutonium,
      roidMetalium: STARTING.roidMetalium, roidCarbonum: STARTING.roidCarbonum, roidPlutonium: STARTING.roidPlutonium,
      shipCaca: 0, shipCorveta: 0, shipFragata: 0, shipDestroyer: 0, shipCruzador: 0, shipNavemae: 0,
      roider1: 0, roider2: 0, units: "{}", agents: "{}", researchTier: 0,
      tech: JSON.stringify({}),
      prodMul: 100, travelMul: 100, fleetSlots: 0,
    },
  });
  res.json(await planetView(req.userId!));
});

// Alterar a própria senha (precisa da senha atual).
gameRouter.post("/change-password", async (req: AuthedRequest, res) => {
  const parsed = z.object({ current: z.string(), next: z.string().min(6).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Nova senha precisa de 6 a 100 caracteres" });
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) return res.status(404).json({ error: "Usuario nao encontrado" });
  if (!(await bcrypt.compare(parsed.data.current, user.password))) {
    return res.status(400).json({ error: "Senha atual incorreta" });
  }
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(parsed.data.next, 10) } });
  res.json({ ok: true });
});

// Auto-exílio: cai numa galáxia aleatória não-privada (máx 3 por planeta).
gameRouter.post("/auto-exile", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await autoExile(planet.id); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha no auto-exílio" }); }
  res.json(await planetView(req.userId!));
});

// ===== Associados =====
gameRouter.get("/associado", async (req: AuthedRequest, res) => {
  res.json(await associadoView(req.userId!));
});
gameRouter.post("/associado/join", async (req: AuthedRequest, res) => {
  try { await becomeAssociado(req.userId!); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await associadoView(req.userId!));
});
gameRouter.post("/associado/rename", async (req: AuthedRequest, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  try { await changeName(req.userId!, name); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await associadoView(req.userId!));
});

// ===== Galáxia privada (associado) =====
gameRouter.get("/private", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  res.json(await privateView(planet.id));
});
gameRouter.post("/private/create", async (req: AuthedRequest, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await createPrivateGalaxy(planet.id, name); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await privateView(planet.id));
});
gameRouter.post("/private/invite", async (req: AuthedRequest, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await invitePrivate(planet.id, username); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await privateView(planet.id));
});
gameRouter.post("/private/join", async (req: AuthedRequest, res) => {
  const galaxy = Number(req.body?.galaxy);
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await joinPrivate(planet.id, galaxy); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha" }); }
  res.json(await privateView(planet.id));
});

// ===== Ferramentas (kit de apoio) =====

// Tabela de unidades completa (todas as raças) — referência pros jogadores.
gameRouter.get("/tools/units", async (_req, res) => {
  res.json({
    units: UNIT_TABLE.map((u) => ({
      name: u.nome, race: u.race, classe: CLASS_LABEL[u.classe], roider: u.roider, tipo: u.tipo,
      img: shipImage(u.nome),
      alvos: u.alvos.map((a) => CLASS_LABEL[a]),
      ini: u.ini, agi: u.agi, varm: u.varm, qarm: u.qarm, pfog: u.pfog, fusel: u.fusel, rp: u.rp,
      m: u.m, c: u.c, p: u.p, ticks: u.ticks, comb: u.comb, tec: u.tec,
    })),
  });
});

// Ranking das galáxias por pontuação (Top 25).
gameRouter.get("/tools/galaxy-ranking", async (_req, res) => {
  const planets = await prisma.planet.findMany({ select: { id: true, galaxy: true, system: true, units: true, metalium: true, carbonum: true, plutonium: true, roidMetalium: true, roidCarbonum: true, roidPlutonium: true, agents: true, tech: true } });
  const fleets = await prisma.fleet.findMany({ select: { ownerPlanetId: true, units: true } });
  const states = await prisma.galaxyState.findMany();
  const nameOf = new Map(states.map((s) => [s.galaxy, s.name]));
  const fleetUnitsBy: Record<string, Record<string, number>> = {};
  for (const f of fleets) { const fu = parseUnits(f.units); const m = (fleetUnitsBy[f.ownerPlanetId] ??= {}); for (const n of Object.keys(fu)) m[n] = (m[n] || 0) + fu[n]; }
  const byGalaxy: Record<number, { score: number; planets: number }> = {};
  for (const p of planets) {
    const u: Record<string, number> = { ...parseUnits(p.units) };
    const fl = fleetUnitsBy[p.id] ?? {}; for (const n of Object.keys(fl)) u[n] = (u[n] || 0) + fl[n];
    const g = (byGalaxy[galaxyId(p.galaxy, p.system)] ??= { score: 0, planets: 0 });
    g.score += planetScore(p, u);
    g.planets++;
  }
  const ranking = Object.entries(byGalaxy)
    .map(([g, v]) => { const { setor, paralelo } = galaxyDecompose(Number(g)); return { galaxy: Number(g), coord: `${setor}:${paralelo}`, name: nameOf.get(Number(g)) ?? null, score: v.score, planets: v.planets, morale: null as number | null }; })
    .sort((a, b) => b.score - a.score).slice(0, 25);
  res.json({ ranking });
});

// Árvore tecnológica completa (catálogo, sem nível do jogador).
gameRouter.get("/tools/techtree", async (_req, res) => {
  res.json({
    techs: TECHS.map((t) => ({
      key: t.key, name: t.name, category: t.category, kind: t.kind, desc: t.desc, max: t.max,
      cost: t.baseCost.metalium, ticks: t.baseTicks,
      requires: t.requires.map((r) => ({ name: TECH_BY_KEY[r.key]?.name ?? r.key, level: r.level })),
    })),
  });
});

// Calculadora de Combate: simula ataque × defesa por até 3 ticks (motor real,
// sem tocar no banco). Recebe { attacker:{nave:qtd}, defender:{nave:qtd}, ticks }.
gameRouter.post("/tools/combat-sim", async (req: AuthedRequest, res) => {
  const fleetSchema = z.record(z.string(), z.number().int().min(0).max(100_000_000));
  const parsed = z.object({ attacker: fleetSchema, defender: fleetSchema, ticks: z.number().int().min(1).max(BATTLE_TICKS).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });
  // Sanitiza: só naves válidas, qtd > 0.
  const clean = (m: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [name, qty] of Object.entries(m)) if (qty > 0 && unitByName(name)) out[name] = Math.floor(qty);
    return out;
  };
  const attacker = clean(parsed.data.attacker);
  const defender = clean(parsed.data.defender);
  if (Object.keys(attacker).length === 0 && Object.keys(defender).length === 0) {
    return res.status(400).json({ error: "Adicione naves no ataque e/ou na defesa." });
  }
  res.json(simulateCombat(attacker, defender, parsed.data.ticks ?? BATTLE_TICKS));
});

// Calculadora de Sabotagem: prevê chance/custo no jogo atual (catálogo + odds).
gameRouter.get("/tools/sabotage", (_req, res) => res.json({ sabotages: sabotageCatalog() }));
gameRouter.post("/tools/sabotage-sim", async (req: AuthedRequest, res) => {
  const parsed = z.object({
    key: z.string(),
    attackerAE: z.number().int().min(0).max(1_000_000),
    targetRoids: z.number().int().min(0).max(1_000_000),
    targetRace: z.string(),
    targetCE: z.number().int().min(0).max(1_000_000),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos" });
  const { key, attackerAE, targetRoids, targetRace, targetCE } = parsed.data;
  const odds = sabotageOdds(key, attackerAE, targetRoids, targetRace, targetCE);
  if (!odds) return res.status(400).json({ error: "Sabotagem desconhecida" });
  res.json(odds);
});

// Lista de planetas com pontuação (Procura de Planetas / Universo / Gráficos).
gameRouter.get("/tools/planets", async (_req, res) => {
  const planets = await prisma.planet.findMany({ include: { user: { select: { username: true, race: true, lastSeen: true } } } });
  const fleets = await prisma.fleet.findMany({ select: { ownerPlanetId: true, units: true } });
  const fleetUnitsBy: Record<string, Record<string, number>> = {};
  for (const f of fleets) { const fu = parseUnits(f.units); const m = (fleetUnitsBy[f.ownerPlanetId] ??= {}); for (const n of Object.keys(fu)) m[n] = (m[n] || 0) + fu[n]; }
  const state = await prisma.gameState.findUnique({ where: { id: 1 } });
  const nowTick = state?.tickNumber ?? 0;
  const list = planets.map((p) => {
    const u: Record<string, number> = { ...parseUnits(p.units) };
    const fl = fleetUnitsBy[p.id] ?? {}; for (const n of Object.keys(fl)) u[n] = (u[n] || 0) + fl[n];
    return {
      name: p.name, commander: p.user.username, coords: `${p.galaxy}:${p.system}:${p.slot}`,
      galaxy: p.galaxy,
      roids: totalRoids(p),
      score: planetScore(p, u),
      protected: nowTick < p.createdTick + 72,
    };
  }).sort((a, b) => b.score - a.score);
  res.json({ planets: list, totalUsers: await prisma.user.count() });
});

export { RESOURCES };
