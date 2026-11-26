import { prisma, TX_OPTS, withWrite } from "../db.js";
import { pushToUser } from "./push.js";
import { startEngagement, resolveSiege } from "./combat.js";
import { parseUnits, stringifyUnits, totalUnits, addUnits, type UnitMap } from "./unitmap.js";
import { type Coords, galaxyId, galaxyWhere } from "./geo.js";
import { travelTime } from "./travel.js";
import { travelReductionTicks } from "./tech.js";
import { unitByName, radarVisibleCount } from "./catalog.js";
import { planetScore } from "./score.js";
import { allianceTagsForViewer, sameAlliance, allianceMateIds } from "./alliance.js";
import { hasActiveTreaty } from "./governance.js";
import { addNews } from "./news.js";
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
  return withWrite(() => prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const cost = nextFleetSlotCost(planet.fleetSlots);
    if (!cost) throw new Error("Voce ja tem o maximo de frotas (5)");
    if (planet.metalium < cost.metalium || planet.carbonum < cost.carbonum) {
      throw new Error(`Recursos insuficientes: precisa de ${cost.metalium} metalium e ${cost.carbonum} carbonum`);
    }
    await tx.planet.update({
      where: { id: planetId },
      data: { metalium: { decrement: cost.metalium }, carbonum: { decrement: cost.carbonum }, fleetSlots: { increment: 1 }, morale: { increment: 10 } },
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
  }, TX_OPTS));
}

export async function renameFleet(planetId: string, fleetId: string, name: string) {
  const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
  if (!fleet || fleet.ownerPlanetId !== planetId) throw new Error("Frota nao encontrada");
  await prisma.fleet.update({ where: { id: fleetId }, data: { name: name.slice(0, 30) || "Frota" } });
}

// Define a composição de uma frota IDLE (move naves entre a Base e a frota).
export async function setFleetComposition(planetId: string, fleetId: string, desired: UnitMap) {
  return withWrite(() => prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const fleet = await tx.fleet.findUnique({ where: { id: fleetId } });
    if (!fleet || fleet.ownerPlanetId !== planetId) throw new Error("Frota nao encontrada");
    if (fleet.status !== "idle") throw new Error("So da pra mexer nas naves de uma frota parada na base");

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
  }, TX_OPTS));
}

// Transfere naves DIRETO entre duas frotas (ou base <-> frota) do mesmo planeta,
// sem precisar descarregar na base antes. `fromId`/`toId` = id da frota ou "base".
// `units` = quantidades a MOVER de `from` para `to`.
export async function transferUnits(planetId: string, fromId: string, toId: string, units: UnitMap) {
  if (fromId === toId) throw new Error("Origem e destino iguais");
  return withWrite(() => prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");

    // Carrega a composição atual da origem e do destino (base = hangar do planeta).
    async function load(id: string): Promise<UnitMap> {
      if (id === "base") return parseUnits(planet!.units);
      const f = await tx.fleet.findUnique({ where: { id } });
      if (!f || f.ownerPlanetId !== planetId) throw new Error("Frota nao encontrada");
      if (f.status !== "idle") throw new Error("Só dá pra mexer em frotas paradas na base");
      return parseUnits(f.units);
    }
    const from = await load(fromId);
    const to = await load(toId);

    // Move cada tipo pedido (clampando ao que a origem tem).
    for (const name of Object.keys(units)) {
      const move = Math.max(0, Math.floor(units[name] || 0));
      if (move <= 0) continue;
      const have = from[name] || 0;
      if (move > have) throw new Error(`Naves insuficientes de ${name} (tem ${have})`);
      from[name] = have - move;
      if (from[name] <= 0) delete from[name];
      to[name] = (to[name] || 0) + move;
    }

    async function save(id: string, map: UnitMap) {
      if (id === "base") await tx.planet.update({ where: { id: planetId }, data: { units: stringifyUnits(map) } });
      else await tx.fleet.update({ where: { id }, data: { units: stringifyUnits(map) } });
    }
    await save(fromId, from);
    await save(toId, to);
    return { ok: true };
  }, TX_OPTS));
}

// Envia uma frota IDLE (já carregada) para um destino.
export const MAX_LAUNCH_DELAY = 6; // envio agendado: no máx. 6 ticks pra frente

