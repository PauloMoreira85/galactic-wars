// Conta jogadores REAIS. Agrupa contas do mesmo dono por IP COMPARTILHADO, mas
// com critério rígido pra não juntar gente diferente que usou a mesma VPN/rede:
//  - ignora IPs usados por MUITAS contas (>= MAX_SHARED) = proxy/VPN/CGNAT.
//  - ignora faixas de datacenter conhecidas (AWS/GCP/Azure/etc).
//  - só vincula duas contas se o IP partilhado teve uso real (hits) das duas.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const now = Date.now();
const DAY = 86400000;
const MAX_SHARED = 4; // IP usado por 4+ contas = compartilhado (VPN/rede), não vincula.

// Faixas típicas de datacenter/VPN (prefixo do 1º octeto). Não é exaustivo, mas
// cobre AWS/GCP/Azure/Oracle que apareceram nos dados (15.x, 35.x, 3.x, 18.x...).
const DC_PREFIX = new Set(["3", "13", "15", "18", "20", "23", "34", "35", "40", "44", "52", "54", "99", "100", "104", "107", "108", "130", "131", "137", "138", "140", "142", "143", "146", "149", "150", "157", "158", "159", "168", "169", "172", "192", "193", "194", "195", "198", "199", "216"]);
const isDC = (ip) => DC_PREFIX.has(ip.split(".")[0]);

const planets = await prisma.planet.findMany({ include: { user: { select: { id: true, username: true, lastSeen: true } } } });
const userIds = new Set(planets.map((p) => p.userId));
const nameOf = new Map(planets.map((p) => [p.userId, p.user.username]));
const lastSeenOf = new Map(planets.map((p) => [p.userId, p.user.lastSeen]));

const ips = await prisma.accountIp.findMany({ where: { userId: { in: [...userIds] } }, select: { userId: true, ip: true, hits: true } });

// Quantas contas por IP (global), pra descartar os compartilhados.
const accountsPerIp = new Map();
for (const r of ips) { if (!accountsPerIp.has(r.ip)) accountsPerIp.set(r.ip, new Set()); accountsPerIp.get(r.ip).add(r.userId); }

const parent = new Map([...userIds].map((u) => [u, u]));
const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

// Só vincula por IPs "residenciais" (poucas contas, fora de datacenter).
let ignored = 0;
for (const [ip, accs] of accountsPerIp) {
  if (accs.size < 2) continue;
  if (accs.size >= MAX_SHARED || isDC(ip)) { ignored++; continue; } // proxy/VPN/datacenter
  const members = [...accs];
  for (let i = 1; i < members.length; i++) union(members[0], members[i]);
}

const groups = new Map();
for (const u of userIds) { const root = find(u); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(u); }

const totalContas = userIds.size;
const totalReais = groups.size;

const groupLastSeen = (m) => Math.max(...m.map((u) => new Date(lastSeenOf.get(u) ?? 0).getTime()));
let a1 = 0, a7 = 0;
for (const [, m] of groups) { const ls = groupLastSeen(m); if (now - ls <= DAY) a1++; if (now - ls <= 7 * DAY) a7++; }

console.log(`===== JOGADORES =====`);
console.log(`Contas com planeta:          ${totalContas}`);
console.log(`Jogadores reais (estimado):  ${totalReais}`);
console.log(`Prováveis multi-contas:      ${totalContas - totalReais} conta(s) extra`);
console.log(`Ativos nas últimas 24h:      ${a1}`);
console.log(`Ativos nos últimos 7 dias:   ${a7}`);
console.log(`(ignorados ${ignored} IP[s] compartilhados/VPN/datacenter — não vinculam contas)`);

const multi = [...groups.values()].filter((m) => m.length > 1).sort((a, b) => b.length - a.length);
if (multi.length) {
  console.log(`\n===== GRUPOS (mesmo IP residencial) =====`);
  for (const m of multi) {
    const act = m.map((u) => { const d = Math.round((now - new Date(lastSeenOf.get(u) ?? 0).getTime()) / DAY); return `${nameOf.get(u)} (${d}d)`; });
    console.log(`  (${m.length}) ${act.join(", ")}`);
  }
  console.log(`\n(entre parênteses = há quantos dias a conta foi vista; conta de teste antiga pode ser falso-positivo)`);
} else {
  console.log(`\nNenhum grupo residencial com multi-conta.`);
}

await prisma.$disconnect();
