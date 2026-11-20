// Conta jogadores REAIS: contas que compartilham IP são agrupadas como 1 pessoa.
// Uso:  node real-players.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const now = Date.now();
const DAY = 86400000;

// Só contas com planeta (jogador de fato).
const planets = await prisma.planet.findMany({
  include: { user: { select: { id: true, username: true, lastSeen: true } } },
});
const userIds = new Set(planets.map((p) => p.userId));
const nameOf = new Map(planets.map((p) => [p.userId, p.user.username]));
const lastSeenOf = new Map(planets.map((p) => [p.userId, p.user.lastSeen]));

// IPs de cada conta (só dos que têm planeta).
const ips = await prisma.accountIp.findMany({ where: { userId: { in: [...userIds] } }, select: { userId: true, ip: true } });

// Union-Find: une contas que dividem algum IP.
const parent = new Map([...userIds].map((u) => [u, u]));
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

const byIp = new Map();
for (const r of ips) { if (!byIp.has(r.ip)) byIp.set(r.ip, []); byIp.get(r.ip).push(r.userId); }
for (const [, members] of byIp) for (let i = 1; i < members.length; i++) union(members[0], members[i]);

// Monta os grupos (1 grupo = 1 pessoa real).
const groups = new Map();
for (const u of userIds) { const root = find(u); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(u); }

const totalContas = userIds.size;
const totalReais = groups.size;

// Atividade: conta "ativo" se QUALQUER conta do grupo foi vista na janela.
const groupLastSeen = (members) => Math.max(...members.map((u) => new Date(lastSeenOf.get(u) ?? 0).getTime()));
let ativos1d = 0, ativos7d = 0;
for (const [, members] of groups) {
  const ls = groupLastSeen(members);
  if (now - ls <= DAY) ativos1d++;
  if (now - ls <= 7 * DAY) ativos7d++;
}

console.log(`===== JOGADORES =====`);
console.log(`Contas com planeta:        ${totalContas}`);
console.log(`Jogadores reais (por IP):  ${totalReais}`);
console.log(`Multi-contas detectadas:   ${totalContas - totalReais} conta(s) extra`);
console.log(`Ativos nas últimas 24h:    ${ativos1d} pessoa(s)`);
console.log(`Ativos nos últimos 7 dias: ${ativos7d} pessoa(s)`);

// Lista os grupos com mais de 1 conta (prováveis multi-contas do mesmo jogador).
const multi = [...groups.values()].filter((m) => m.length > 1).sort((a, b) => b.length - a.length);
if (multi.length) {
  console.log(`\n===== GRUPOS COM MULTI-CONTA (mesmo IP) =====`);
  for (const m of multi) console.log(`  (${m.length}) ${m.map((u) => nameOf.get(u)).join(", ")}`);
} else {
  console.log(`\nNenhuma multi-conta por IP detectada.`);
}

await prisma.$disconnect();
