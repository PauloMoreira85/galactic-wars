import { prisma } from "./db.js";
import { softResetRound } from "./game/round.js";

// SOFT RESET manual: novo round MANTENDO as contas e os planetas (mesmas
// coordenadas), zerando TODO o progresso. NÃO apaga contas, fórum nem Hall.
// O ciclo diário automático (motor de ticks) usa a mesma rotina softResetRound.
// Uso (no container): node server/dist/reset-soft.js --yes
async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("⚠️  reset-soft ZERA o progresso de todos os planetas (mantém as contas). Rode com --yes pra confirmar.");
    process.exit(1);
  }
  const count = await softResetRound();
  console.log(`✅ [reset-soft] ${count} planeta(s) zerado(s). Novo round no tick #0 — contas mantidas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
