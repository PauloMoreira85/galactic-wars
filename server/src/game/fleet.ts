import { prisma, TX_OPTS } from "../db.js";
import { isRaceKey, type RaceKey } from "./races.js";
import { unitByName, raceTable, isUnitUnlocked } from "./catalog.js";
import { parseUnits, stringifyUnits, addUnits } from "./unitmap.js";
import { addNews } from "./news.js";
import {
  TECH_BY_KEY, type TechLevels,
  levelOf, upgradeCost, upgradeTicks, reqsMet, espionageLevel,
} from "./tech.js";
import { AGENTS, isAgentKey, parseAgents, stringifyAgents } from "./agents.js";

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

// Treina `quantity` agentes do tipo `agentKey` (P/M/T/D/CE). Exige nível de
// Inteligência (espionageLevel) suficiente. Resolve pela fila (kind "agent").
export async function buildAgent(planetId: string, agentKey: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantidade invalida");
  if (!isAgentKey(agentKey)) throw new Error("Agente invalido");
  const def = AGENTS[agentKey];
  return prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const levels = parseTech(planet.tech);
    if (espionageLevel(levels) < def.level) throw new Error(`Pesquise mais Inteligência p/ treinar ${def.name}`);
    const cost = { metalium: def.m * quantity, carbonum: def.c * quantity, plutonium: def.p * quantity };
    if (planet.metalium < cost.metalium || planet.carbonum < cost.carbonum || planet.plutonium < cost.plutonium) {
      throw new Error("Recursos insuficientes para o treino");
    }
    const tick = await currentTick();
    await tx.planet.update({
      where: { id: planetId },
      data: { metalium: { decrement: cost.metalium }, carbonum: { decrement: cost.carbonum }, plutonium: { decrement: cost.plutonium } },
    });
    const order = await tx.buildOrder.create({
      data: { planetId, kind: "agent", shipClass: agentKey, quantity, startTick: tick, completeTick: tick + def.ticks },
    });
    await addNews(planetId, tick, `🕵️ Treino iniciado: ${quantity}x ${def.name}`);
    return order;
  }, TX_OPTS);
}

// Cancela uma ordem da fila (pesquisa/construção/nave) e reembolsa proporcional
// ao tempo que FALTAVA (você perde a parte já feita).
export async function cancelOrder(planetId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.buildOrder.findUnique({ where: { id: orderId } });
    if (!order || order.planetId !== planetId) throw new Error("Ordem nao encontrada");
    const tick = await currentTick();
    const total = Math.max(1, order.completeTick - order.startTick);
    const elapsed = Math.max(0, Math.min(total, tick - order.startTick));
    const remainingFrac = (total - elapsed) / total;

    let cost = { metalium: 0, carbonum: 0, plutonium: 0 };
    if (order.kind === "tech" && order.techKey) {
      const def = TECH_BY_KEY[order.techKey];
      if (def) cost = upgradeCost(def, (order.targetLevel ?? 1) - 1);
    } else if (order.kind === "ship" && order.shipClass) {
      const u = unitByName(order.shipClass);
      if (u) cost = { metalium: u.m * order.quantity, carbonum: u.c * order.quantity, plutonium: u.p * order.quantity };
    } else if (order.kind === "agent" && order.shipClass && isAgentKey(order.shipClass)) {
      const a = AGENTS[order.shipClass];
      cost = { metalium: a.m * order.quantity, carbonum: a.c * order.quantity, plutonium: a.p * order.quantity };
    }
    const refund = {
      metalium: Math.floor(cost.metalium * remainingFrac),
      carbonum: Math.floor(cost.carbonum * remainingFrac),
      plutonium: Math.floor(cost.plutonium * remainingFrac),
    };
    await tx.planet.update({ where: { id: planetId }, data: {
      metalium: { increment: refund.metalium }, carbonum: { increment: refund.carbonum }, plutonium: { increment: refund.plutonium },
    } });
    await tx.buildOrder.delete({ where: { id: orderId } });
    return refund;
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
    } else if (order.kind === "agent" && order.shipClass && isAgentKey(order.shipClass)) {
      const planet = await prisma.planet.findUnique({ where: { id: order.planetId } });
      if (planet) {
        const agents = addUnits(parseAgents(planet.agents), { [order.shipClass]: order.quantity });
        await prisma.planet.update({ where: { id: order.planetId }, data: { agents: stringifyAgents(agents) } });
        await addNews(order.planetId, uptoTick, `🕵️ Treino concluído: ${order.quantity}x ${AGENTS[order.shipClass].name}`);
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
          const def = TECH_BY_KEY[order.techKey];
          const isResearch = def?.kind === "research";
          await addNews(order.planetId, uptoTick, `${isResearch ? "🔬 Pesquisa" : "🛠️ Construção"} concluída: ${def?.name ?? order.techKey}`);
        }
      }
    }
  }
  await prisma.buildOrder.deleteMany({ where: { id: { in: due.map((o) => o.id) } } });
  console.log(`[tick] ${due.length} ordem(ns) concluida(s)`);
}
