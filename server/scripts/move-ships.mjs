// Move naves da BASE de um planeta pra BASE de outro (correção manual).
// Uso:  node move-ships.mjs <origem g:s:slot> <destino g:s:slot> <NomeDaNave> <qtd>
// Ex.:  node move-ships.mjs 6:3:2 7:1:4 Nut 29
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const [fromC, toC, shipName, qtyRaw] = process.argv.slice(2);
if (!fromC || !toC || !shipName || !qtyRaw) {
  console.log("Uso: node move-ships.mjs <origem g:s:slot> <destino g:s:slot> <NomeDaNave> <qtd>");
  process.exit(1);
}
const qty = Math.floor(Number(qtyRaw));
const parseCoord = (c) => { const [g, s, sl] = c.split(":").map(Number); return { galaxy: g, system: s, slot: sl }; };
const parse = (s) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };

const from = await prisma.planet.findUnique({ where: { galaxy_system_slot: parseCoord(fromC) }, include: { user: { select: { username: true } }, fleets: true } });
const to = await prisma.planet.findUnique({ where: { galaxy_system_slot: parseCoord(toC) }, include: { user: { select: { username: true } } } });
if (!from) { console.log(`Origem ${fromC} vazia.`); process.exit(1); }
if (!to) { console.log(`Destino ${toC} vazio.`); process.exit(1); }

// Quantas o BGN tem no total (base + frotas) dessa nave.
const fromBase = parse(from.units);
const totalHave = (fromBase[shipName] || 0) + from.fleets.reduce((a, f) => a + (parse(f.units)[shipName] || 0), 0);
if (totalHave < qty) { console.log(`❌ ${from.name} (${fromC}) só tem ${totalHave}× ${shipName} no total — não dá pra mover ${qty}.`); process.exit(1); }

// Retira primeiro da base, depois das frotas, até completar `qty`.
let need = qty;
const writes = [];
const takeBase = Math.min(need, fromBase[shipName] || 0);
if (takeBase > 0) { fromBase[shipName] -= takeBase; if (fromBase[shipName] <= 0) delete fromBase[shipName]; need -= takeBase; writes.push(prisma.planet.update({ where: { id: from.id }, data: { units: JSON.stringify(fromBase) } })); }
for (const f of from.fleets) {
  if (need <= 0) break;
  const fu = parse(f.units); const has = fu[shipName] || 0; if (has <= 0) continue;
  const take = Math.min(need, has); fu[shipName] -= take; if (fu[shipName] <= 0) delete fu[shipName]; need -= take;
  writes.push(prisma.fleet.update({ where: { id: f.id }, data: { units: JSON.stringify(fu) } }));
}

const toUnits = parse(to.units);
const before = toUnits[shipName] || 0;
toUnits[shipName] = before + qty;
writes.push(prisma.planet.update({ where: { id: to.id }, data: { units: JSON.stringify(toUnits) } }));

console.log(`Movendo ${qty}× ${shipName}:`);
console.log(`  DE  ${from.name} (${fromC}, ${from.user.username}): tinha ${totalHave} no total → ${totalHave - qty}`);
console.log(`  PRA ${to.name} (${toC}, ${to.user.username}) [base]: ${before} → ${toUnits[shipName]}`);

await prisma.$transaction(writes);
console.log("✅ Transferência aplicada.");
await prisma.$disconnect();
