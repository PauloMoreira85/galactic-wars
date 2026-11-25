import { prisma } from "./db.js";
import { galaxyId, galaxyDecompose, galaxyWhere, NUM_SETORES, NUM_PARALELOS } from "./game/geo.js";

// ===== Migração ÚNICA: resgata galáxias privadas da regra ANTIGA =====
// Antes, galáxias privadas ficavam nos setores 6-10 (ids 31-60), FORA do universo
// real de 30 galáxias. A regra nova sorteia a privada entre as galáxias VAZIAS do
// universo (setor 1-5). Este script move cada privada antiga (id > 30) para uma
// galáxia vazia de 1..30, levando TODOS os planetas e remapeando governo/convites.
//
// Uso (no container):  node server/dist/migrate-private-galaxies.js
// É idempotente: privadas que já estão em 1..30 são ignoradas.

const UNIVERSO_MAX_ID = NUM_SETORES * NUM_PARALELOS; // 30

async function galaxiasVazias(): Promise<number[]> {
  const livres: number[] = [];
  for (let setor = 1; setor <= NUM_SETORES; setor++) {
    for (let par = 1; par <= NUM_PARALELOS; par++) {
      const id = galaxyId(setor, par);
      const st = await prisma.galaxyState.findUnique({ where: { galaxy: id } });
      if (st) continue;
      const occupied = await prisma.planet.count({ where: { galaxy: setor, system: par } });
      if (occupied === 0) livres.push(id);
    }
  }
  return livres;
}

async function main() {
  const privadas = await prisma.galaxyState.findMany({ where: { isPrivate: true } });
  const antigas = privadas.filter((p) => p.galaxy > UNIVERSO_MAX_ID);
  if (antigas.length === 0) {
    console.log("✅ Nenhuma galáxia privada na regra antiga (setor 6-10). Nada a migrar.");
    return;
  }
  console.log(`Encontradas ${antigas.length} galáxia(s) privada(s) a migrar.`);

  for (const old of antigas) {
    const oldId = old.galaxy;
    const livres = await galaxiasVazias();
    if (livres.length === 0) {
      console.error(`❌ Sem galáxia vazia no universo para migrar a privada "${old.name}" (id ${oldId}). Abortando esta.`);
      continue;
    }
    const newId = livres[Math.floor(Math.random() * livres.length)];
    const { setor: newSetor, paralelo: newPar } = galaxyDecompose(newId);
    const oldWhere = galaxyWhere(oldId);

    // 1) Move cada planeta da privada antiga pro novo setor/paralelo, mantendo o slot.
    const planetas = await prisma.planet.findMany({ where: oldWhere, select: { id: true, slot: true, name: true } });
    for (const pl of planetas) {
      await prisma.planet.update({ where: { id: pl.id }, data: { galaxy: newSetor, system: newPar } });
    }

    // 2) Recria o GalaxyState no novo id (copiando tudo) e apaga o antigo.
    await prisma.galaxyState.create({ data: {
      galaxy: newId, name: old.name, flag: old.flag, isPrivate: true, ownerPlanetId: old.ownerPlanetId,
      cgPlanetId: old.cgPlanetId, mePlanetId: old.mePlanetId, mgPlanetId: old.mgPlanetId, mdPlanetId: old.mdPlanetId,
      taxRate: old.taxRate, marketFee: old.marketFee, marketLocked: old.marketLocked,
      fundMetalium: old.fundMetalium, fundCarbonum: old.fundCarbonum, fundPlutonium: old.fundPlutonium,
    } });
    await prisma.galaxyState.delete({ where: { galaxy: oldId } });

    // 3) Remapeia o id antigo → novo nas tabelas que guardam galaxy id.
    await prisma.galaxyInvite.updateMany({ where: { galaxy: oldId }, data: { galaxy: newId } });
    await prisma.galaxyVote.updateMany({ where: { galaxy: oldId }, data: { galaxy: newId } });
    // Tratados: galaxyA sempre menor, galaxyB maior — refaz o par ordenado.
    const treaties = await prisma.galaxyTreaty.findMany({ where: { OR: [{ galaxyA: oldId }, { galaxyB: oldId }] } });
    for (const t of treaties) {
      const other = t.galaxyA === oldId ? t.galaxyB : t.galaxyA;
      const a = Math.min(newId, other), b = Math.max(newId, other);
      const proposedBy = t.proposedBy === oldId ? newId : t.proposedBy;
      // Pode colidir com um tratado já existente (newId,other): nesse caso, descarta o antigo.
      const exists = await prisma.galaxyTreaty.findUnique({ where: { galaxyA_galaxyB: { galaxyA: a, galaxyB: b } } }).catch(() => null);
      if (exists) { await prisma.galaxyTreaty.delete({ where: { id: t.id } }); }
      else { await prisma.galaxyTreaty.update({ where: { id: t.id }, data: { galaxyA: a, galaxyB: b, proposedBy } }); }
    }

    // DonationLog (histórico) guarda galaxy id — remapeia pra exibição ficar certa.
    await prisma.donationLog.updateMany({ where: { galaxy: oldId }, data: { galaxy: newId } });
    // AttackTarget guarda COORDENADA (setor:paralelo:slot): remapeia os que apontavam
    // pra dentro da privada antiga (raro, mas evita alvo órfão).
    await prisma.attackTarget.updateMany({ where: { galaxy: oldWhere.galaxy, system: oldWhere.system }, data: { galaxy: newSetor, system: newPar } });

    console.log(`  ✅ "${old.name}" (id ${oldId} → ${newId}, setor ${newSetor}:${newPar}) — ${planetas.length} planeta(s) movido(s).`);
  }
  console.log("Migração concluída.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
