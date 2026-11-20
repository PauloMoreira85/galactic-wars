import { prisma } from "../db.js";
import { parseUnits, totalUnits } from "./unitmap.js";

export const MAX_MEMBERS = 60;
// dc = Defense Commander · ac = Attack Commander (ambos veem a movimentação).
export const ROLES = ["lider", "alto_comando", "dc", "ac", "scanner", "porta_voz", "recruta"];
export const ROLE_LABEL: Record<string, string> = {
  lider: "TL (Tag Leader)", alto_comando: "Alto Comando", dc: "DC (Defense Commander)", ac: "AC (Attack Commander)", scanner: "Scanner", porta_voz: "Porta-Voz", recruta: "Recruta",
};

// Cargos que enxergam o painel de movimentação da aliança (DC e AC = os "olhos").
export function canSeeFleets(role: string) { return role === "dc" || role === "ac"; }

async function memberOf(planetId: string) {
  return prisma.allianceMember.findUnique({ where: { planetId } });
}
function canInvite(role: string) { return role === "lider" || role === "alto_comando"; }

// Cria uma aliança; o criador vira Líder.
export async function createAlliance(planetId: string, name: string, tag: string) {
  if (await memberOf(planetId)) throw new Error("Voce ja esta em uma alianca");
  name = name.trim(); tag = tag.trim();
  if (name.length < 3 || tag.length < 2) throw new Error("Nome (min 3) e tag (min 2) obrigatorios");
  if (await prisma.alliance.findFirst({ where: { OR: [{ name }, { tag }] } })) throw new Error("Nome ou tag ja em uso");
  const a = await prisma.alliance.create({ data: { name, tag } });
  await prisma.allianceMember.create({ data: { planetId, allianceId: a.id, role: "lider" } });
  return a;
}

// Convida um planeta (por username do comandante).
export async function invitePlayer(inviterPlanetId: string, username: string) {
  const mem = await memberOf(inviterPlanetId);
  if (!mem || !canInvite(mem.role)) throw new Error("Apenas Lider ou Alto Comando pode convidar");
  const target = await prisma.user.findUnique({ where: { username }, include: { planet: true } });
  if (!target?.planet) throw new Error("Jogador nao encontrado");
  if (await memberOf(target.planet.id)) throw new Error("Esse jogador ja esta em uma alianca");
  const count = await prisma.allianceMember.count({ where: { allianceId: mem.allianceId } });
  if (count >= MAX_MEMBERS) throw new Error(`Alianca cheia (max ${MAX_MEMBERS})`);
  await prisma.allianceInvite.upsert({
    where: { allianceId_planetId: { allianceId: mem.allianceId, planetId: target.planet.id } },
    update: {}, create: { allianceId: mem.allianceId, planetId: target.planet.id },
  });
}

// Aceita um convite.
export async function acceptInvite(planetId: string, allianceId: string) {
  if (await memberOf(planetId)) throw new Error("Voce ja esta em uma alianca");
  const inv = await prisma.allianceInvite.findUnique({ where: { allianceId_planetId: { allianceId, planetId } } });
  if (!inv) throw new Error("Convite nao encontrado");
  const count = await prisma.allianceMember.count({ where: { allianceId } });
  if (count >= MAX_MEMBERS) throw new Error("Alianca cheia");
  await prisma.$transaction([
    prisma.allianceMember.create({ data: { planetId, allianceId, role: "recruta" } }),
    prisma.allianceInvite.deleteMany({ where: { planetId } }), // limpa convites pendentes
  ]);
}

export async function leaveAlliance(planetId: string) {
  const mem = await memberOf(planetId);
  if (!mem) throw new Error("Voce nao esta em uma alianca");
  const count = await prisma.allianceMember.count({ where: { allianceId: mem.allianceId } });
  if (mem.role === "lider" && count > 1) throw new Error("Transfira a lideranca antes de sair (ou expulse os membros)");
  await prisma.allianceMember.delete({ where: { planetId } });
  if (count <= 1) await prisma.alliance.delete({ where: { id: mem.allianceId } }); // ultimo membro -> dissolve
}