export async function dispatchFleet(planetId: string, fleetId: string, target: Coords, mission: "attack" | "transport", ticks = 3, fake = false, launchDelay = 0) {
  // Ataque engaja no máx. 3 ticks; defesa (transport) pode guarnecer até 6 ticks.
  const maxTicks = mission === "transport" ? 6 : 3;
  const engageTicks = Math.max(1, Math.min(maxTicks, Math.floor(ticks)));
  // Envio agendado: 0 = sai agora; 1..6 = parte daqui a N ticks (fica "scheduled" na base).
  const delay = Math.max(0, Math.min(MAX_LAUNCH_DELAY, Math.floor(launchDelay)));
  const result = await withWrite(() => prisma.$transaction(async (tx) => {
    const planet = await tx.planet.findUnique({ where: { id: planetId } });
    if (!planet) throw new Error("Planeta nao encontrado");
    const fleet = await tx.fleet.findUnique({ where: { id: fleetId } });
    if (!fleet || fleet.ownerPlanetId !== planetId) throw new Error("Frota nao encontrada");
    if (fleet.status !== "idle") throw new Error("Essa frota nao esta na base");
    const fleetUnits = parseUnits(fleet.units);
    if (totalUnits(fleetUnits) === 0) throw new Error("Carregue naves na frota antes de enviar");

    // Isolamento Militar (sabotagem): planeta cercado não pode enviar frotas.
    const nowT = await currentTick();
    const lock = await tx.planetEffect.findFirst({ where: { planetId, kind: "fleetlock", expiresTick: { gt: nowT } } });
    if (lock) throw new Error(`Seu planeta está isolado militarmente (sabotagem) — não pode enviar frotas por mais ${lock.expiresTick - nowT} tick(s)`);

    const origin: Coords = { galaxy: planet.galaxy, system: planet.system, slot: planet.slot };
    if (target.galaxy === origin.galaxy && target.system === origin.system && target.slot === origin.slot) {
      throw new Error("Voce nao pode enviar frota para o proprio planeta");
    }
    // Não dá pra ATACAR e DEFENDER o mesmo planeta ao mesmo tempo.
    const opposite = mission === "attack" ? "transport" : "attack";
    const conflict = await tx.fleet.count({ where: { ownerPlanetId: planetId, mission: opposite, status: { in: ["scheduled", "outbound", "engaged", "garrison"] }, targetGalaxy: target.galaxy, targetSystem: target.system, targetSlot: target.slot } });
    if (conflict > 0) throw new Error(mission === "attack" ? "Você já tem uma frota DEFENDENDO esse planeta — não dá pra atacar e defender o mesmo ao mesmo tempo" : "Você já tem uma frota ATACANDO esse planeta — não dá pra defender e atacar o mesmo ao mesmo tempo");
    if (mission === "attack" && target.galaxy === origin.galaxy && target.system === origin.system) {
      throw new Error("Nao e possivel atacar planetas da mesma galaxia (sao aliados)");
    }
    if (mission === "attack" && await hasActiveTreaty(galaxyId(origin.galaxy, origin.system), galaxyId(target.galaxy, target.system))) {
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
      // Slot vazio: não há planeta pra atacar.
      if (!tgt) throw new Error(`Coordenada ${target.galaxy}:${target.system}:${target.slot} está vazia — não há planeta nesse slot para atacar.`);
      // Proteção de aliança: membros da mesma aliança não podem se atacar.
      if (await sameAlliance(planetId, tgt.id)) {
        throw new Error("Esse planeta é da sua aliança — aliados não se atacam.");
      }
      if (nowTick < tgt.createdTick + NEWBIE_PROTECTION_TICKS) {
        const left = tgt.createdTick + NEWBIE_PROTECTION_TICKS - nowTick;
        throw new Error(`Alvo sob proteção de novato (${left} tick(s) restante(s))`);
      }
      // Escudo manual (recurso de Associado): também bloqueia o ataque.
      if (nowTick < (tgt.shieldUntilTick ?? 0)) {
        const left = (tgt.shieldUntilTick ?? 0) - nowTick;
        throw new Error(`Alvo sob escudo de proteção (${left} tick(s) restante(s))`);
      }
      const myFleets = await tx.fleet.findMany({ where: { ownerPlanetId: planetId }, select: { units: true } });
      const tgtFleets = await tx.fleet.findMany({ where: { ownerPlanetId: tgt.id }, select: { units: true } });
      const myTotal = myFleets.reduce((acc, f) => addUnits(acc, parseUnits(f.units)), parseUnits(planet.units));
      const tgtTotal = tgtFleets.reduce((acc, f) => addUnits(acc, parseUnits(f.units)), parseUnits(tgt.units));
      const myScore = planetScore(planet, myTotal);
      const tgtScore = planetScore(tgt, tgtTotal);
      if (myScore > 0 && tgtScore < (myScore * ATTACK_RANGE_MIN_PCT) / 100) {
        throw new Error(`Alvo fora do seu alcance: a pontuação dele é menor que ${ATTACK_RANGE_MIN_PCT}% da sua`);
      }
    }

    const fuel = fuelCost(fleetUnits);
    if (planet.plutonium < fuel) throw new Error(`Plutonium (combustível) insuficiente: precisa de ${fuel}`);
    await tx.planet.update({ where: { id: planetId }, data: { plutonium: { decrement: fuel } } });

    const tick = await currentTick();
    const launchTick = tick + delay; // tick da PARTIDA real (= tick se delay 0)
    const tt = travelTime(galaxyId(origin.galaxy, origin.system), galaxyId(target.galaxy, target.system), fleetUnits, propLevelOf(planet.tech));
    await tx.fleet.update({
      where: { id: fleetId },
      data: {
        mission, status: delay > 0 ? "scheduled" : "outbound",
        originGalaxy: origin.galaxy, originSystem: origin.system, originSlot: origin.slot,
        targetGalaxy: target.galaxy, targetSystem: target.system, targetSlot: target.slot,
        departTick: launchTick, arriveTick: launchTick + tt, launchTick,
        capMetalium: 0, capCarbonum: 0, capPlutonium: 0,
        engageTicks, fake,
      },
    });
    const tipoMsg = mission === "attack" ? "ataque" : "defesa";
    // AGENDADA: só avisa o próprio dono; o alvo é avisado quando ela PARTIR (no tick),
    // pra não vazar a estratégia antes da hora.
    if (delay > 0) {
      await tx.news.create({ data: { planetId, tick, message: `🕓 ${fleet.name} (${tipoMsg}) agendada para ${target.galaxy}:${target.system}:${target.slot} — parte em ${delay}t (chega ${delay + tt}t depois do envio)` } });
      return { ok: true, arriveIn: tt, scheduled: delay, pushMsg: null as any };
    }
    // NÃO revela "falso/falsa" nas notícias: se o inimigo espionar com agente de
    // Transmissão, não pode descobrir que é uma finta (senão estraga a estratégia).
    await tx.news.create({ data: { planetId, tick, message: `${fleet.name} (${tipoMsg}) enviada para ${target.galaxy}:${target.system}:${target.slot} (chega em ${tt}t)` } });

    // Avisa o ALVO na hora do envio. Ataque = radar (Rakshasa mostra só roiders;
    // 100% invisível NÃO dispara aviso — surpresa total). Defesa = avisa o aliado.
    const tgtP = await tx.planet.findUnique({ where: { galaxy_system_slot: { galaxy: target.galaxy, system: target.system, slot: target.slot } }, select: { id: true, userId: true } });
    let pushMsg: { userId: string; title: string; body: string; tag: string } | null = null;
    if (tgtP && tgtP.id !== planetId) {
      const fromCoord = `${planet.galaxy}:${planet.system}:${planet.slot}`; // coord de quem envia (pra passar AT)
      if (mission === "attack") {
        const visible = radarVisibleCount(fleetUnits);
        if (visible > 0) {
          await tx.news.create({ data: { planetId: tgtP.id, tick, message: `🚨 ATAQUE! ${planet.name} (${fromCoord}) está te atacando com ${visible} nave(s) — chega em ${tt} tick(s)!` } });
          pushMsg = { userId: tgtP.userId, title: "🚨 ATAQUE a caminho!", body: `${planet.name} (${fromCoord}) está te atacando com ${visible} nave(s) — chega em ${tt} tick(s)!`, tag: "ataque" };
          // Avisa os aliados do ALVO pra correrem defender (mesmo radar: se não é
          // visível, nem o aliado fica sabendo).
          const mates = await allianceMateIds(tgtP.id);
          if (mates.length) {
            const coord = `${target.galaxy}:${target.system}:${target.slot}`;
            await tx.news.createMany({ data: mates.map((pid) => ({ planetId: pid, tick, message: `🛡️ Aliado sob ataque! ${planet.name} (${fromCoord}) está atacando o aliado em ${coord} — chega em ${tt}t. Mande defesa!` })) });
          }
        }
      } else {
        await tx.news.create({ data: { planetId: tgtP.id, tick, message: `🛡️ Reforço a caminho: ${planet.name} (${fromCoord}) mandou ${totalUnits(fleetUnits)} nave(s) pra te defender — chega em ${tt} tick(s).` } });
        pushMsg = { userId: tgtP.userId, title: "🛡️ Defesa a caminho!", body: `${planet.name} (${fromCoord}) mandou ${totalUnits(fleetUnits)} nave(s) pra te defender — chega em ${tt} tick(s).`, tag: "defesa" };
      }
    }
    return { ok: true, arriveIn: tt, pushMsg };
  }, TX_OPTS));
  // Notificação push FORA da transação (best-effort, não bloqueia o envio).
  if (result.pushMsg) {
    pushToUser(result.pushMsg.userId, { title: result.pushMsg.title, body: result.pushMsg.body, tag: result.pushMsg.tag, url: "/" }).catch(() => {});
  }
  return result;
}

