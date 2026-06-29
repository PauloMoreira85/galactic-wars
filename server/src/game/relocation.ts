import { prisma } from "../db.js";
import { GALAXIES, SLOTS_PER_SYSTEM, MAX_AUTO_EXILES } from "./constants.js";
import { galaxyId, galaxyWhere } from "./geo.js";

// Acha o primeiro slot livre numa galáxia (= par setor:sistema, pelo id).
async function findFreeSlot(galId: number): Promise<{ system: number; slot: number } | null> {
  const where = galaxyWhere(galId); // { galaxy: setor, system: sistema }
  const taken = new Set(
    (await prisma.planet.findMany({ where, select: { slot: true } })).map((p) => p.slot)
  );
  for (let slot = 1; slot <= SLOTS_PER_SYSTEM; slot++) {
    if (!taken.has(slot)) return { system: where.system, slot };
  }
  return null;
}

// Limpa cargos/votos do planeta na galáxia que ele está deixando.
async function leaveGalaxy(planetId: string, oldGalaxy: number) {
  const st = await prisma.galaxyState.findUnique({ where: { galaxy: oldGalaxy } });
  if (st) {
    const data: any = {};
    if (st.cgPlanetId === planetId) data.cgPlanetId = null;
    if (st.mePlanetId === planetId) data.mePlanetId = null;
    if (st.mgPlanetId === planetId) data.mgPlanetId = null;
    if (st.mdPlanetId === planetId) data.mdPlanetId = null;
    if (Object.keys(data).length) await prisma.galaxyState.update({ where: { galaxy: oldGalaxy }, data });
  }
  // Remove o voto do planeta e votos feitos NELE.
  await prisma.galaxyVote.deleteMany({ where: { OR: [{ voterPlanetId: planetId }, { candidatePlanetId: planetId }] } });
}

// Move o planeta para uma galáxia específica (pelo id; base de galáxia privada).
export async function relocate(planetId: string, galId: number): Promise<{ galaxy: number; system: number; slot: number }> {
  const planet = await prisma.planet.findUnique({ where: { id: planetId } });
  if (!planet) throw new Error("Planeta nao encontrado");
  const curGalId = galaxyId(planet.galaxy, planet.system);
  if (curGalId === galId) throw new Error("Você já está nessa galáxia");
  const free = await findFreeSlot(galId);
  if (!free) throw new Error("Essa galáxia está cheia");
  await leaveGalaxy(planetId, curGalId);
  const setor = galaxyWhere(galId).galaxy;
  await prisma.planet.update({ where: { id: planetId }, data: { galaxy: setor, system: free.system, slot: free.slot } });
  return { galaxy: setor, system: free.system, slot: free.slot };
}

// Auto-exílio: cai numa galáxia ALEATÓRIA não-privada (≠ atual). Máx 3 por planeta.
export async function autoExile(planetId: string) {
  const planet = await prisma.planet.findUnique({ where: { id: planetId } });
  if (!planet) throw new Error("Planeta nao encontrado");
  if (planet.autoExiles <= 0) throw new Error("Você não tem mais auto-exílios");

  const privates = new Set(
    (await prisma.galaxyState.findMany({ where: { isPrivate: true }, select: { galaxy: true } })).map((s) => s.galaxy)
  );
  const curGalId = galaxyId(planet.galaxy, planet.system);
  // candidatas: todas as galáxias públicas menos a atual e as privadas, embaralhadas
  const candidates = [];
  for (let id = 1; id <= GALAXIES; id++) if (id !== curGalId && !privates.has(id)) candidates.push(id);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const id of candidates) {
    const free = await findFreeSlot(id);
    if (free) {
      const setor = galaxyWhere(id).galaxy;
      await leaveGalaxy(planetId, curGalId);
      await prisma.planet.update({
        where: { id: planetId },
        data: { galaxy: setor, system: free.system, slot: free.slot, autoExiles: { decrement: 1 }, morale: { increment: 10 } },
      });
      const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
      await prisma.news.create({ data: { planetId, tick, message: `🪂 Auto-exílio: seu planeta foi realocado para ${setor}:${free.system}:${free.slot}` } });
      return { galaxy: setor, system: free.system, slot: free.slot, autoExilesLeft: planet.autoExiles - 1 };
    }
  }
  throw new Error("Não há galáxia pública com espaço livre");
}

export { MAX_AUTO_EXILES };
