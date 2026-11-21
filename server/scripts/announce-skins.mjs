// Insere uma NOTÍCIA pra TODOS os planetas anunciando a escolha de aparência
// (skin) do planeta — recurso de Associado. Roda uma vez (idempotente: não
// duplica se já tiver sido enviada).
// Uso:  node announce-skins.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const MSG = "🪐 NOVIDADE: agora você pode escolher a APARÊNCIA do seu planeta no mapa! São 11 skins (Terra, Oceânico, Deserto, Gelo, Vulcânico, Gasoso, Anelado, Tóxico, Metrópole, Cristal, Lunar). É só visual e NÃO revela sua raça. Escolha a sua na aba ⭐ Associados → Aparência do planeta. (Benefício de Associado — grátis no início do round.)";

const state = await prisma.gameState.findUnique({ where: { id: 1 } });
const tick = state?.tickNumber ?? 0;

const planets = await prisma.planet.findMany({ select: { id: true } });
let inserted = 0, skipped = 0;
for (const p of planets) {
  const already = await prisma.news.findFirst({ where: { planetId: p.id, message: MSG } });
  if (already) { skipped++; continue; }
  await prisma.news.create({ data: { planetId: p.id, tick, message: MSG } });
  inserted++;
}
console.log(`✅ Anúncio enviado: ${inserted} planetas (${skipped} já tinham).`);
await prisma.$disconnect();
