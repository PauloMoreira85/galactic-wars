import { prisma, TX_OPTS } from "../db.js";
import { isRaceKey, type RaceKey } from "./races.js";
import { unitByName, raceTable, isUnitUnlocked } from "./catalog.js";
import { parseUnits, stringifyUnits, addUnits } from "./unitmap.js";
import { addNews } from "./news.js";
import {
  TECH_BY_KEY, type TechLevels,
  levelOf, upgradeCost, upgradeTicks, reqsMet,
} from "./tech.js";

async function currentTick(): Promise<number> {
  const s = await prisma.gameState.findUnique({ where: { id: 1 } });
  return s?.tickNumber ?? 0;
}
function raceOf(race: string): RaceKey { return isRaceKey(race) ? race : "humanos"; }
export function parseTech(json: string): TechLevels {
  try { return JSON.parse(json) as TechLevels; } catch { return {}; }
}

// Inicia uma Pesquisa OU Construção (sobe 1 nível). 1 de cada por vez.
export async function startUpgrade(planetId: string, key: string) {
  const def = TECH_BY_KEY[key];
  if (!def) throw new Error("Tecnologia desconhecida");
  return prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const levels = parseTech(planet.tech);
    const cur = levelOf(levels, key);
    if (cur >= def.max) throw new Error("Nivel maximo atingido");
    if (!reqsMet(def, levels)) throw new Error("Pre-requisitos nao atendidos");

    const pendingTech = await tx.buildOrder.findMany({ where: { planetId, kind: "tech" } });
    if (pendingTech.some((o) => TECH_BY_KEY[o.techKey ?? ""]?.kind === def.kind)) {
      throw new Error(def.kind === "research" ? "Ja ha uma pesquisa em andamento" : "Ja ha uma construcao em andamento");
    }
    const cost = upgradeCost(def, cur);
    if (planet.metalium < cost.metalium || planet.carbonum < cost.carbonum || planet.plutonium < cost.plutonium) {
      throw new Error("Recursos insuficientes");
    }
    const tick = await currentTick();
    await tx.planet.update({
      where: { id: planetId },
      data: { metalium: { decrement: cost.metalium }, carbonum: { decrement: cost.carbonum }, plutonium: { decrement: cost.plutonium } },
    });
    const order = await tx.buildOrder.create({
      data: { planetId, kind: "tech", techKey: key, targetLevel: cur + 1, quantity: 1, startTick: tick, completeTick: tick + upgradeTicks(def, cur) },
    });
    await addNews(planetId, tick, `${def.kind === "research" ? "🔬" : "🛠️"} Iniciado: ${def.name} (nível ${cur + 1})`);
    return order;
  }, TX_OPTS);
}

// Constroi `quantity` da nave `unitName` (custo/tempo da tabela oficial).
export async function buildUnit(planetId: string, unitName: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantidade invalida");
  return prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId }, include: { user: { select: { race: true } } } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const race = raceOf(planet.user.race);
    const u = unitByName(unitName);
    if (!u || u.race !== raceTable(race)) throw new Error("Nave invalida para sua raca");

    const levels = parseTech(planet.tech);
    if (!isUnitUnlocked(race, u, levels)) throw new Error("Voce ainda nao desbloqueou essa nave");

    const cost = { metalium: u.m * quantity, carbonum: u.c * quantity, plutonium: u.p * quantity };
    if (planet.metalium < cost.metalium || planet.carbonum < cost.carbonum || planet.plutonium < cost.plutonium) {
      throw new Error("Recursos insuficientes para a construcao");
    }
    const tick = await currentTick();
    await tx.planet.update({
      where: { id: planetId },
      data: { metalium: { decrement: cost.metalium }, carbonum: { decrement: cost.carbonum }, plutonium: { decrement: cost.plutonium } },
    });
    const order = await tx.buildOrder.create({
      data: { planetId, kind: "ship", shipClass: unitName, quantity, startTick: tick, completeTick: tick + u.ticks },
    });
    await addNews(planetId, tick, `Construção iniciada: ${quantity}x ${unitName}`);
    return order;
  }, TX_OPTS);
}

// Resolve ordens cujo completeTick <= uptoTick.
export async function processBuildOrders(uptoTick: number) {
  const due = await prisma.buildOrder.findMany({ where: { completeTick: { lte: uptoTick } } });
  if (due.length === 0) return;

  for (const order of due) {
    if (order.kind === "ship" && order.shipClass) {
      const planet = await prisma.planet.findUnique({ where: { id: order.planetId } });
      if (planet) {
        const hangar = addUnits(parseUnits(planet.units), { [order.shipClass]: order.quantity });
        await prisma.planet.update({ where: { id: order.planetId }, data: { units: stringifyUnits(hangar) } });
        await addNews(order.planetId, uptoTick, `Construção concluída: ${order.quantity}x ${order.shipClass}`);
      }
    } else if (order.kind === "tech" && order.techKey && order.targetLevel != null) {
      const planet = await prisma.planet.findUnique({ where: { id: order.planetId } });
      if (planet) {
        const levels = parseTech(planet.tech);
        if (order.targetLevel > levelOf(levels, order.techKey)) {
          levels[order.techKey] = order.targetLevel;
          await prisma.planet.update({
            where: { id: order.planetId },
            data: { tech: JSON.stringify(levels) },
          });
          await addNews(order.planetId, uptoTick, `${TECH_BY_KEY[order.techKey]?.name ?? order.techKey} concluída (nível ${order.targetLevel})`);
        }
      }
    }
  }
  await prisma.buildOrder.deleteMany({ where: { id: { in: due.map((o) => o.id) } } });
  console.log(`[tick] ${due.length} ordem(ns) concluida(s)`);
}