// Envio AGENDADO: toda frota "scheduled" cujo launchTick chegou PARTE agora (vira
// "outbound") e só então o alvo é avisado — a estratégia não vaza antes da partida.
// Chamado no início de cada tick, ANTES do processFleets.
export async function launchScheduledFleets(tick: number) {
  const due = await prisma.fleet.findMany({ where: { status: "scheduled", launchTick: { lte: tick } } });
  for (const fleet of due) {
    const planet = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId }, select: { id: true, name: true, galaxy: true, system: true, slot: true } });
    if (!planet) continue;
    const fleetUnits = parseUnits(fleet.units);
    const target = { galaxy: fleet.targetGalaxy, system: fleet.targetSystem, slot: fleet.targetSlot };
    // Isolamento militar que caiu DEPOIS do agendamento cancela a partida (devolve o
    // combustível e volta pra base — não dá pra burlar o lock agendando antes).
    const lock = await prisma.planetEffect.findFirst({ where: { planetId: planet.id, kind: "fleetlock", expiresTick: { gt: tick } } });
    if (lock) {
      await prisma.planet.update({ where: { id: planet.id }, data: { plutonium: { increment: fuelCost(fleetUnits) } } });
      await prisma.fleet.update({ where: { id: fleet.id }, data: { status: "idle", departTick: 0, arriveTick: 0, launchTick: 0 } });
      await addNews(planet.id, tick, `🚫 ${fleet.name} não partiu: planeta isolado militarmente (sabotagem). Combustível devolvido.`);
      continue;
    }
    // Parte: scheduled -> outbound (arriveTick já foi calculado no agendamento).
    await prisma.fleet.update({ where: { id: fleet.id }, data: { status: "outbound", departTick: tick } });
    const tt = Math.max(0, fleet.arriveTick - tick);
    const tipoMsg = fleet.mission === "attack" ? "ataque" : "defesa";
    await addNews(planet.id, tick, `🚀 ${fleet.name} (${tipoMsg}) partiu agora para ${target.galaxy}:${target.system}:${target.slot} (chega em ${tt}t)`);

    // Avisa o ALVO na partida (mesma regra do envio imediato: radar no ataque).
    const tgtP = await prisma.planet.findUnique({ where: { galaxy_system_slot: { galaxy: target.galaxy, system: target.system, slot: target.slot } }, select: { id: true, userId: true } });
    if (!tgtP || tgtP.id === planet.id) continue;
    const fromCoord = `${planet.galaxy}:${planet.system}:${planet.slot}`;
    if (fleet.mission === "attack") {
      if (fleet.fake) continue; // finta não avisa? segue a mesma regra: avisa pelo radar
      const visible = radarVisibleCount(fleetUnits);
      if (visible > 0) {
        await addNews(tgtP.id, tick, `🚨 ATAQUE! ${planet.name} (${fromCoord}) está te atacando com ${visible} nave(s) — chega em ${tt} tick(s)!`);
        pushToUser(tgtP.userId, { title: "🚨 ATAQUE a caminho!", body: `${planet.name} (${fromCoord}) está te atacando com ${visible} nave(s) — chega em ${tt} tick(s)!`, tag: "ataque", url: "/" }).catch(() => {});
        const mates = await allianceMateIds(tgtP.id);
        if (mates.length) {
          const coord = `${target.galaxy}:${target.system}:${target.slot}`;
          for (const pid of mates) await addNews(pid, tick, `🛡️ Aliado sob ataque! ${planet.name} (${fromCoord}) está atacando o aliado em ${coord} — chega em ${tt}t. Mande defesa!`);
        }
      }
    } else {
      await addNews(tgtP.id, tick, `🛡️ Reforço a caminho: ${planet.name} (${fromCoord}) mandou ${totalUnits(fleetUnits)} nave(s) pra te defender — chega em ${tt} tick(s).`);
      pushToUser(tgtP.userId, { title: "🛡️ Defesa a caminho!", body: `${planet.name} (${fromCoord}) mandou ${totalUnits(fleetUnits)} nave(s) pra te defender — chega em ${tt} tick(s).`, tag: "defesa", url: "/" }).catch(() => {});
    }
  }
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

