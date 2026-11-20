// Lista o tamanho de cada aliança (pra ver quais passam do novo limite de 18).
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const LIMIT = 18;
const alliances = await prisma.alliance.findMany({ select: { id: true, name: true, tag: true } });
const rows = [];
for (const a of alliances) {
  const count = await prisma.allianceMember.count({ where: { allianceId: a.id } });
  rows.push({ tag: a.tag, name: a.name, count });
}
rows.sort((x, y) => y.count - x.count);
console.log(`Alianças (limite novo = ${LIMIT}):`);
for (const r of rows) console.log(`  [${r.tag}] ${r.name}: ${r.count} membro(s)${r.count > LIMIT ? "  ⚠️ ACIMA DO LIMITE" : ""}`);
const over = rows.filter((r) => r.count > LIMIT);
console.log(over.length ? `\n⚠️ ${over.length} aliança(s) acima de ${LIMIT} — não serão expulsas, mas não poderão convidar até baixar.` : `\n✅ Nenhuma aliança acima de ${LIMIT}.`);
await prisma.$disconnect();
