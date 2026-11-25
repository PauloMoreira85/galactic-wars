import { prisma } from "./db.js";
import { relocate } from "./game/relocation.js";
import { galaxyId, galaxyWhere, NUM_SETORES, NUM_PARALELOS } from "./game/geo.js";
import { SLOTS_PER_SYSTEM } from "./game/constants.js";

// ===== Junta jogadores SOZINHOS numa mesma galáxia =====
// Pega todo planeta que é o ÚNICO na galáxia dele (público, 1..30, fora de privadas)
// e realoca pra uma galáxia com gente/vaga — enchendo de baixo pra cima, igual à
// alocação nova. Realoca mesmo quem tem cargo (perde o cargo na galáxia antiga; a
// aliança, que é separada da galáxia, NÃO quebra).
//
// Uso:  node server/dist/regroup-loners.js          (aplica)
//       node server/dist/regroup-loners.js --dry     (só mostra o que faria)

const DRY = process.argv.includes("--dry");

async function snapshot() {
  const privateIds = new Set(
    (await prisma.galaxyState.findMany({ where: { isPrivate: true }, select: { galaxy: true } })).map((s) => s.galaxy)
  );
  const planets = await prisma.planet.findMany({
    where: { galaxy: { lte: NUM_SETORES } },
    select: { id: true, galaxy: true, system: true, user: { select: { username: true } } },
  });
  const count: Record<number, number> = {};
  for (const p of planets) { const id = galaxyId(p.galaxy, p.system); count[id] = (count[id] ?? 0) + 1; }
  return { privateIds, planets, count };
}

// Melhor galáxia de destino pra um planeta: a mais CHEIA com vaga que NÃO seja a dele
// e não seja privada. (encher de baixo pra cima)
function pickTarget(count: Record<number, number>, privateIds: Set<number>, myGalId: number): number | null {
  let best = -1, bestC = -1;
  for (let setor = 1; setor <= NUM_SETORES; setor++) {
    for (let par = 1; par <= NUM_PARALELOS; par++) {
      const id = galaxyId(setor, par);
      if (id === myGalId || privateIds.has(id)) continue;
      const c = count[id] ?? 0;
      if (c >= SLOTS_PER_SYSTEM) continue;      // cheia
      if (c > bestC) { bestC = c; best = id; }   // prefere a mais cheia com vaga
    }
  }
  return best === -1 ? null : best;
}

async function main() {
  const { privateIds, planets, count } = await snapshot();
  // Sozinhos = planeta cuja galáxia PÚBLICA tem exatamente 1 planeta.
  // IMPORTANTE: planetas em galáxia PRIVADA ficam de fora — quem tem galáxia
  // privada (próprio dono, ex.: Ramb2016) pode estar "sozinho" ali de propósito;
  // reagrupar só vale pra galáxias públicas.
  const loners = planets.filter((p) => {
    const id = galaxyId(p.galaxy, p.system);
    if (privateIds.has(id)) return false; // nunca mexe em quem está numa privada
    return (count[id] ?? 0) === 1;
  });
  if (loners.length === 0) { console.log("✅ Ninguém sozinho numa galáxia pública. Nada a fazer."); return; }
  console.log(`${loners.length} jogador(es) sozinho(s). ${DRY ? "(dry-run)" : ""}`);

  // Trabalha num count mutável pra ir enchendo as galáxias conforme realoca.
  const live = { ...count };
  let moved = 0;
  for (const p of loners) {
    const myGalId = galaxyId(p.galaxy, p.system);
    // Se, ao longo do processo, essa galáxia deixou de ter só ele, pula (já juntou).
    if ((live[myGalId] ?? 0) !== 1) continue;
    const target = pickTarget(live, privateIds, myGalId);
    if (target == null) { console.log(`  (sem destino com vaga pra ${p.user.username}) `); continue; }
    const tw = galaxyWhere(target);
    if (DRY) {
      console.log(`  ${p.user.username}: ${p.galaxy}:${p.system} → ${tw.galaxy}:${tw.system}`);
    } else {
      const r = await relocate(p.id, target);
      console.log(`  ✅ ${p.user.username}: ${p.galaxy}:${p.system} → ${r.galaxy}:${r.system}:${r.slot}`);
    }
    live[myGalId] = 0;                         // ele saiu da antiga
    live[target] = (live[target] ?? 0) + 1;    // entrou na nova
    moved++;
  }
  console.log(`${DRY ? "Fariam" : "Movidos"}: ${moved}. ${DRY ? "(rode sem --dry pra aplicar)" : "Concluído."}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
