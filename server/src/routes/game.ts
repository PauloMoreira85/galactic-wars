import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { RESOURCES, ROID_PRODUCTION_PER_TICK, nextRoidCost, nextFleetSlotCost } from "../game/constants.js";
import { buildRoid, totalRoids } from "../game/roids.js";
import { RACES, isRaceKey } from "../game/races.js";
import { startUpgrade, buildUnit, parseTech } from "../game/fleet.js";
import { createFleet, setFleetComposition, renameFleet, dispatchFleet, fuelCost, viewSystem, galaxyTraffic, type ShipCounts } from "../game/galaxy.js";
import { recallFleet, BATTLE_TICKS } from "../game/combat.js";
import { unitsOfRace, isUnitUnlocked, CLASS_LABEL, unitByName, shipImage } from "../game/catalog.js";
import { UNIT_TABLE } from "../game/unitTable.js";
import { associadoView, becomeAssociado, changeName } from "../game/associados.js";
import { autoExile } from "../game/relocation.js";
import { randomBytes } from "node:crypto";
import { createPrivateGalaxy, invitePrivate, joinPrivate, privateView } from "../game/privategalaxy.js";
import { effectiveTec, galaxyPenalty, travelTime } from "../game/travel.js";
import { vote, appoint, setTax, donate, govView, mgFleets, setGalaxyName, setGalaxyFlag, proposeTreaty, acceptTreaty, cancelTreaty } from "../game/governance.js";
import { scoreOfUnits } from "../game/score.js";
import { addNews, recentNews } from "../game/news.js";
import { createAlliance, invitePlayer, acceptInvite, leaveAlliance, kickMember, setMemberRole, allianceView } from "../game/alliance.js";
import { forumIndex, listTopics, createTopic, getTopic, reply as forumReply, isForum } from "../game/forum.js";
import { sendChat, recentChat, resolveRoom } from "../game/chat.js";
import { sendPM, inbox, sentbox, markRead, unreadCount } from "../game/pm.js";
import { SABOTAGES, availableSabotages, executeSabotage, infiltrationChance } from "../game/sabotage.js";
import { parseUnits, totalUnits } from "../game/unitmap.js";
import {
  TECHS, TECH_BY_KEY, levelOf, upgradeCost, upgradeTicks, reqsMet, espionageLevel,
} from "../game/tech.js";
import { config } from "../config.js";

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
    include: { user: { select: { username: true, race: true } } },
  });
  if (!planet) return null;
  const state = await prisma.gameState.findUnique({ where: { id: 1 } });

  const raceKey = isRaceKey(planet.user.race) ? planet.user.race : "humanos";
  const race = RACES[raceKey];
  const tick = state?.tickNumber ?? 0;
  const levels = parseTech(planet.tech);
  const hangar = parseUnits(planet.units);
  const propLevel = levelOf(levels, "propulsao");

  const orders = await prisma.buildOrder.findMany({ where: { planetId: planet.id }, orderBy: { completeTick: "asc" } });
  const myFleets = await prisma.fleet.findMany({ where: { ownerPlanetId: planet.id } });
  const score = scoreOfUnits(hangar) + myFleets.reduce((s, f) => s + scoreOfUnits(parseUnits(f.units)), 0);

  // Rank global por pontuação + usuários online + cargo na galáxia.
  const allP = await prisma.planet.findMany({ select: { id: true, units: true } });
  const allF = await prisma.fleet.findMany({ select: { ownerPlanetId: true, units: true } });
  const fscore: Record<string, number> = {};
  for (const f of allF) fscore[f.ownerPlanetId] = (fscore[f.ownerPlanetId] || 0) + scoreOfUnits(parseUnits(f.units));
  let rank = 1;
  for (const p of allP) { if (scoreOfUnits(parseUnits(p.units)) + (fscore[p.id] || 0) > score) rank++; }
  const onlineCount = await prisma.user.count({ where: { lastSeen: { gt: new Date(Date.now() - 5 * 60 * 1000) } } });
  const gstate = await prisma.galaxyState.findUnique({ where: { galaxy: planet.galaxy } });
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
    count: hangar[u.nome] ?? 0,
    unlocked: isUnitUnlocked(raceKey, u, levels),
  }));

  const queue = orders.map((o) => ({
    id: o.id, kind: o.kind, shipClass: o.shipClass, key: o.techKey ?? null,
    label: o.kind === "ship" && o.shipClass
      ? `${o.quantity}x ${o.shipClass}`
      : `${TECH_BY_KEY[o.techKey ?? ""]?.name ?? o.techKey} (nv ${o.targetLevel})`,
    quantity: o.quantity,
    ticksRemaining: Math.max(0, o.completeTick - tick),
  }));

  const roids = { metalium: planet.roidMetalium, carbonum: planet.roidCarbonum, plutonium: planet.roidPlutonium, total: totalRoids(planet) };

  return {
    commander: planet.user.username,
    commanderTitle: `${planet.user.username} ${planet.preposition} ${planet.name}`,
    race: { key: race.key, name: race.name, tagline: race.tagline, lore: race.lore, traits: race.traits, img: `/art/races/${race.key}.png` },
    planet: {
      id: planet.id, name: planet.name, coords: `${planet.galaxy}:${planet.system}:${planet.slot}`,
      resources: { metalium: planet.metalium, carbonum: planet.carbonum, plutonium: planet.plutonium },
      roids,
      productionPerTick: {
        metalium: Math.floor((roids.metalium * ROID_PRODUCTION_PER_TICK * planet.prodMul) / 100),
        carbonum: Math.floor((roids.carbonum * ROID_PRODUCTION_PER_TICK * planet.prodMul) / 100),
        plutonium: Math.floor((roids.plutonium * ROID_PRODUCTION_PER_TICK * planet.prodMul) / 100),
      },
      nextRoidCost: nextRoidCost(roids.total),
      prodMul: planet.prodMul, travelMul: planet.travelMul,
      score, rank, cargo,
      fleetSlots: planet.fleetSlots, fleetsActive: myFleets.length,
      nextFleetSlotCost: nextFleetSlotCost(planet.fleetSlots),
      autoExiles: planet.autoExiles,
    },
    onlineCount,
    tech: techCatalog,
    units,
    queue,
    effects: { prodMul: planet.prodMul, travelMul: planet.travelMul, espionage: espionageLevel(levels) },
    game: {
      tickNumber: tick, lastTickAt: state?.lastTickAt ?? null, tickIntervalSeconds: config.tickIntervalSeconds,
      roundTicks: config.roundTicks, roundEnded: tick >= config.roundTicks,
    },
  };
}

