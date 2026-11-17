import { prisma } from "./db.js";
import { TECH_BY_KEY } from "./game/tech.js";

// Extrato de PRODUÇÃO/RECURSOS de um planeta, por coordenada "setor:paralelo:slot".
// Uso (no container): node server/dist/prova-producao.js 6:1:1
//
// AVISO: o jogo NÃO guarda histórico de ordens já concluídas (a BuildOrder é
// apagada quando a nave fica pronta) nem log de recursos por tick. Então este
// extrato mostra o ESTADO ATUAL: recursos, produção por tick, ordens AINDA na
// fila e as fábricas/tecnologias liberadas (prova de que o planeta PODE produzir
// aquelas naves legitimamente).
async function main() {
  const arg = process.argv[2] ?? "6:1:1";
  const [galaxy, system, slot] = arg.split(":").map(Number);
  const planet = await prisma.planet.findUnique({
    where: { galaxy_system_slot: { galaxy, system, slot } },
    include: { user: { select: { username: true } } },
  });
  if (!planet) { console.error(`Planeta ${arg} não encontrado.`); process.exit(1); }

  const gs = await prisma.gameState.findUnique({ where: { id: 1 } });
  const tick = gs?.tickNumber ?? 0;

  console.log("========================================================");
  console.log(`EXTRATO DE PRODUÇÃO — ${planet.name} (${arg})  [tick atual: ${tick}]`);
  console.log(`Comandante: ${planet.user.username}`);
  console.log("========================================================\n");

  console.log("RECURSOS ATUAIS:");
  console.log(`  Metalium : ${planet.metalium.toLocaleString("pt-BR")}`);
  console.log(`  Carbonum : ${planet.carbonum.toLocaleString("pt-BR")}`);
  console.log(`  Plutonium: ${planet.plutonium.toLocaleString("pt-BR")}`);
  console.log(`\nROIDS (geram recursos por tick): ${planet.roidMetalium} M · ${planet.roidCarbonum} C · ${planet.roidPlutonium} P`);
  console.log(`Multiplicador de produção: ${planet.prodMul}%`);
  console.log(`Planeta criado no tick: ${planet.createdTick}  (está jogando há ${tick - planet.createdTick} ticks)\n`);

  // Frota/base atual (quantas naves de cada tipo o planeta tem AGORA).
  let units: Record<string, number> = {};
  try { units = JSON.parse(planet.units || "{}"); } catch { /* vazio */ }
  const naves = Object.entries(units).filter(([, n]) => (n as number) > 0);
  console.log("NAVES ATUAIS NA BASE:");
  if (naves.length === 0) console.log("  (nenhuma na base — podem estar em frotas)");
  else for (const [nome, qtd] of naves) console.log(`  ${nome}: ${qtd}`);
  console.log("");

  // Ordens de produção AINDA na fila (as concluídas foram apagadas).
  const orders = await prisma.buildOrder.findMany({
    where: { planetId: planet.id },
    orderBy: { startTick: "asc" },
  });
  console.log("ORDENS DE PRODUÇÃO/PESQUISA AINDA NA FILA:");
  if (orders.length === 0) console.log("  (nenhuma ordem ativa — tudo que foi produzido já concluiu e saiu da fila)");
  for (const o of orders) {
    const what = o.kind === "ship" ? `${o.quantity}× nave classe ${o.shipClass}` : `pesquisa/construção ${o.techKey}`;
    console.log(`  • ${what} — iniciada no tick ${o.startTick}, conclui no tick ${o.completeTick}`);
  }
  console.log("");

  // Tecnologias/fábricas liberadas (prova de capacidade de produzir cada classe).
  let tech: Record<string, number> = {};
  try { tech = JSON.parse(planet.tech || "{}"); } catch { /* vazio */ }
  const liberadas = Object.keys(tech).filter((k) => (tech[k] ?? 0) >= 1);
  console.log("TECNOLOGIAS / FÁBRICAS LIBERADAS (prova de que PODE produzir essas naves):");
  if (liberadas.length === 0) console.log("  (nenhuma)");
  for (const k of liberadas) {
    const def = TECH_BY_KEY[k];
    console.log(`  ✓ ${def ? def.name : k}`);
  }
  console.log("\n========================================================");
  console.log("OBS: o jogo não guarda histórico de ordens já concluídas nem");
  console.log("recursos por tick, então não há como reconstruir o passado.");
  console.log("Este extrato prova o ESTADO ATUAL e a CAPACIDADE de produção.");
  console.log("========================================================");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