async function scheduleReturn(fleetId: string, fleet: { ownerPlanetId: string; arriveTick: number; targetGalaxy: number; targetSystem: number; originGalaxy: number; originSystem: number }, units: UnitMap) {
  const owner = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId } });
  // IMPORTANTE: reler as units ATUAIS do banco. O combate deste mesmo tick pode ter
  // mudado a frota (ex.: Mech ASSIMILOU naves inimigas e elas foram salvas aqui). O
  // `units` recebido é o snapshot do INÍCIO do tick — usá-lo apagaria as assimiladas.
  const fresh = await prisma.fleet.findUnique({ where: { id: fleetId }, select: { units: true } });
  const current = fresh ? parseUnits(fresh.units) : units;
  const back = travelTime(galaxyId(fleet.targetGalaxy, fleet.targetSystem), galaxyId(fleet.originGalaxy, fleet.originSystem), current, propLevelOf(owner?.tech ?? "{}"));
  await prisma.fleet.update({
    where: { id: fleetId },
    data: { status: "returning", departTick: fleet.arriveTick, arriveTick: fleet.arriveTick + back, units: stringifyUnits(current) },
  });
}

export async function processFleets(uptoTick: number) {
  const active = await prisma.fleet.findMany({
    // garrison entra TODO tick (pra registrar a defesa de cada tick, igual ataque);
    // as outras só quando já chegaram (arriveTick <= uptoTick) ou já engajadas.
    where: { status: { in: ["outbound", "engaged", "returning", "garrison"] }, OR: [{ arriveTick: { lte: uptoTick } }, { status: "engaged" }, { status: "garrison" }] },
  });
  if (active.length === 0) return;

  // Planetas que terão combate resolvido NESTE tick (1 batalha combinada cada).
  const besieged = new Set<string>();
  // Guarnições que terminam HOJE num planeta sob ataque: a volta é processada
  // DEPOIS do combate (no mesmo tick), pra levar as naves assimiladas sem esticar
  // a estadia. Guarda o id da frota (relê do banco após o resolveSiege).
  const returnAfterCombat: string[] = [];

  // Alvos que estão SOB ATAQUE neste tick (frota já engajada, ou atacante chegando
  // agora). Numa guarnição, se o alvo está sob ataque, o COMBATE gera o relatório —
  // então não gravamos também o registro de "guarneceu sem combate" (evita duplicar).
  const underAttackThisTick = new Set<string>();
  for (const f of active) {
    const isAtkArriving = f.mission === "attack" && f.status === "outbound" && !f.fake && f.arriveTick <= uptoTick;
    if (f.status === "engaged" || isAtkArriving) {
      underAttackThisTick.add(`${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`);
    }
  }

  // Grava 1 registro de DEFESA (guarnição sem combate) pra uma frota num tick.
  async function writeGarrisonRecord(fleet: typeof active[number], atTick: number) {
    const targetPlanet = await prisma.planet.findUnique({
      where: { galaxy_system_slot: { galaxy: fleet.targetGalaxy, system: fleet.targetSystem, slot: fleet.targetSlot } },
      select: { id: true, name: true, galaxy: true, system: true, slot: true },
    });
    if (!targetPlanet) return;
    const sender = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId }, select: { name: true, galaxy: true, system: true, slot: true } });
    const defUnits = parseUnits(fleet.units);
    const defRows = Object.keys(defUnits).filter((n) => defUnits[n] > 0)
      .map((n) => ({ name: n, before: defUnits[n], lost: 0, pem: 0, assim: 0, survivors: defUnits[n] }));
    await prisma.battleReport.create({ data: {
      tick: atTick,
      attackerPlanetId: fleet.ownerPlanetId, defenderPlanetId: targetPlanet.id,
      attackerName: sender?.name ?? "?", defenderName: targetPlanet.name,
      attackerCoords: sender ? `${sender.galaxy}:${sender.system}:${sender.slot}` : "?",
      defenderCoords: `${targetPlanet.galaxy}:${targetPlanet.system}:${targetPlanet.slot}`,
      winner: "defense",
      report: JSON.stringify({ defense: true, attacker: defRows, defender: [], ticks: 1 }),
    } });
  }

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
      const gcoord = `${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot}`;
      // Guarnição que termina HOJE num planeta SOB ATAQUE: NÃO adia a volta (senão
      // a estadia esticaria 1 tick). Defende/assimila no combate de hoje e volta
      // no MESMO tick, DEPOIS do combate — a volta é processada após o resolveSiege
      // (returnAfterCombat), relendo as units do banco pra levar as assimiladas.
      if (fleet.arriveTick <= uptoTick && underAttackThisTick.has(gcoord)) {
        besieged.add(gcoord);
        returnAfterCombat.push(fleet.id);
        continue;
      }
      // Guarnição: fica estacionada até arriveTick (= fim do reforço), aí volta.
      if (fleet.arriveTick <= uptoTick) {
        const coord = `${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot}`;
        // Avisa o dono da frota e, se defendia outro planeta, o defendido.
        await prisma.news.create({ data: { planetId: fleet.ownerPlanetId, tick: uptoTick, message: `🔙 Sua guarnição em ${coord} terminou — ${fleet.name} está voltando pra base` } });
        const defended = await prisma.planet.findUnique({ where: { galaxy_system_slot: { galaxy: fleet.targetGalaxy, system: fleet.targetSystem, slot: fleet.targetSlot } }, select: { id: true } });
        if (defended && defended.id !== fleet.ownerPlanetId) {
          const sender = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId }, select: { name: true, galaxy: true, system: true, slot: true } });
          const sc = sender ? ` (${sender.galaxy}:${sender.system}:${sender.slot})` : "";
          await prisma.news.create({ data: { planetId: defended.id, tick: uptoTick, message: `🔙 O reforço de ${sender?.name ?? "um aliado"}${sc} terminou a defesa e está voltando pra base` } });
        }
        await scheduleReturn(fleet.id, fleet, parseUnits(fleet.units));
      } else {
        // Ainda guarnecendo: registra a defesa DESTE tick (igual ataque, 1 por tick),
        // a menos que o alvo esteja sob ataque agora (aí o combate gera o relatório).
        const coord = `${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot}`;
        if (!underAttackThisTick.has(coord)) await writeGarrisonRecord(fleet, uptoTick);
      }
      continue;
    }
    if (fleet.arriveTick > uptoTick) continue;

    // Ameaça FALSA: chegou na órbita e volta SEM engajar nem guarnecer.
    // A notícia NÃO menciona "finta/falso" (se espionada, estragaria a estratégia)
    // — parece só uma frota voltando pra base, como qualquer outra.
    if (fleet.fake) {
      await prisma.news.create({ data: { planetId: fleet.ownerPlanetId, tick: uptoTick, message: `${fleet.name} está voltando pra base` } });
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
      // Avisa o planeta defendido que chegou reforço (se não for a própria frota dele).
      const sender = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId }, select: { name: true, galaxy: true, system: true, slot: true } });
      if (targetPlanet.id !== fleet.ownerPlanetId) {
        const sc = sender ? ` (${sender.galaxy}:${sender.system}:${sender.slot})` : "";
        await prisma.news.create({ data: { planetId: targetPlanet.id, tick: uptoTick, message: `🛡️ Reforço chegou: a frota de ${sender?.name ?? "um aliado"}${sc} está defendendo seu planeta (${totalUnits(parseUnits(fleet.units))} nave[s])` } });
      }
      // Registro de DEFESA no menu Combates (mesmo sem combate): comprova que a
      // frota chegou e guarneceu NESTE tick. 1 registro por tick (igual ataque) —
      // os ticks seguintes são gravados no bloco garrison acima. Se o planeta está
      // sob ataque agora, o combate combinado gera o relatório (não duplica aqui).
      const coord = `${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot}`;
      if (!underAttackThisTick.has(coord)) await writeGarrisonRecord(fleet, uptoTick);
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

  // Guarnições que terminaram HOJE num planeta que teve combate: agora que o
  // combate rodou (e gravou as naves assimiladas na frota), processa a volta no
  // MESMO tick. scheduleReturn relê as units do banco, então leva as assimiladas
  // junto — e a estadia continua sendo a combinada (não esticou 1 tick).
  for (const fleetId of returnAfterCombat) {
    const fleet = await prisma.fleet.findUnique({ where: { id: fleetId } });
    if (!fleet || fleet.status !== "garrison") continue; // pode ter sido finalizada no combate
    if (totalUnits(parseUnits(fleet.units)) <= 0) continue; // frota aniquilada: nada volta
    const coord = `${fleet.targetGalaxy}:${fleet.targetSystem}:${fleet.targetSlot}`;
    await prisma.news.create({ data: { planetId: fleet.ownerPlanetId, tick: uptoTick, message: `🔙 Sua guarnição em ${coord} terminou — ${fleet.name} está voltando pra base` } });
    const defended = await prisma.planet.findUnique({ where: { galaxy_system_slot: { galaxy: fleet.targetGalaxy, system: fleet.targetSystem, slot: fleet.targetSlot } }, select: { id: true } });
    if (defended && defended.id !== fleet.ownerPlanetId) {
      const sender = await prisma.planet.findUnique({ where: { id: fleet.ownerPlanetId }, select: { name: true, galaxy: true, system: true, slot: true } });
      const sc = sender ? ` (${sender.galaxy}:${sender.system}:${sender.slot})` : "";
      await prisma.news.create({ data: { planetId: defended.id, tick: uptoTick, message: `🔙 O reforço de ${sender?.name ?? "um aliado"}${sc} terminou a defesa e está voltando pra base` } });
    }
    await scheduleReturn(fleet.id, fleet, parseUnits(fleet.units));
  }
}