gameRouter.get("/me", async (req: AuthedRequest, res) => {
  await prisma.user.update({ where: { id: req.userId! }, data: { lastSeen: new Date() } }).catch(() => {});
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
  // Online/inatividade só na PRÓPRIA galáxia (em outras, vem por espionagem).
  const view: any = await viewSystem(galaxy, system, me?.galaxy ?? null);
  // Agentes que EU possuo (nível da minha Inteligência): P(≥2) M(≥3) T(≥4) D(≥5).
  const lvl = me ? espionageLevel(parseTech(me.tech)) : 0;
  view.agents = { P: lvl >= 2, M: lvl >= 3, T: lvl >= 4, D: lvl >= 5 };
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
    const tecBase = travelTime(planet.galaxy, planet.galaxy, units, prop); // TEC da frota (penalidade 0)
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
});
gameRouter.post("/fleets/:id/dispatch", async (req: AuthedRequest, res) => {
  const parsed = dispatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const { galaxy, system, slot, mission } = parsed.data;
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  try { await dispatchFleet(planet.id, req.params.id, { galaxy, system, slot }, mission); }
  catch (e: any) { return res.status(400).json({ error: e.message ?? "Falha ao enviar frota" }); }
  res.json({ ok: true });
});

// Penalidade de distância (TEC) até uma galáxia. O cliente soma o TEC da frota selecionada.
gameRouter.get("/travel/:galaxy/:system/:slot", async (req: AuthedRequest, res) => {
  const planet = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!planet) return res.status(404).json({ error: "Planeta nao encontrado" });
  res.json({ penalty: galaxyPenalty(planet.galaxy, Number(req.params.galaxy)) });
});

