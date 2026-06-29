import { prisma } from "../db.js";
import { GALAXIES } from "./constants.js";
import { relocate } from "./relocation.js";
import { galaxyId, galaxyWhere, NUM_PARALELOS } from "./geo.js";

// Galáxias privadas ocupam os SETORES 6..10 (logo após os 5 públicos), sem colidir
// com o universo público (setores 1..5). O id interno vem de galaxyId(setor, paralelo).
const PRIVATE_SETOR_MIN = 6;
const PRIVATE_SETOR_MAX = 10;

async function userOf(planetId: string) {
  return prisma.planet.findUnique({ where: { id: planetId }, include: { user: true } });
}

// Associado cria uma galáxia privada (vira dono e é realocado para lá).
export async function createPrivateGalaxy(planetId: string, name: string) {
  const p = await userOf(planetId);
  if (!p) throw new Error("Planeta nao encontrado");
  if (!p.user.associado) throw new Error("Apenas Associados podem criar galáxia privada");
  const already = await prisma.galaxyState.findFirst({ where: { ownerPlanetId: planetId } });
  if (already) throw new Error("Você já tem uma galáxia privada");

  // Acha a primeira galáxia privada livre (setores 6-10, espalhando entre eles
  // antes de usar paralelos maiores). Livre = sem GalaxyState e sem planetas.
  let g = 0;
  outer:
  for (let par = 1; par <= NUM_PARALELOS; par++) {
    for (let setor = PRIVATE_SETOR_MIN; setor <= PRIVATE_SETOR_MAX; setor++) {
      const id = galaxyId(setor, par);
      const st = await prisma.galaxyState.findUnique({ where: { galaxy: id } });
      const occupied = await prisma.planet.count({ where: { galaxy: setor, system: par } });
      if (!st && occupied === 0) { g = id; break outer; }
    }
  }
  if (!g) throw new Error("Sem espaço para galáxia privada (setores 6-10 lotados)");
  await prisma.galaxyState.create({
    data: { galaxy: g, isPrivate: true, ownerPlanetId: planetId, name: name.trim().slice(0, 40) || `Galáxia Privada` },
  });
  await relocate(planetId, g); // dono entra na própria galáxia
  return { galaxy: g };
}

// Dono convida um jogador (por nome de líder) para a galáxia privada.
export async function invitePrivate(ownerPlanetId: string, username: string) {
  const st = await prisma.galaxyState.findFirst({ where: { ownerPlanetId, isPrivate: true } });
  if (!st) throw new Error("Você não tem uma galáxia privada");
  const user = await prisma.user.findUnique({ where: { username: username.trim() }, include: { planet: true } });
  if (!user?.planet) throw new Error("Jogador não encontrado");
  if (galaxyId(user.planet.galaxy, user.planet.system) === st.galaxy) throw new Error("Esse jogador já está na sua galáxia");
  await prisma.galaxyInvite.upsert({
    where: { galaxy_planetId: { galaxy: st.galaxy, planetId: user.planet.id } },
    update: {}, create: { galaxy: st.galaxy, planetId: user.planet.id },
  });
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  await prisma.news.create({ data: { planetId: user.planet.id, tick, message: `🔒 Você foi convidado para a galáxia privada "${st.name}"` } });
  return { ok: true };
}

// Convidado entra na galáxia privada (realoca pra lá).
export async function joinPrivate(planetId: string, galaxy: number) {
  const inv = await prisma.galaxyInvite.findUnique({ where: { galaxy_planetId: { galaxy, planetId } } });
  if (!inv) throw new Error("Você não foi convidado para essa galáxia");
  const r = await relocate(planetId, galaxy);
  await prisma.galaxyInvite.deleteMany({ where: { planetId, galaxy } });
  return r;
}

// Visão de galáxia privada para um planeta: a que ele possui + convites recebidos.
export async function privateView(planetId: string) {
  const owned = await prisma.galaxyState.findFirst({ where: { ownerPlanetId: planetId, isPrivate: true } });
  let members: { name: string; commander: string; coords: string }[] = [];
  if (owned) {
    const ps = await prisma.planet.findMany({ where: galaxyWhere(owned.galaxy), include: { user: { select: { username: true } } } });
    members = ps.map((p) => ({ name: p.name, commander: p.user.username, coords: `${p.galaxy}:${p.system}:${p.slot}` }));
  }
  const invites = await prisma.galaxyInvite.findMany({ where: { planetId } });
  const inviteList = await Promise.all(invites.map(async (i) => {
    const st = await prisma.galaxyState.findUnique({ where: { galaxy: i.galaxy } });
    return { galaxy: i.galaxy, name: st?.name ?? `Galáxia ${i.galaxy}` };
  }));
  return {
    owned: owned ? { galaxy: owned.galaxy, name: owned.name, members } : null,
    invites: inviteList,
  };
}

export { GALAXIES };
