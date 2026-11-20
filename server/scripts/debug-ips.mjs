// Mostra os IPs de contas específicas e quantas contas cada IP tem.
// Uso:  node debug-ips.mjs Jah DiagZZTest BGNWEB
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const names = process.argv.slice(2);
if (names.length === 0) { console.log("Uso: node debug-ips.mjs <nome1> <nome2> ..."); process.exit(1); }

const users = await prisma.user.findMany({ where: { username: { in: names } }, select: { id: true, username: true } });
const idToName = new Map(users.map((u) => [u.id, u.username]));

for (const u of users) {
  const ips = await prisma.accountIp.findMany({ where: { userId: u.id }, orderBy: { lastSeen: "desc" } });
  console.log(`\n== ${u.username} ==`);
  for (const r of ips) {
    const shared = await prisma.accountIp.count({ where: { ip: r.ip } });
    console.log(`  ${r.ip}  (hits ${r.hits}, ${shared} conta[s] usam esse IP)  último: ${new Date(r.lastSeen).toISOString().slice(0,16)}`);
  }
}

// Mostra os IPs mais "populosos" (prováveis proxies/CGNAT compartilhados).
console.log(`\n===== IPs COMPARTILHADOS POR MAIS CONTAS =====`);
const all = await prisma.accountIp.findMany({ select: { ip: true } });
const count = new Map();
for (const r of all) count.set(r.ip, (count.get(r.ip) || 0) + 1);
const top = [...count.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [ip, n] of top) console.log(`  ${ip}: ${n} contas`);

await prisma.$disconnect();
