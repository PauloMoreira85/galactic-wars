// Mostra o WhatsApp/contato de cadastro de jogadores (dado privado — uso do dono).
// Uso:  node get-contact.mjs nabuco aveyron payne "lady lane"
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const args = process.argv.slice(2);
if (args.length === 0) { console.log('Uso: node get-contact.mjs <nome> [nome...]'); process.exit(1); }

// Pega todos os usuários uma vez e casa por nome (case-insensitive, ignora acento).
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const all = await prisma.user.findMany({ select: { username: true, whatsapp: true, email: true, lastSeen: true } });

for (const q of args) {
  const nq = norm(q);
  const hits = all.filter((u) => norm(u.username) === nq || norm(u.username).includes(nq));
  if (hits.length === 0) { console.log(`\n"${q}" — nenhum jogador encontrado.`); continue; }
  for (const u of hits) {
    console.log(`\n== ${u.username} ==`);
    console.log(`  WhatsApp/contato: ${u.whatsapp ? u.whatsapp : "(não informado no cadastro)"}`);
    console.log(`  último acesso:    ${new Date(u.lastSeen).toISOString().slice(0, 16)}`);
  }
}

await prisma.$disconnect();