const RACE_TAG: Record<string, string> = { humanos: "Hum", daharan: "Dah", rakshasa: "Rak", mech: "c-M", insecta: "Ins" };
const ONLINE_MS = 5 * 60 * 1000;

// Visão rica de uma galáxia (setor:paralelo): cabeçalho + slots com pontuação/rank/status.
export async function viewSystem(galaxy: number, system: number, viewer: { id: string; galaxy: number; system: number } | null = null) {
  const thisGalId = galaxyId(galaxy, system);
  const nowMs = Date.now();
  const all = await prisma.planet.findMany({ include: { user: { select: { username: true, race: true, lastSeen: true } } } });
  const fleets = await prisma.fleet.findMany();
  const fleetUnitsBy: Record<string, UnitMap> = {};
  for (const f of fleets) { const fu = parseUnits(f.units); fleetUnitsBy[f.ownerPlanetId] = addUnits(fleetUnitsBy[f.ownerPlanetId] ?? {}, fu); }
  const scoreOf = (p: any) => planetScore(p, addUnits(parseUnits(p.units), fleetUnitsBy[p.id] ?? {}));

  // Rank global por pontuação.
  const ranked = all.map((p) => ({ id: p.id, score: scoreOf(p) })).sort((a, b) => b.score - a.score);
  const rankById: Record<string, number> = {};
  ranked.forEach((r, i) => { rankById[r.id] = i + 1; });

  // Pontuação e rank por galáxia (= par setor:sistema, via galaxyId).
  const galScore: Record<number, number> = {};
  for (const p of all) { const id = galaxyId(p.galaxy, p.system); galScore[id] = (galScore[id] || 0) + scoreOf(p); }
  const galRank: Record<number, number> = {};
  Object.entries(galScore).sort((a, b) => b[1] - a[1]).forEach(([g], i) => { galRank[Number(g)] = i + 1; });

  const gst = await prisma.galaxyState.findUnique({ where: { galaxy: thisGalId } });
  const nowTick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const inSystem = all.filter((p) => p.galaxy === galaxy && p.system === system);
  const byslot = new Map(inSystem.map((p) => [p.slot, p]));
  // Tag de aliança só aparece pros planetas da MESMA aliança do viewer.
  const tags = await allianceTagsForViewer(inSystem.map((p) => p.id), viewer?.id ?? null);

  // Cargo de governo de cada planeta (para colorir o nome): cg/me/mg/md.
  const roleOf = (id: string): string | null =>
    gst?.cgPlanetId === id ? "cg" : gst?.mgPlanetId === id ? "mg" : gst?.mePlanetId === id ? "me" : gst?.mdPlanetId === id ? "md" : null;

  // Raça é SEGREDO: só aparece pro próprio planeta, pro MG desta galáxia, ou
  // pra quem já espionou o alvo (fica salvo). Resto vê "?".
  const viewerGalId = viewer ? galaxyId(viewer.galaxy, viewer.system) : null;
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
    const sameGalaxy = viewerGalId == null || thisGalId === viewerGalId;
    const showRace = viewer?.id === p.id || isMG || spiedRace.has(`${galaxy}:${system}:${slot}|${p.name}`);
    slots.push({
      slot, occupied: true, planetId: p.id, name: p.name, preposition: p.preposition,
      commander: p.user.username,
      skin: typeof p.skin === "string" && p.skin ? p.skin : "terra",
      race: showRace ? p.user.race : null,
      raceTag: showRace ? (RACE_TAG[p.user.race] ?? "?") : null,
      role: roleOf(p.id),
      allianceTag: tags[p.id] ?? null,
      roids: p.roidMetalium + p.roidCarbonum + p.roidPlutonium,
      score: scoreOf(p), rank: rankById[p.id],
      online: sameGalaxy ? idleMs < ONLINE_MS : null,
      idleMs: sameGalaxy ? idleMs : null,
      protected: nowTick < p.createdTick + NEWBIE_PROTECTION_TICKS || nowTick < (p.shieldUntilTick ?? 0),
    });
  }
  return {
    galaxy, system,
    name: gst?.name ?? null,
    flag: gst?.flag ?? null,
    score: galScore[thisGalId] ?? 0,
    rank: galRank[thisGalId] ?? null,
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

  // Inclui "garrison": defesa que JÁ CHEGOU e está guarnecendo o planeta (ex.: defesa
  // de aliado na mesma galáxia, TEC 0). Sem isso a linha de defesa somia de "Frotas
  // chegando" assim que a frota chegava (ficava só em "Movimentação").
  const fleets = await prisma.fleet.findMany({ where: { targetGalaxy: me.galaxy, targetSystem: me.system, status: { in: ["outbound", "engaged", "garrison"] } } });
  const ownerIds = [...new Set(fleets.map((f) => f.ownerPlanetId))];
  const owners = await prisma.planet.findMany({ where: { id: { in: ownerIds } }, include: { user: { select: { username: true } } } });
  const ownerMap = new Map(owners.map((o) => [o.id, o]));
  const targets = await prisma.planet.findMany({ where: { galaxy: me.galaxy, system: me.system }, select: { system: true, slot: true, name: true } });
  const targetMap = new Map(targets.map((t) => [`${t.system}:${t.slot}`, t.name]));

  const list = fleets.map((f) => {
    const o = ownerMap.get(f.ownerPlanetId);
    return {
      origin: `${f.originGalaxy}:${f.originSystem}:${f.originSlot}`,
      originName: o?.name ?? null,   // nome do planeta de origem (pro formato "Planeta de Comandante (coord)")
      owner: o?.user.username ?? "?",
      fleetName: f.name,             // nome que o atacante deu à frota (intel, como no GW original)
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      targetName: targetMap.get(`${f.targetSystem}:${f.targetSlot}`) ?? null,
      mission: f.mission,            // "attack" | "transport"
      status: f.status,              // "outbound" | "engaged"
      // Radar: frota MINHA mostra tudo; frota de terceiro esconde naves invisíveis (Rakshasa).
      ships: radarVisibleCount(parseUnits(f.units)), // radar esconde as invisíveis até de quem é dono
      ticks: Math.max(0, f.arriveTick - nowTick),
      toMe: f.targetSystem === me.system && f.targetSlot === me.slot,
      own: f.ownerPlanetId === planetId, // frota MINHA (não conta como ameaça/reforço recebido)
    };
  }).sort((a, b) =>
    // Igual ao GW original: ATAQUES primeiro (em cima), DEFESAS depois — cada grupo por TEC.
    (a.mission === "attack" ? 0 : 1) - (b.mission === "attack" ? 0 : 1) || a.ticks - b.ticks
  );

  // Movimentação da galáxia: TODAS as frotas em movimento dos planetas da MINHA
  // galáxia (ataque/defesa), agrupadas por planeta dono.
  const galaxyPlanets = await prisma.planet.findMany({ where: { galaxy: me.galaxy, system: me.system }, include: { user: { select: { username: true } } } });
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
      ships: radarVisibleCount(parseUnits(f.units)), // radar esconde as invisíveis até de quem é dono
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

// Tráfego pra desenhar no radar da galáxia que o jogador está VISUALIZANDO (não só
// a dele). Mostra: (a) se é a galáxia do jogador, todo o tráfego entrante; (b) em
// qualquer galáxia, as frotas DELE a caminho de lá (pra ver a própria linha de ataque).
export async function viewedTraffic(planetId: string, galaxy: number, system: number) {
  const nowTick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const me = await prisma.planet.findUnique({ where: { id: planetId }, select: { galaxy: true, system: true } });
  const isMine = !!me && me.galaxy === galaxy && me.system === system;
  // Frotas com destino nessa galáxia. Se não é a minha, só as MINHAS (evita vazar
  // ataques de terceiros contra outros).
  // Inclui "garrison": frota que JÁ CHEGOU e está defendendo/guarnecendo o planeta
  // (ex.: defesa de aliado na mesma galáxia, TEC 0). Sem isso a linha de defesa some
  // do tráfego assim que a frota chega.
  const where = isMine
    ? { targetGalaxy: galaxy, targetSystem: system, status: { in: ["outbound", "engaged", "garrison"] } }
    : { ownerPlanetId: planetId, targetGalaxy: galaxy, targetSystem: system, status: { in: ["outbound", "engaged", "garrison"] } };
  const fleets = await prisma.fleet.findMany({ where: where as any });
  const fleetsOut = fleets.map((f) => ({
    origin: `${f.originGalaxy}:${f.originSystem}:${f.originSlot}`,
    target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
    mission: f.mission,
    status: f.status,
    ships: radarVisibleCount(parseUnits(f.units)),
    ticks: Math.max(0, f.arriveTick - nowTick),
    own: f.ownerPlanetId === planetId,
  })).sort((a, b) => a.ticks - b.ticks);
  return { fleets: fleetsOut };
}