export async function kickMember(liderPlanetId: string, targetPlanetId: string) {
  const mem = await memberOf(liderPlanetId);
  if (!mem || mem.role !== "lider") throw new Error("Apenas o Lider pode expulsar");
  if (targetPlanetId === liderPlanetId) throw new Error("Voce nao pode se expulsar");
  const t = await memberOf(targetPlanetId);
  if (!t || t.allianceId !== mem.allianceId) throw new Error("Esse planeta nao e da sua alianca");
  await prisma.allianceMember.delete({ where: { planetId: targetPlanetId } });
}

// Define cargo. Promover alguem a Lider rebaixa o Lider atual a Alto Comando.
export async function setMemberRole(liderPlanetId: string, targetPlanetId: string, role: string) {
  const mem = await memberOf(liderPlanetId);
  if (!mem || mem.role !== "lider") throw new Error("Apenas o Lider pode mudar cargos");
  if (!ROLES.includes(role)) throw new Error("Cargo invalido");
  const t = await memberOf(targetPlanetId);
  if (!t || t.allianceId !== mem.allianceId) throw new Error("Esse planeta nao e da sua alianca");
  if (role === "lider") {
    await prisma.$transaction([
      prisma.allianceMember.update({ where: { planetId: targetPlanetId }, data: { role: "lider" } }),
      prisma.allianceMember.update({ where: { planetId: liderPlanetId }, data: { role: "alto_comando" } }),
    ]);
  } else {
    await prisma.allianceMember.update({ where: { planetId: targetPlanetId }, data: { role } });
  }
}

// Visão da aliança do jogador (ou convites pendentes se não tiver aliança).
export async function allianceView(planetId: string) {
  const mem = await memberOf(planetId);
  if (!mem) {
    const invites = await prisma.allianceInvite.findMany({ where: { planetId }, include: { alliance: true } });
    return { inAlliance: false, invites: invites.map((i) => ({ allianceId: i.allianceId, name: i.alliance.name, tag: i.alliance.tag })) };
  }
  const alliance = await prisma.alliance.findUnique({ where: { id: mem.allianceId } });
  const members = await prisma.allianceMember.findMany({ where: { allianceId: mem.allianceId } });
  const planets = await prisma.planet.findMany({
    where: { id: { in: members.map((m) => m.planetId) } },
    include: { user: { select: { username: true } } },
  });
  const pById = new Map(planets.map((p) => [p.id, p]));
  const pending = canInvite(mem.role) ? await prisma.allianceInvite.findMany({ where: { allianceId: mem.allianceId } }) : [];
  const pendingPlanets = await prisma.planet.findMany({ where: { id: { in: pending.map((i) => i.planetId) } }, include: { user: { select: { username: true } } } });

  return {
    inAlliance: true,
    id: alliance!.id, name: alliance!.name, tag: alliance!.tag,
    myRole: mem.role,
    canInvite: canInvite(mem.role), isLeader: mem.role === "lider",
    members: members.map((m) => {
      const p: any = pById.get(m.planetId);
      return { planetId: m.planetId, role: m.role, name: p?.name ?? "?", commander: p?.user.username ?? "?", coords: p ? `${p.galaxy}:${p.system}:${p.slot}` : "?" };
    }).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)),
    pending: pendingPlanets.map((p) => ({ planetId: p.id, name: p.name, commander: p.user.username })),
  };
}

// Mapa planetId -> tag da alianca (para mostrar na galaxia).
export async function allianceTags(planetIds: string[]): Promise<Record<string, string>> {
  const mems = await prisma.allianceMember.findMany({ where: { planetId: { in: planetIds } }, include: { alliance: true } });
  const out: Record<string, string> = {};
  for (const m of mems) out[m.planetId] = m.alliance.tag;
  return out;
}

// Os dois planetas estão na MESMA aliança? (proteção: aliados não se atacam.)
export async function sameAlliance(planetA: string, planetB: string): Promise<boolean> {
  if (planetA === planetB) return false;
  const mems = await prisma.allianceMember.findMany({ where: { planetId: { in: [planetA, planetB] } }, select: { planetId: true, allianceId: true } });
  if (mems.length < 2) return false;
  return mems[0].allianceId === mems[1].allianceId;
}

