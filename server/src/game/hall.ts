import { prisma } from "../db.js";
import { totalRoids } from "./roids.js";
import { scoreOfUnits } from "./score.js";
import { parseUnits } from "./unitmap.js";
import { STARTING } from "./constants.js";

const STARTING_ROIDS = STARTING.roidMetalium + STARTING.roidCarbonum + STARTING.roidPlutonium;

// Grava o top-3 do round atual no Hall da Fama (antes de um reset).
// Ranqueia por roids — a mesma métrica do ranking visível no jogo.
export async function snapshotHallOfFame() {
  const planets = await prisma.planet.findMany({ include: { user: { select: { username: true, race: true } } } });
  if (!planets.length) return;
  const fleets = await prisma.fleet.findMany({ select: { ownerPlanetId: true, units: true } });
  const fleetScore: Record<string, number> = {};
  for (const f of fleets) fleetScore[f.ownerPlanetId] = (fleetScore[f.ownerPlanetId] || 0) + scoreOfUnits(parseUnits(f.units));

  const ranked = planets
    .map((p) => ({
      commander: p.user.username, planet: p.name, coords: `${p.galaxy}:${p.system}:${p.slot}`,
      race: p.user.race, roids: totalRoids(p),
      score: scoreOfUnits(parseUnits(p.units)) + (fleetScore[p.id] || 0),
    }))
    .sort((a, b) => b.roids - a.roids)
    .slice(0, 3);

  // Universo recém-zerado (sem progresso): não registra round "fantasma" no Hall.
  // Acontece se um reset disparar logo após outro (ex.: reset manual numa
  // instância agendada, que o motor re-alinha em seguida).
  if (!ranked.some((r) => r.score > 0 || r.roids > STARTING_ROIDS)) return;

  const last = await prisma.hallOfFame.aggregate({ _max: { round: true } });
  const round = (last._max.round ?? 0) + 1;
  await prisma.hallOfFame.createMany({
    data: ranked.map((r, i) => ({ round, position: i + 1, ...r })),
  });
  console.log(`🏆 Hall da Fama do round #${round}: ${ranked.map((r, i) => `${i + 1}º ${r.commander}`).join(", ")}`);
}
