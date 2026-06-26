import { prisma } from "../db.js";
import { ROID_PRODUCTION_PER_TICK, ATTACK_RANGE_MIN_PCT } from "./constants.js";
import { parseTech } from "./fleet.js";
import { levelOf, TECH_BY_KEY, miningBonus } from "./tech.js";
import { isRaceKey } from "./races.js";
import { parseUnits } from "./unitmap.js";
import { scoreOfUnits } from "./score.js";
import { addNews } from "./news.js";
import { finalize } from "./combat.js";
import { parseAgents, blockChance, ceNeeded } from "./agents.js";

const SAB_COOLDOWN = 5; // ticks entre sabotagens do mesmo sabotador

export interface SabotageDef { key: string; name: string; building: string; desc: string }
// Cada sabotagem exige a construção (tech) correspondente.
export const SABOTAGES: SabotageDef[] = [
  { key: "explosao_mina", name: "Explosão de Mina", building: "sabSistemasMineracao", desc: "Zera a produção de roids do alvo por 1 tick." },
  { key: "blackout", name: "Blackout Industrial", building: "sabEquipeProducao", desc: "Atrasa a produção de naves do alvo em 4 ticks." },
  { key: "roubo_recursos", name: "Roubo de Recursos", building: "sabInfiltracao", desc: "Destrói parte dos recursos do alvo e rouba metade." },
  { key: "vazamento", name: "Vazamento Radioativo", building: "sabEquipeMineracao", desc: "Reduz a produção do alvo em 75% por 4 ticks." },
  { key: "virus", name: "Vírus Industrial", building: "sabProducaoAvancada", desc: "Atrasa a produção de naves do alvo em 16 ticks." },
  { key: "forjar_ordem", name: "Forjar Ordem", building: "sabProducaoAvancada", desc: "Faz TODAS as frotas do alvo recuarem." },
  { key: "roubo_tecnologia", name: "Roubo de Tecnologia", building: "sabAssimiladora", desc: "Rouba uma tecnologia do alvo." },
];
const SAB_BY_KEY: Record<string, SabotageDef> = Object.fromEntries(SABOTAGES.map((s) => [s.key, s]));
function raceOf(r: string) { return isRaceKey(r) ? r : "humanos"; }

// Chance de sucesso de infiltração (espionagem/sabotagem). Mais roids no alvo = mais difícil;
// Rakshasa tem +30% de contra-espionagem.
export function infiltrationChance(myRoids: number, targetRoids: number, targetRace: string): number {
  let c = 0.55 + 0.4 * ((myRoids - targetRoids) / (myRoids + targetRoids + 1));
  if (raceOf(targetRace) === "rakshasa") c *= 0.7;
  return Math.max(0.1, Math.min(0.95, c));
}

// Sabotagens que o sabotador pode usar (com base nas construções).
export function availableSabotages(techJson: string): string[] {
  const levels = parseTech(techJson);
  return SABOTAGES.filter((s) => levelOf(levels, s.building) >= 1).map((s) => s.key);
}