// IDs dos OUTROS membros da aliança de um planeta (pra avisar sobre ataque a aliado).
export async function allianceMateIds(planetId: string): Promise<string[]> {
  const me = await prisma.allianceMember.findUnique({ where: { planetId } });
  if (!me) return [];
  const mates = await prisma.allianceMember.findMany({ where: { allianceId: me.allianceId, NOT: { planetId } }, select: { planetId: true } });
  return mates.map((m) => m.planetId);
}

// ===== Painel de movimentação da aliança (só DC e AC) =====
// Mostra: (1) frotas dos MEMBROS em movimento (defesas/ataques indo/voltando) e
// (2) ataques INIMIGOS a caminho de qualquer membro. Permite ao DC/AC organizar
// a defesa e aos ACs sincronizar waves — a informação fica restrita aos cargos.
export async function allianceFleetsView(planetId: string) {
  const me = await prisma.allianceMember.findUnique({ where: { planetId } });
  if (!me) throw new Error("Voce nao esta em uma alianca");
  if (!canSeeFleets(me.role)) throw new Error("Apenas DC e AC veem a movimentação da aliança");

  const members = await prisma.allianceMember.findMany({ where: { allianceId: me.allianceId }, select: { planetId: true } });
  const memberIds = members.map((m) => m.planetId);
  const planets = await prisma.planet.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true, galaxy: true, system: true, slot: true, user: { select: { username: true } } },
  });
  const pById = new Map(planets.map((p) => [p.id, p]));
  const coordOf = (p: any) => p ? `${p.galaxy}:${p.system}:${p.slot}` : "?";
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const STATUS: Record<string, string> = { outbound: "indo", engaged: "em combate", returning: "voltando", garrison: "defendendo", idle: "na base" };

  // (1) Frotas dos membros que estão fora da base.
  const mine = await prisma.fleet.findMany({ where: { ownerPlanetId: { in: memberIds }, status: { in: ["outbound", "engaged", "returning", "garrison"] } } });
  const memberFleets = mine.map((f) => {
    const owner = pById.get(f.ownerPlanetId);
    return {
      owner: owner?.user.username ?? "?", ownerCoords: coordOf(owner),
      name: f.name, mission: f.mission, status: STATUS[f.status] ?? f.status,
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      ships: totalUnits(parseUnits(f.units)),
      ticksLeft: f.status === "engaged" ? 0 : Math.max(0, f.arriveTick - tick),
    };
  }).sort((a, b) => a.ticksLeft - b.ticksLeft);

  // (2) Ataques INIMIGOS (de quem não é da aliança) a caminho de um membro.
  const memberCoords = new Set(planets.map((p) => `${p.galaxy}:${p.system}:${p.slot}`));
  const incoming = await prisma.fleet.findMany({
    where: {
      mission: "attack", status: { in: ["outbound", "engaged"] },
      ownerPlanetId: { notIn: memberIds },
      OR: planets.map((p) => ({ targetGalaxy: p.galaxy, targetSystem: p.system, targetSlot: p.slot })),
    },
  });
  // Frota falsa (fake) não aparece — é finta, ninguém sabe que é falsa.
  const enemyOwners = await prisma.planet.findMany({ where: { id: { in: [...new Set(incoming.map((f) => f.ownerPlanetId))] } }, select: { id: true, name: true, galaxy: true, system: true, slot: true } });
  const eById = new Map(enemyOwners.map((p) => [p.id, p]));
  const attacks = incoming.filter((f) => !f.fake && memberCoords.has(`${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`)).map((f) => {
    const atk = eById.get(f.ownerPlanetId);
    return {
      attacker: atk?.name ?? "?", attackerCoords: atk ? `${atk.galaxy}:${atk.system}:${atk.slot}` : "?",
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      status: STATUS[f.status] ?? f.status,
      ticksLeft: f.status === "engaged" ? 0 : Math.max(0, f.arriveTick - tick),
    };
  }).sort((a, b) => a.ticksLeft - b.ticksLeft);

  return { role: me.role, memberFleets, attacks };
}
