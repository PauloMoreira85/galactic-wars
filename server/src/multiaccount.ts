import { prisma } from "./db.js";

// Admin do anti multi-conta. Uso (no container):
//   node server/dist/multiaccount.js list                 # mostra contas que compartilham IP
//   node server/dist/multiaccount.js allow <a> <b>        # LIBERA o par (podem interagir)
//   node server/dist/multiaccount.js block <a> <b>        # re-bloqueia (remove a liberação)
//   node server/dist/multiaccount.js allowed              # lista pares liberados
// <a>/<b> podem ser o username OU o id da conta.

async function resolveUser(arg: string) {
  const u = await prisma.user.findFirst({
    where: { OR: [{ id: arg }, { username: arg }] },
    select: { id: true, username: true },
  });
  if (!u) throw new Error(`Conta não encontrada: ${arg}`);
  return u;
}

function pairKey(a: string, b: string) {
  return a < b ? { aId: a, bId: b } : { aId: b, bId: a };
}

async function list() {
  const rows = await prisma.accountIp.findMany({ select: { userId: true, ip: true, lastSeen: true } });
  // Agrupa por IP.
  const byIp = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byIp.has(r.ip)) byIp.set(r.ip, new Set());
    byIp.get(r.ip)!.add(r.userId);
  }
  const shared = [...byIp.entries()].filter(([, set]) => set.size > 1);
  if (!shared.length) { console.log("✅ Nenhum IP compartilhado entre contas."); return; }

  const userIds = [...new Set(shared.flatMap(([, set]) => [...set]))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } });
  const name = new Map(users.map((u) => [u.id, u.username]));
  const allowed = await prisma.allowedPair.findMany();
  const isAllowed = (a: string, b: string) => {
    const k = pairKey(a, b);
    return allowed.some((p) => p.aId === k.aId && p.bId === k.bId);
  };

  console.log(`⚠️  ${shared.length} IP(s) compartilhado(s) entre contas:\n`);
  for (const [ip, set] of shared) {
    const ids = [...set];
    console.log(`IP ${ip}:`);
    for (const id of ids) console.log(`   - ${name.get(id) ?? "?"}  (${id})`);
    // Mostra o status de cada par.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const ok = isAllowed(ids[i], ids[j]);
        console.log(`     ${name.get(ids[i])} ↔ ${name.get(ids[j])}: ${ok ? "LIBERADO ✅" : "BLOQUEADO 🚫"}`);
      }
    }
    console.log("");
  }
}

async function allow(aArg: string, bArg: string, allowIt: boolean) {
  const a = await resolveUser(aArg);
  const b = await resolveUser(bArg);
  if (a.id === b.id) throw new Error("São a mesma conta.");
  const key = pairKey(a.id, b.id);
  if (allowIt) {
    await prisma.allowedPair.upsert({
      where: { aId_bId: key },
      update: {},
      create: { ...key, note: `${a.username} <-> ${b.username}` },
    });
    console.log(`✅ LIBERADO: ${a.username} ↔ ${b.username} agora podem interagir.`);
  } else {
    await prisma.allowedPair.deleteMany({ where: key });
    console.log(`🚫 RE-BLOQUEADO: ${a.username} ↔ ${b.username} voltam a ser bloqueados (se compartilham IP).`);
  }
}

async function listAllowed() {
  const rows = await prisma.allowedPair.findMany({ orderBy: { createdAt: "desc" } });
  if (!rows.length) { console.log("Nenhum par liberado."); return; }
  console.log(`${rows.length} par(es) liberado(s):`);
  for (const r of rows) console.log(`   - ${r.note ?? `${r.aId} <-> ${r.bId}`}  (${r.createdAt.toISOString()})`);
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  switch (cmd) {
    case "list": await list(); break;
    case "allowed": await listAllowed(); break;
    case "allow":
      if (!a || !b) throw new Error("Uso: multiaccount allow <a> <b>");
      await allow(a, b, true); break;
    case "block":
      if (!a || !b) throw new Error("Uso: multiaccount block <a> <b>");
      await allow(a, b, false); break;
    default:
      console.log("Comandos: list | allowed | allow <a> <b> | block <a> <b>");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌", e.message ?? e);
    await prisma.$disconnect();
    process.exit(1);
  });