export async function executeSabotage(saboteurPlanetId: string, target: { galaxy: number; system: number; slot: number }, key: string) {
  const def = SAB_BY_KEY[key];
  if (!def) throw new Error("Sabotagem desconhecida");
  const me = await prisma.planet.findUnique({ where: { id: saboteurPlanetId }, include: { user: { select: { username: true } } } });
  if (!me) throw new Error("Planeta nao encontrado");
  if (levelOf(parseTech(me.tech), def.building) < 1) throw new Error("Você não desbloqueou essa sabotagem");

  const tgt = await prisma.planet.findUnique({ where: { galaxy_system_slot: target }, include: { user: { select: { race: true } } } });
  if (!tgt) throw new Error("Nenhum planeta nessas coordenadas");
  if (tgt.id === me.id) throw new Error("Você não pode sabotar a si mesmo");
  if (tgt.galaxy === me.galaxy) throw new Error("Não dá pra sabotar planetas da sua galáxia (aliados)");

  // Restrição de pontuação (mesma do ataque): só sabota alvos dentro do range.
  // (Espionagem NÃO tem essa restrição — pode em qualquer um.)
  const myFleets = await prisma.fleet.findMany({ where: { ownerPlanetId: me.id }, select: { units: true } });
  const tgtFleets = await prisma.fleet.findMany({ where: { ownerPlanetId: tgt.id }, select: { units: true } });
  const myScore = scoreOfUnits(parseUnits(me.units)) + myFleets.reduce((s, f) => s + scoreOfUnits(parseUnits(f.units)), 0);
  const tgtScore = scoreOfUnits(parseUnits(tgt.units)) + tgtFleets.reduce((s, f) => s + scoreOfUnits(parseUnits(f.units)), 0);
  if (myScore > 0 && tgtScore < (myScore * ATTACK_RANGE_MIN_PCT) / 100) {
    throw new Error(`Alvo fora do seu alcance: a pontuação dele é menor que ${ATTACK_RANGE_MIN_PCT}% da sua`);
  }

  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const cd = await prisma.sabotageCooldown.findUnique({ where: { planetId: saboteurPlanetId } });
  if (cd && tick - cd.lastTick < SAB_COOLDOWN) throw new Error(`Aguarde ${SAB_COOLDOWN - (tick - cd.lastTick)} tick(s) para sabotar de novo`);
  await prisma.sabotageCooldown.upsert({ where: { planetId: saboteurPlanetId }, update: { lastTick: tick }, create: { planetId: saboteurPlanetId, lastTick: tick } });

  // Contra-espionagem PROBABILÍSTICA (mesmo modelo da espionagem): quanto mais
  // coberto (CE × 2 vs roids), maior a chance de bloquear — mas nunca 100%.
  const tgtCE = parseAgents(tgt.agents)["CE"] ?? 0;
  const tgtRoids = tgt.roidMetalium + tgt.roidCarbonum + tgt.roidPlutonium;
  const bc = blockChance(tgtCE, tgtRoids, tgt.user.race);
  if (Math.random() < bc) {
    await addNews(tgt.id, tick, `🛡️ Sua contra-espionagem bloqueou uma sabotagem (${def.name})`);
    return { success: false, message: `Sabotagem bloqueada pela contra-espionagem do alvo (chance ${Math.round(bc * 100)}%). Tente de novo.` };
  }

  let detail = "";
  switch (key) {
    case "explosao_mina":
      await prisma.planetEffect.create({ data: { planetId: tgt.id, kind: "proddebuff", pct: 100, expiresTick: tick + 1 } });
      detail = "produção zerada por 1 tick"; break;
    case "vazamento":
      await prisma.planetEffect.create({ data: { planetId: tgt.id, kind: "proddebuff", pct: 75, expiresTick: tick + 4 } });
      detail = "-75% de produção por 4 ticks"; break;
    case "blackout":
    case "virus": {
      const add = key === "virus" ? 16 : 4;
      const orders = await prisma.buildOrder.findMany({ where: { planetId: tgt.id, kind: "ship" } });
      for (const o of orders) await prisma.buildOrder.update({ where: { id: o.id }, data: { completeTick: o.completeTick + add } });
      detail = `produção de naves atrasada em ${add} ticks`; break;
    }
    case "roubo_recursos": {
      const lose = { m: Math.floor(tgt.metalium / 3), c: Math.floor(tgt.carbonum / 3), p: Math.floor(tgt.plutonium / 3) };
      const gain = { m: Math.floor(tgt.metalium / 6), c: Math.floor(tgt.carbonum / 6), p: Math.floor(tgt.plutonium / 6) };
      await prisma.planet.update({ where: { id: tgt.id }, data: { metalium: { decrement: lose.m }, carbonum: { decrement: lose.c }, plutonium: { decrement: lose.p } } });
      await prisma.planet.update({ where: { id: me.id }, data: { metalium: { increment: gain.m }, carbonum: { increment: gain.c }, plutonium: { increment: gain.p } } });
      detail = `roubou ${gain.m}M ${gain.c}C ${gain.p}P (e destruiu o dobro)`; break;
    }
    case "forjar_ordem": {
      const fleets = await prisma.fleet.findMany({ where: { ownerPlanetId: tgt.id, status: { not: "returning" } } });
      for (const f of fleets) await finalize(f.id, tick);
      detail = `${fleets.length} frota(s) forçada(s) a recuar`; break;
    }
    case "roubo_tecnologia": {
      const tl = parseTech(tgt.tech);
      const owned = Object.keys(tl).filter((k) => tl[k] >= 1 && TECH_BY_KEY[k]);
      if (owned.length === 0) { detail = "alvo não tinha tecnologia para roubar"; break; }
      const stolen = owned[Math.floor(Math.random() * owned.length)];
      tl[stolen] -= 1;
      await prisma.planet.update({ where: { id: tgt.id }, data: { tech: JSON.stringify(tl) } });
      const myTl = parseTech(me.tech);
      myTl[stolen] = Math.min(TECH_BY_KEY[stolen].max, (myTl[stolen] ?? 0) + 1);
      await prisma.planet.update({ where: { id: me.id }, data: { tech: JSON.stringify(myTl) } });
      detail = `roubou a tecnologia: ${TECH_BY_KEY[stolen].name}`; break;
    }
  }
  await addNews(tgt.id, tick, `💥 Você sofreu sabotagem: ${def.name} (${detail})`);
  return { success: true, message: `Sabotagem aplicada: ${def.name} — ${detail}` };
}

// Aplica os efeitos temporários (debuff de produção) e limpa os expirados. Chamado no tick.
export async function processEffects(n: number, newTick: number) {
  const active = await prisma.planetEffect.findMany({ where: { kind: "proddebuff", expiresTick: { gt: newTick - n } } });
  for (const e of active) {
    const p = await prisma.planet.findUnique({ where: { id: e.planetId } });
    if (!p) continue;
    const bonus = miningBonus(parseTech(p.tech));
    // Produção do recurso por n ticks × pct do debuff (limitado ao estoque).
    const cut = (roid: number, b: number, stock: number) =>
      Math.min(stock, Math.floor((roid * ROID_PRODUCTION_PER_TICK + b) * n * e.pct / 100));
    await prisma.planet.update({
      where: { id: p.id },
      data: {
        metalium: { decrement: cut(p.roidMetalium, bonus.metalium, p.metalium) },
        carbonum: { decrement: cut(p.roidCarbonum, bonus.carbonum, p.carbonum) },
        plutonium: { decrement: cut(p.roidPlutonium, bonus.plutonium, p.plutonium) },
      },
    });
  }
  await prisma.planetEffect.deleteMany({ where: { expiresTick: { lte: newTick } } });
}
