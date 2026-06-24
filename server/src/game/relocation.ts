import { prisma } from "../db.js";
import { GALAXIES, SLOTS_PER_SYSTEM, MAX_AUTO_EXILES } from "./constants.js";

// Acha o primeiro slot livre numa galáxia (varre sistemas/slots).
async function findFreeSlot(galaxy: number): Promise<{ system: number; slot: number } | null> {
  const taken = new Set(
    (await prisma.planet.findMany({ where: { galaxy }, select: { system: true, slot: true } }))
      .map((p) => `${p.system}:${p.slot}`)
  );
  for (let system = 1; system <= 60; system++) {
    for (let slot = 1; slot <= SLOTS_PER_SYSTEM; slot++) {
      if (!taken.has(`${system}:${slot}`)) return { system, slot };
    }
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

// Move o planeta para uma galáxia específica (base da galáxia privada futura).
export async function relocate(planetId: string, galaxy: number): Promise<{ galaxy: number; system: number; slot: number }> {
  const planet = await prisma.planet.findUnique({ where: { id: planetId } });
  if (!planet) throw new Error("Planeta nao encontrado");
  if (planet.galaxy === galaxy) throw new Error("Você já está nessa galáxia");
  const free = await findFreeSlot(galaxy);
  if (!free) throw new Error("Essa galáxia está cheia");
  await leaveGalaxy(planetId, planet.galaxy);
  await prisma.planet.update({ where: { id: planetId }, data: { galaxy, system: free.system, slot: free.slot } });
  return { galaxy, system: free.system, slot: free.slot };
}

// Auto-exílio: cai numa galáxia ALEATÓRIA não-privada (≠ atual). Máx 3 por planeta.
export async function autoExile(planetId: string) {
  const planet = await prisma.planet.findUnique({ where: { id: planetId } });
  if (!planet) throw new Error("Planeta nao encontrado");
  if (planet.autoExiles <= 0) throw new Error("Você não tem mais auto-exílios");

  const privates = new Set(
    (await prisma.galaxyState.findMany({ where: { isPrivate: true }, select: { galaxy: true } })).map((s) => s.galaxy)
  );
  // candidatas: todas menos a atual e as privadas, embaralhadas
  const candidates = [];
  for (let g = 1; g <= GALAXIES; g++) if (g !== planet.galaxy && !privates.has(g)) candidates.push(g);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const g of candidates) {
    const free = await findFreeSlot(g);
    if (free) {
      await leaveGalaxy(planetId, planet.galaxy);
      await prisma.planet.update({
        where: { id: planetId },
        data: { galaxy: g, system: free.system, slot: free.slot, autoExiles: { decrement: 1 } },
      });
      const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
      await prisma.news.create({ data: { planetId, tick, message: `🪂 Auto-exílio: seu planeta foi realocado para ${g}:${free.system}:${free.slot}` } });
      return { galaxy: g, system: free.system, slot: free.slot, autoExilesLeft: planet.autoExiles - 1 };
    }
  }
  throw new Error("Não há galáxia pública com espaço livre");
}

export { MAX_AUTO_EXILES };
