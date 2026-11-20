// Confere as naves de um planeta e aponta as que NÃO são da raça esperada.
// Uso (no droplet):  node server/scripts/check-ships.mjs 6:3:2
// Ou dentro do container app:  docker compose exec app node scripts/check-ships.mjs 6:3:2
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// Dono de cada nave por raça (nome -> raça). Mantido simples e explícito.
const OWNER = {
  Humana: ["Artemis","Perseu","Ares","Deméter","Vulcano","Hera","Tanatos","Netuno","Hermes","Apolo","Hercules","Zeus"],
  Daharan: ["Osíris","Isis","Hórus","Geb","Seth","Bastet","Nut","Sekmet","Anúbis","Thoth","Néftis","Amon-Rá"],
  Rakshasa: ["Thor","Njord","Heimdall","Attila","Hela","Fenrir","Loki","Freya","Vidar","Baldur","Tyr","Odin"],
  "c-Mech": ["Caillech","Cerridwen","Gwynn","Badb","Smertrios","Lugh","Morrigan","Fea","Macha","Scathach","Danu","Cernunnos"],
  Insecta: ["Formiga","Abelha","Vespa","Mosca","Besouro","Mosquito","Aranha","Louva-a-Deus","Escorpião","Cupim","Gafanhoto","Rainha"],
};
const raceOf = {};
for (const [race, names] of Object.entries(OWNER)) for (const n of names) raceOf[n] = race;

const coord = (process.argv[2] || "6:3:2").split(":").map(Number);
const [galaxy, system, slot] = coord;

const planet = await prisma.planet.findUnique({
  where: { galaxy_system_slot: { galaxy, system, slot } },
  include: { user: { select: { username: true, race: true } }, fleets: { select: { name: true, units: true } } },
});
if (!planet) { console.log(`Nenhum planeta em ${galaxy}:${system}:${slot}`); process.exit(0); }

const parse = (s) => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
const all = {};
const add = (u) => { for (const [n, q] of Object.entries(u)) all[n] = (all[n] || 0) + (Number(q) || 0); };
add(parse(planet.units));
for (const f of planet.fleets) add(parse(f.units));

console.log(`Planeta: ${planet.name} (${galaxy}:${system}:${slot}) — comandante ${planet.user.username}, raça ${planet.user.race}`);
console.log(`Naves (base + frotas):`);
const foreign = [];
for (const [name, qty] of Object.entries(all)) {
  if (qty <= 0) continue;
  const r = raceOf[name] ?? "??(desconhecida)";
  const mark = r === "Humana" ? "" : "   ⟵ NÃO é humana";
  console.log(`  ${qty}× ${name}  [${r}]${mark}`);
  if (r !== "Humana") foreign.push(`${qty}× ${name} (${r})`);
}
console.log(foreign.length
  ? `\n⚠️ Naves de outras raças (assimiladas): ${foreign.join(", ")}`
  : `\n✅ Só naves humanas — nada assimilado.`);

await prisma.$disconnect();
