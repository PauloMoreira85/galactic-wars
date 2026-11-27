import { prisma } from "./db.js";
import { galaxyId } from "./game/geo.js";
import { parseUnits, totalUnits, addUnits, type UnitMap } from "./game/unitmap.js";
import { planetScore } from "./game/score.js";

// Varredura do universo: lista cada galáxia (setor:paralelo) com nº de players,
// pontuação total, roids totais, naves totais e as alianças presentes. Serve pra
// decidir balanceamento de guerra (juntar galáxias, equilibrar lados).
//
// Uso (no droplet): node server/dist/scan-universe.js
// Opcional: node server/dist/scan-universe.js 4:6 8:1 6:3   (detalha esses alvos)

function fmt(n: number) { return Math.round(n).toLocaleString("pt-BR"); }

async function main() {
  const foco = process.argv.slice(2); // ex.: "4:6" "8:1" "6:3"
  const planets = await prisma.planet.findMany({
    include: { user: { select: { username: true } } },
    orderBy: [{ galaxy: "asc" }, { system: "asc" }, { slot: "asc" }],
  });
  const fleets = await prisma.fleet.findMany({ select: { ownerPlanetId: true, units: true } });
  const fleetByPlanet = new Map<string, UnitMap>();
  for (const f of fleets) {
    const cur = fleetByPlanet.get(f.ownerPlanetId) ?? {};
    fleetByPlanet.set(f.ownerPlanetId, addUnits(cur, parseUnits(f.units)));
  }
  // Alianças (tag por planeta).
  const mem = await prisma.allianceMember.findMany({ include: { alliance: { select: { tag: true, name: true } } } });
  const allyByPlanet = new Map<string, string>();
  for (const m of mem) allyByPlanet.set(m.planetId, m.alliance?.tag ?? m.alliance?.name ?? "?");

  type Agg = {
    coord: string; players: number; score: number; roids: number; ships: number;
    allies: Map<string, number>; // tag -> qtd de players
    list: { name: string; commander: string; coord: string; score: number; roids: number; ships: number; ally: string }[];
  };
  const byGal = new Map<number, Agg>();
  for (const p of planets) {
    const gid = galaxyId(p.galaxy, p.system);
    const coord = `${p.galaxy}:${p.system}`;
    let agg = byGal.get(gid);
    if (!agg) { agg = { coord, players: 0, score: 0, roids: 0, ships: 0, allies: new Map(), list: [] }; byGal.set(gid, agg); }
    const base = parseUnits(p.units);
    const all = addUnits(base, fleetByPlanet.get(p.id) ?? {});
    const score = planetScore(p, all);
    const roids = p.roidMetalium + p.roidCarbonum + p.roidPlutonium;
    const ships = totalUnits(all);
    const ally = allyByPlanet.get(p.id) ?? "—";
    agg.players++; agg.score += score; agg.roids += roids; agg.ships += ships;
    agg.allies.set(ally, (agg.allies.get(ally) ?? 0) + 1);
    agg.list.push({ name: p.name, commander: p.user.username, coord: `${p.galaxy}:${p.system}:${p.slot}`, score, roids, ships, ally });
  }

  const rows = [...byGal.values()].filter((a) => a.players > 0).sort((a, b) => b.score - a.score);
  console.log(`\n=== UNIVERSO: ${rows.length} galáxias com players ===`);
  console.log("galáxia | players | pontuação | roids | naves | alianças");
  for (const a of rows) {
    const allies = [...a.allies.entries()].map(([t, n]) => `${t}×${n}`).join(", ");
    console.log(`  ${a.coord.padEnd(6)} | ${String(a.players).padStart(2)} | ${fmt(a.score).padStart(12)} | ${fmt(a.roids).padStart(8)} | ${fmt(a.ships).padStart(7)} | ${allies}`);
  }

  // Detalhe das galáxias em foco (argumentos).
  for (const coord of foco) {
    const [g, s] = coord.split(":").map(Number);
    const gid = galaxyId(g, s);
    const a = byGal.get(gid);
    if (!a) { console.log(`\n[${coord}] vazia`); continue; }
    console.log(`\n=== ${coord} — ${a.players} players · pontuação ${fmt(a.score)} · roids ${fmt(a.roids)} · naves ${fmt(a.ships)} ===`);
    for (const p of a.list.sort((x, y) => y.score - x.score)) {
      console.log(`  ${p.coord.padEnd(8)} ${p.commander.padEnd(16)} [${p.ally}] pont ${fmt(p.score).padStart(10)} · roids ${fmt(p.roids).padStart(7)} · naves ${fmt(p.ships).padStart(6)}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
