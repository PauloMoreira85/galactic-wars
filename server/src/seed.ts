import { prisma } from "./db.js";

// Inicializa o estado do universo. Roda apos as migrations.
async function main() {
  const state = await prisma.gameState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, tickNumber: 0 },
  });
  console.log(`[seed] GameState pronto (tick #${state.tickNumber}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
