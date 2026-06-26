import { prisma } from "./db.js";
import { snapshotHallOfFame } from "./game/hall.js";

// Zera o universo para um NOVO ROUND e reinicia o relógio (tick #0).
// Apaga tudo do jogo: planetas, frotas, alianças, governos, mensagens, etc.
// NÃO toca no fórum (phpBB é outro banco). As contas também são apagadas —
// os jogadores re-registram no novo round.
// Uso (no container): node server/dist/reset-round.js --yes
async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("⚠️  reset-round APAGA TODOS os dados do jogo. Rode com --yes pra confirmar.");
    process.exit(1);
  }

  // Antes de apagar: registra o top-3 do round no Hall da Fama.
  await snapshotHallOfFame();

  // Tabelas com refs "soltas" (por planetId/galaxy) — apaga antes.
  await prisma.news.deleteMany();
  await prisma.spyReport.deleteMany();
  await prisma.planetEffect.deleteMany();
  await prisma.sabotageCooldown.deleteMany();
  await prisma.donationCooldown.deleteMany();
  await prisma.galaxyVote.deleteMany();
  await prisma.galaxyInvite.deleteMany();
  await prisma.galaxyTreaty.deleteMany();
  await prisma.galaxyState.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.privateMessage.deleteMany();
  await prisma.battleReport.deleteMany();
  // Alianças e fórum interno (têm cascade próprio).
  await prisma.allianceInvite.deleteMany();
  await prisma.allianceMember.deleteMany();
  await prisma.alliance.deleteMany();
  await prisma.forumPost.deleteMany();
  await prisma.forumTopic.deleteMany();
  // Mundo: frotas/ordens caem por cascade do planeta, mas apagamos explícito.
  await prisma.fleet.deleteMany();
  await prisma.buildOrder.deleteMany();
  await prisma.planet.deleteMany();
  await prisma.user.deleteMany();
  // Anti multi-conta: contas foram apagadas → limpa IPs e liberações.
  await prisma.accountIp.deleteMany();
  await prisma.allowedPair.deleteMany();

  // Reinicia o relógio do round.
  await prisma.gameState.upsert({
    where: { id: 1 },
    update: { tickNumber: 0, lastTickAt: new Date() },
    create: { id: 1, tickNumber: 0 },
  });

  console.log("✅ [reset-round] universo zerado. Novo round no tick #0 — re-registrem os planetas.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
