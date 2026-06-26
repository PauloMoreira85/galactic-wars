import { prisma } from "./db.js";
import { STARTING } from "./game/constants.js";
import { snapshotHallOfFame } from "./game/hall.js";

// SOFT RESET: novo round MANTENDO as contas e os planetas (mesmas coordenadas),
// mas zerando TODO o progresso (recursos, roids, naves, tecnologias, agentes,
// frotas, alianças, governos, mensagens...). O relógio volta pro tick #0.
// NÃO apaga contas (jogadores não re-registram), fórum nem Hall da Fama.
// Uso (no container): node server/dist/reset-soft.js --yes
async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("⚠️  reset-soft ZERA o progresso de todos os planetas (mantém as contas). Rode com --yes pra confirmar.");
    process.exit(1);
  }

  // Antes de zerar: registra o top-3 do round no Hall da Fama.
  await snapshotHallOfFame();

  // Apaga tabelas de round (mas NÃO users/planets/forum/HallOfFame/AccountIp).
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
  await prisma.allianceInvite.deleteMany();
  await prisma.allianceMember.deleteMany();
  await prisma.alliance.deleteMany();
  await prisma.fleet.deleteMany();
  await prisma.buildOrder.deleteMany();

  // Zera cada planeta para o estado inicial (mantém id, dono, nome e coordenadas).
  const reset = await prisma.planet.updateMany({
    data: {
      metalium: STARTING.metalium, carbonum: STARTING.carbonum, plutonium: STARTING.plutonium,
      roidMetalium: STARTING.roidMetalium, roidCarbonum: STARTING.roidCarbonum, roidPlutonium: STARTING.roidPlutonium,
      shipCaca: 0, shipCorveta: 0, shipFragata: 0, shipDestroyer: 0, shipCruzador: 0, shipNavemae: 0,
      roider1: 0, roider2: 0,
      units: "{}", agents: "{}", researchTier: 0,
      tech: JSON.stringify({ pesqMineracao: 1, pesq_centralInteligencia: 1 }),
      prodMul: 100, travelMul: 100, fleetSlots: 0, createdTick: 0, autoExiles: 3,
    },
  });

  // Reinicia o relógio do round.
  await prisma.gameState.upsert({
    where: { id: 1 },
    update: { tickNumber: 0, lastTickAt: new Date() },
    create: { id: 1, tickNumber: 0 },
  });

  console.log(`✅ [reset-soft] ${reset.count} planeta(s) zerado(s). Novo round no tick #0 — contas mantidas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
