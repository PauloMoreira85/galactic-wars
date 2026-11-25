import { prisma } from "../db.js";
import { GALAXIES } from "./constants.js";
import { relocate } from "./relocation.js";
import { galaxyId, galaxyWhere, NUM_SETORES, NUM_PARALELOS } from "./geo.js";

const UNIVERSO_MAX_ID = NUM_SETORES * NUM_PARALELOS; // 30

async function userOf(planetId: string) {
  return prisma.planet.findUnique({ where: { id: planetId }, include: { user: true } });
}

// Sorteia uma galáxia VAZIA do universo (sem GalaxyState e sem planetas). null se não houver.
async function sortearGalaxiaVazia(): Promise<number | null> {
  const livres: number[] = [];
  for (let setor = 1; setor <= NUM_SETORES; setor++) {
    for (let par = 1; par <= NUM_PARALELOS; par++) {
      const id = galaxyId(setor, par);
      const st = await prisma.galaxyState.findUnique({ where: { galaxy: id } });
      if (st) continue; // já tem estado (pública em uso ou outra privada)
      const occupied = await prisma.planet.count({ where: { galaxy: setor, system: par } });
      if (occupied === 0) livres.push(id);
    }
  }
  if (livres.length === 0) return null;
  return livres[Math.floor(Math.random() * livres.length)];
}

// Associado cria uma galáxia privada (vira dono e é realocado para lá).
// A galáxia privada é SORTEADA entre as galáxias VAZIAS do universo — não há
// setores reservados a privadas: qualquer galáxia livre pode virar uma.
export async function createPrivateGalaxy(planetId: string, name: string) {
  const p = await userOf(planetId);
  if (!p) throw new Error("Planeta nao encontrado");
  // Qualquer jogador pode criar 1 galáxia privada (não exige ser Associado).
  const already = await prisma.galaxyState.findFirst({ where: { ownerPlanetId: planetId } });
  if (already) throw new Error("Você já tem uma galáxia privada");

  const g = await sortearGalaxiaVazia();
  if (g == null) throw new Error("Sem galáxia vazia no universo para criar uma privada agora");
  await prisma.galaxyState.create({
    data: { galaxy: g, isPrivate: true, ownerPlanetId: planetId, name: name.trim().slice(0, 40) || `Galáxia Privada` },
  });
  await relocate(planetId, g); // dono entra na própria galáxia
  return { galaxy: g };
}

// RECRIAR a galáxia privada na regra NOVA (sorteio no universo). Só pra quem é
// DONO de uma privada da regra ANTIGA (fora do universo, id > 30). Só o CRIADOR
// muda: ele sai da privada antiga e é realocado pra uma galáxia vazia sorteada em
// 1..30, onde cria uma privada nova. Os MEMBROS continuam onde estão — a galáxia
// antiga passa a posse pro próximo membro (ou se dissolve se ficar vazia).
export async function recreatePrivateGalaxy(planetId: string) {
  const old = await prisma.galaxyState.findFirst({ where: { ownerPlanetId: planetId, isPrivate: true } });
  if (!old) throw new Error("Você não tem uma galáxia privada para recriar");
  if (old.galaxy <= UNIVERSO_MAX_ID) throw new Error("Sua galáxia privada já está na regra nova");

  const novoId = await sortearGalaxiaVazia();
  if (novoId == null) throw new Error("Sem galáxia vazia no universo agora — tente de novo mais tarde");

  // Quem continua na galáxia antiga (todos menos o criador que vai sair).
  const w = galaxyWhere(old.galaxy);
  const restantes = await prisma.planet.findMany({
    where: { galaxy: w.galaxy, system: w.system, id: { not: planetId } },
    select: { id: true },
  });

  // Passa a posse da galáxia antiga pro próximo membro; se ninguém ficar, dissolve.
  if (restantes.length > 0) {
    const novoDono = restantes[0].id;
    const data: any = { ownerPlanetId: novoDono };
    if (old.cgPlanetId === planetId) data.cgPlanetId = null;
    if (old.mePlanetId === planetId) data.mePlanetId = null;
    if (old.mgPlanetId === planetId) data.mgPlanetId = null;
    if (old.mdPlanetId === planetId) data.mdPlanetId = null;
    await prisma.galaxyState.update({ where: { galaxy: old.galaxy }, data });
  } else {
    await prisma.galaxyInvite.deleteMany({ where: { galaxy: old.galaxy } });
    await prisma.galaxyState.delete({ where: { galaxy: old.galaxy } });
  }

  // Cria a nova privada só pro criador (sorteada) e realoca ELE pra lá.
  await prisma.galaxyState.create({
    data: { galaxy: novoId, isPrivate: true, ownerPlanetId: planetId, name: old.name ?? "Galáxia Privada" },
  });
  await relocate(planetId, novoId);
  return { galaxy: novoId };
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
  await prisma.news.create({ data: { planetId: user.planet.id, tick, message: `🔒 Você foi convidado para a galáxia privada "${st.name}" — aceite ou recuse em Associados (ou na aba Galáxia).` } });
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

// Convidado RECUSA o convite (remove sem entrar).
export async function declinePrivate(planetId: string, galaxy: number) {
  await prisma.galaxyInvite.deleteMany({ where: { planetId, galaxy } });
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
    // canRecreate: a privada do dono está na regra ANTIGA (id > 30) e pode ser
    // recriada no universo novo (leva os membros junto).
    canRecreate: !!owned && owned.galaxy > UNIVERSO_MAX_ID,
    invites: inviteList,
  };
}

export { GALAXIES };