// Espionagem por AGENTE: P(padrão) M(militar) T(transmissão) D(duplo).
const AGENT_LEVEL: Record<string, number> = { P: 2, M: 3, T: 4, D: 5 };
const spySchema = z.object({
  galaxy: z.number().int().min(1), system: z.number().int().min(1), slot: z.number().int().min(1).max(15),
  agent: z.enum(["P", "M", "T", "D"]),
});
gameRouter.post("/spy", async (req: AuthedRequest, res) => {
  const parsed = spySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Pedido invalido" });
  const me = await prisma.planet.findUnique({ where: { userId: req.userId! } });
  if (!me) return res.status(404).json({ error: "Planeta nao encontrado" });
  const lvl = espionageLevel(parseTech(me.tech));
  const { galaxy, system, slot, agent } = parsed.data;
  if (lvl < AGENT_LEVEL[agent]) return res.status(400).json({ error: `Você não tem o agente ${agent}` });

  const target = await prisma.planet.findUnique({ where: { galaxy_system_slot: { galaxy, system, slot } }, include: { user: { select: { username: true, race: true, lastSeen: true } } } });
  if (!target) return res.status(404).json({ error: "Nenhum planeta nessas coordenadas" });
  const raceKey = isRaceKey(target.user.race) ? target.user.race : "humanos";

  // Contra-espionagem: pode falhar (mais roids no alvo / Rakshasa = mais difícil).
  const tkNow = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const myRoids = me.roidMetalium + me.roidCarbonum + me.roidPlutonium;
  const tgtRoids = target.roidMetalium + target.roidCarbonum + target.roidPlutonium;
  if (Math.random() >= infiltrationChance(myRoids, tgtRoids, target.user.race)) {
    await addNews(target.id, tkNow, `🛡️ Você repeliu uma tentativa de espionagem (agente ${agent})`);
    return res.json({ failed: true, error: "Espionagem falhou (contra-espionagem do alvo)" });
  }
  const units = parseUnits(target.units);
  const totalShips = Object.values(units).reduce((a, b) => a + b, 0);
  const intel: any = { agent, coords: `${galaxy}:${system}:${slot}`, name: target.name, commander: target.user.username, race: RACES[raceKey].name };

  if (agent === "P") {
    // Padrão: raça, pontuação, roids e qtd TOTAL de naves (sem detalhar tipos).
    intel.score = scoreOfUnits(units);
    intel.roids = { metalium: target.roidMetalium, carbonum: target.roidCarbonum, plutonium: target.roidPlutonium };
    intel.totalShips = totalShips;
    intel.online = Date.now() - new Date(target.user.lastSeen).getTime() < 5 * 60 * 1000;
  } else if (agent === "M") {
    // Militar: QUAIS e quantas naves (Rakshasa: só roiders aparecem).
    const u = raceKey === "rakshasa" ? Object.fromEntries(Object.entries(units).filter(([n]) => unitByName(n)?.roider)) : units;
    intel.ships = Object.keys(u).map((name) => ({ name, count: u[name] }));
  } else if (agent === "T") {
    // Transmissão: notícias recentes do alvo.
    intel.news = (await recentNews(target.id, 20)).map((n) => `#${n.tick} ${n.message}`);
  } else if (agent === "D") {
    // Duplo: todas as frotas do alvo (movimento e composição).
    const state = await prisma.gameState.findUnique({ where: { id: 1 } });
    const tick = state?.tickNumber ?? 0;
    const fleets = await prisma.fleet.findMany({ where: { ownerPlanetId: target.id } });
    intel.fleets = fleets.map((f) => ({
      mission: f.mission, status: f.status,
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      ticksRemaining: f.status === "engaged" ? Math.max(0, BATTLE_TICKS - f.battleTicksDone) : Math.max(0, f.arriveTick - tick),
      units: parseUnits(f.units),
    }));
    intel.base = units; // naves que ficaram na base
  }
  // O alvo é notificado da espionagem.
  const tk = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  await addNews(target.id, tk, `🛰️ Você foi alvo de espionagem (agente ${agent})`);
  // Guarda o relatório para "Visualizar Espionagem" + gera um código compartilhável.
  const hash = randomBytes(4).toString("hex").toUpperCase();
  await prisma.spyReport.create({ data: {
    hash, spyPlanetId: me.id, targetName: target.name, targetCoords: `${target.galaxy}:${target.system}:${target.slot}`,
    agent, tick: tk, data: JSON.stringify(intel),
  } });
  res.json({ intel, hash });
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
gameRouter.post("/alliance/invite", (req: AuthedRequest, res) => {
  const p = z.object({ username: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
  return allianceAction(req, res, (id) => invitePlayer(id, p.data.username));
});
gameRouter.post("/alliance/accept", (req: AuthedRequest, res) => {
  const p = z.object({ allianceId: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Pedido invalido" });
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
  return !!planet && planet.galaxy === Number(m[1]);
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
  const planets = await prisma.planet.findMany({ include: { user: { select: { username: true, race: true } } } });
  const ranked = planets
    .map((p) => ({
      username: p.user.username,
      race: (isRaceKey(p.user.race) ? RACES[p.user.race] : RACES.humanos).name,
      planet: p.name, coords: `${p.galaxy}:${p.system}:${p.slot}`, roids: totalRoids(p),
    }))
    .sort((a, b) => b.roids - a.roids).slice(0, 50);
  res.json({ ranking: ranked });
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
  const planets = await prisma.planet.findMany({ select: { galaxy: true, units: true } });
  const fleets = await prisma.fleet.findMany({ select: { ownerPlanetId: true, units: true } });
  const states = await prisma.galaxyState.findMany();
  const nameOf = new Map(states.map((s) => [s.galaxy, s.name]));
  const fscore: Record<string, number> = {};
  for (const f of fleets) fscore[f.ownerPlanetId] = (fscore[f.ownerPlanetId] || 0) + scoreOfUnits(parseUnits(f.units));
  const byGalaxy: Record<number, { score: number; planets: number }> = {};
  for (const p of planets) {
    const g = (byGalaxy[p.galaxy] ??= { score: 0, planets: 0 });
    g.score += scoreOfUnits(parseUnits(p.units));
    g.planets++;
  }
  // soma das frotas por galáxia (via dono)
  const ownerGalaxy = new Map((await prisma.planet.findMany({ select: { id: true, galaxy: true } })).map((p) => [p.id, p.galaxy]));
  for (const [pid, s] of Object.entries(fscore)) {
    const g = ownerGalaxy.get(pid);
    if (g != null && byGalaxy[g]) byGalaxy[g].score += s;
  }
  const ranking = Object.entries(byGalaxy)
    .map(([g, v]) => ({ galaxy: Number(g), name: nameOf.get(Number(g)) ?? null, score: v.score, planets: v.planets, morale: null as number | null }))
    .sort((a, b) => b.score - a.score).slice(0, 25);
  res.json({ ranking });
});

// Árvore tecnológica completa (catálogo, sem nível do jogador).
gameRouter.get("/tools/techtree", async (_req, res) => {
  res.json({
    techs: TECHS.map((t) => ({
      key: t.key, name: t.name, category: t.category, kind: t.kind, desc: t.desc, max: t.max,
      requires: t.requires.map((r) => ({ name: TECH_BY_KEY[r.key]?.name ?? r.key, level: r.level })),
    })),
  });
});

// Lista de planetas com pontuação (Procura de Planetas / Universo / Gráficos).
gameRouter.get("/tools/planets", async (_req, res) => {
  const planets = await prisma.planet.findMany({ include: { user: { select: { username: true, race: true, lastSeen: true } } } });
  const fleets = await prisma.fleet.findMany({ select: { ownerPlanetId: true, units: true } });
  const fscore: Record<string, number> = {};
  for (const f of fleets) fscore[f.ownerPlanetId] = (fscore[f.ownerPlanetId] || 0) + scoreOfUnits(parseUnits(f.units));
  const state = await prisma.gameState.findUnique({ where: { id: 1 } });
  const nowTick = state?.tickNumber ?? 0;
  const list = planets.map((p) => ({
    name: p.name, commander: p.user.username, coords: `${p.galaxy}:${p.system}:${p.slot}`,
    galaxy: p.galaxy, race: (isRaceKey(p.user.race) ? RACES[p.user.race] : RACES.humanos).name,
    roids: totalRoids(p),
    score: scoreOfUnits(parseUnits(p.units)) + (fscore[p.id] || 0),
    protected: nowTick < p.createdTick + 72,
  })).sort((a, b) => b.score - a.score);
  res.json({ planets: list, totalUsers: await prisma.user.count() });
});

export { RESOURCES };
