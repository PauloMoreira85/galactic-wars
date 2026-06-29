import { prisma } from "../db.js";
import { STARTING } from "./constants.js";
import { snapshotHallOfFame } from "./hall.js";

// SOFT RESET (compartilhado): novo round MANTENDO contas e planetas (mesmas
// coordenadas), zerando TODO o progresso (recursos, roids, naves, tecnologias,
// agentes, frotas, alianças, governos, mensagens...). NÃO apaga contas, fórum
// nem Hall da Fama. Registra o top-3 no Hall antes de zerar.
//
// `roundStartAt`: marca o início (08:00) do novo round no GameState. O motor de
// ticks deriva o tick a partir daí. Se omitido, usa "agora" (uso manual via CLI).
export async function softResetRound(roundStartAt?: Date) {
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
      tech: JSON.stringify({ prospeccaoBasica: 1, pesq_centralInteligencia: 1 }),
      prodMul: 100, travelMul: 100, fleetSlots: 0, createdTick: 0, autoExiles: 3,
    },
  });

  // Reinicia o relógio do round (tick #0) e arma o início do novo round.
  const start = roundStartAt ?? new Date();
  await prisma.gameState.upsert({
    where: { id: 1 },
    update: { tickNumber: 0, lastTickAt: start, roundStartAt: start },
    create: { id: 1, tickNumber: 0, lastTickAt: start, roundStartAt: start },
  });

  return reset.count;
}
