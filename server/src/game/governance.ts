import { prisma } from "../db.js";
import { ROID_PRODUCTION_PER_TICK } from "./constants.js";
import { addNews } from "./news.js";

export const MAX_TAX = 50;            // teto do imposto (%)
export const DONATION_MAX_PCT = 20;   // máximo do fundo por doação a 1 planeta
export const DONATION_WINDOW = 100;   // ticks de cooldown entre doações ao mesmo planeta

async function ensureGalaxy(galaxy: number) {
  return prisma.galaxyState.upsert({ where: { galaxy }, update: {}, create: { galaxy } });
}

async function planetGalaxy(planetId: string): Promise<number | null> {
  const p = await prisma.planet.findUnique({ where: { id: planetId }, select: { galaxy: true } });
  return p?.galaxy ?? null;
}

// Recalcula o CG (mais votado) da galáxia. Se mudar, zera os ministros.
async function recomputeCG(galaxy: number) {
  const votes = await prisma.galaxyVote.findMany({ where: { galaxy } });
  const tally: Record<string, number> = {};
  for (const v of votes) tally[v.candidatePlanetId] = (tally[v.candidatePlanetId] || 0) + 1;
  let top: string | null = null, max = 0;
  for (const k of Object.keys(tally)) if (tally[k] > max) { max = tally[k]; top = k; }
  const st = await ensureGalaxy(galaxy);
  if (st.cgPlanetId !== top) {
    await prisma.galaxyState.update({ where: { galaxy }, data: { cgPlanetId: top, mePlanetId: null, mgPlanetId: null, mdPlanetId: null } });
  }
}

// Voto para CG (voto único por planeta; candidato deve ser da mesma galáxia).
export async function vote(voterPlanetId: string, candidatePlanetId: string) {
  const g = await planetGalaxy(voterPlanetId);
  const gc = await planetGalaxy(candidatePlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  if (gc !== g) throw new Error("So pode votar em planetas da sua galaxia");
  await ensureGalaxy(g);
  await prisma.galaxyVote.upsert({
    where: { voterPlanetId },
    update: { candidatePlanetId, galaxy: g },
    create: { voterPlanetId, candidatePlanetId, galaxy: g },
  });
  await recomputeCG(g);
}

// CG nomeia Ministro da Economia (me), da Guerra (mg) ou da Diplomacia (md).
export async function appoint(cgPlanetId: string, role: "me" | "mg" | "md", targetPlanetId: string) {
  const g = await planetGalaxy(cgPlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.cgPlanetId !== cgPlanetId) throw new Error("Apenas o Comandante da Galaxia pode nomear ministros");
  if ((await planetGalaxy(targetPlanetId)) !== g) throw new Error("O ministro deve ser da sua galaxia");
  const data = role === "me" ? { mePlanetId: targetPlanetId } : role === "mg" ? { mgPlanetId: targetPlanetId } : { mdPlanetId: targetPlanetId };
  await prisma.galaxyState.update({ where: { galaxy: g }, data });
}

// ===== Diplomacia (Ministro da Diplomacia) =====
function pair(a: number, b: number): [number, number] { return a < b ? [a, b] : [b, a]; }

async function requireMD(planetId: string) {
  const g = await planetGalaxy(planetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.mdPlanetId !== planetId) throw new Error("Apenas o Ministro da Diplomacia pode fazer/encerrar acordos");
  return g;
}

// MD propõe um tratado de não-agressão com outra galáxia.
export async function proposeTreaty(mdPlanetId: string, otherGalaxy: number) {
  const g = await requireMD(mdPlanetId);
  if (otherGalaxy === g) throw new Error("Escolha outra galaxia");
  const [a, b] = pair(g, otherGalaxy);
  await prisma.galaxyTreaty.upsert({
    where: { galaxyA_galaxyB: { galaxyA: a, galaxyB: b } },
    update: {}, create: { galaxyA: a, galaxyB: b, status: "proposed", proposedBy: g },
  });
}

// MD da outra galáxia aceita o tratado.
export async function acceptTreaty(mdPlanetId: string, otherGalaxy: number) {
  const g = await requireMD(mdPlanetId);
  const [a, b] = pair(g, otherGalaxy);
  const t = await prisma.galaxyTreaty.findUnique({ where: { galaxyA_galaxyB: { galaxyA: a, galaxyB: b } } });
  if (!t) throw new Error("Nao ha proposta dessa galaxia");
  if (t.proposedBy === g) throw new Error("Voce propôs esse tratado; aguarde a outra galaxia aceitar");
  await prisma.galaxyTreaty.update({ where: { id: t.id }, data: { status: "active" } });
}

export async function cancelTreaty(mdPlanetId: string, otherGalaxy: number) {
  const g = await requireMD(mdPlanetId);
  const [a, b] = pair(g, otherGalaxy);
  await prisma.galaxyTreaty.deleteMany({ where: { galaxyA: a, galaxyB: b } });
}

export async function listTreaties(galaxy: number) {
  const ts = await prisma.galaxyTreaty.findMany({ where: { OR: [{ galaxyA: galaxy }, { galaxyB: galaxy }] } });
  return ts.map((t) => ({ other: t.galaxyA === galaxy ? t.galaxyB : t.galaxyA, status: t.status, proposedByMe: t.proposedBy === galaxy }));
}

// Existe tratado ATIVO entre as duas galáxias? (bloqueia ataque)
export async function hasActiveTreaty(gA: number, gB: number): Promise<boolean> {
  if (gA === gB) return false;
  const [a, b] = pair(gA, gB);
  const t = await prisma.galaxyTreaty.findUnique({ where: { galaxyA_galaxyB: { galaxyA: a, galaxyB: b } } });
  return !!t && t.status === "active";
}

// CG define o nome da galáxia.
export async function setGalaxyName(cgPlanetId: string, name: string) {
  const g = await planetGalaxy(cgPlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.cgPlanetId !== cgPlanetId) throw new Error("Apenas o Comandante da Galaxia pode nomear a galaxia");
  await prisma.galaxyState.update({ where: { galaxy: g }, data: { name: name.slice(0, 40) } });
}

export const MAX_FLAG_BYTES = 60000; // ~60KB (data URL base64)

// CG define a bandeira da galáxia (imagem em data URL base64, limitada).
export async function setGalaxyFlag(cgPlanetId: string, dataUrl: string) {
  const g = await planetGalaxy(cgPlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.cgPlanetId !== cgPlanetId) throw new Error("Apenas o Comandante da Galaxia pode definir a bandeira");
  if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,/.test(dataUrl)) throw new Error("Imagem invalida");
  if (dataUrl.length > MAX_FLAG_BYTES) throw new Error(`Imagem muito grande (max ~${Math.floor(MAX_FLAG_BYTES / 1000)}KB)`);
  await prisma.galaxyState.update({ where: { galaxy: g }, data: { flag: dataUrl } });
}

// ME define o imposto (%).
export async function setTax(mePlanetId: string, rate: number) {
  const g = await planetGalaxy(mePlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.mePlanetId !== mePlanetId) throw new Error("Apenas o Ministro da Economia pode definir o imposto");
  const r = Math.max(0, Math.min(MAX_TAX, Math.floor(rate)));
  await prisma.galaxyState.update({ where: { galaxy: g }, data: { taxRate: r } });
}

// ME doa recursos do fundo para um planeta (cap 20% do fundo, cooldown por planeta).
export async function donate(mePlanetId: string, toPlanetId: string, amounts: { metalium: number; carbonum: number; plutonium: number }) {
  const g = await planetGalaxy(mePlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.mePlanetId !== mePlanetId) throw new Error("Apenas o Ministro da Economia pode doar");
  if ((await planetGalaxy(toPlanetId)) !== g) throw new Error("So pode doar para planetas da sua galaxia");

  const m = Math.max(0, Math.floor(amounts.metalium));
  const c = Math.max(0, Math.floor(amounts.carbonum));
  const p = Math.max(0, Math.floor(amounts.plutonium));
  if (m + c + p <= 0) throw new Error("Informe um valor para doar");
  if (m > st.fundMetalium || c > st.fundCarbonum || p > st.fundPlutonium) throw new Error("Fundo insuficiente");
  // Cap de 20% do fundo (por recurso) numa doação.
  if (m > Math.floor(st.fundMetalium * DONATION_MAX_PCT / 100) ||
      c > Math.floor(st.fundCarbonum * DONATION_MAX_PCT / 100) ||
      p > Math.floor(st.fundPlutonium * DONATION_MAX_PCT / 100)) {
    throw new Error(`Maximo ${DONATION_MAX_PCT}% do fundo por doacao`);
  }
  // Cooldown por planeta.
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const cd = await prisma.donationCooldown.findUnique({ where: { planetId: toPlanetId } });
  if (cd && tick - cd.lastTick < DONATION_WINDOW) {
    throw new Error(`Esse planeta so pode receber outra doacao em ${DONATION_WINDOW - (tick - cd.lastTick)} ticks`);
  }

  await prisma.$transaction([
    prisma.galaxyState.update({ where: { galaxy: g }, data: { fundMetalium: { decrement: m }, fundCarbonum: { decrement: c }, fundPlutonium: { decrement: p } } }),
    prisma.planet.update({ where: { id: toPlanetId }, data: { metalium: { increment: m }, carbonum: { increment: c }, plutonium: { increment: p } } }),
    prisma.donationCooldown.upsert({ where: { planetId: toPlanetId }, update: { lastTick: tick }, create: { planetId: toPlanetId, lastTick: tick } }),
  ]);
  await addNews(toPlanetId, tick, `💰 Recebeu doação do Ministro da Economia: ${m} M · ${c} C · ${p} P`);
}

// Aplica o imposto: desvia taxRate% da produção de cada planeta pro fundo da galáxia.
// Chamado pelo motor de tick (n = nº de ticks processados).
export async function processTax(n: number) {
  if (n <= 0) return;
  const states = await prisma.galaxyState.findMany({ where: { taxRate: { gt: 0 } } });
  for (const st of states) {
    const planets = await prisma.planet.findMany({ where: { galaxy: st.galaxy } });
    let fm = 0, fc = 0, fp = 0;
    for (const pl of planets) {
      const prodM = Math.floor(pl.roidMetalium * ROID_PRODUCTION_PER_TICK * pl.prodMul / 100) * n;
      const prodC = Math.floor(pl.roidCarbonum * ROID_PRODUCTION_PER_TICK * pl.prodMul / 100) * n;
      const prodP = Math.floor(pl.roidPlutonium * ROID_PRODUCTION_PER_TICK * pl.prodMul / 100) * n;
      const tm = Math.min(pl.metalium, Math.floor(prodM * st.taxRate / 100));
      const tc = Math.min(pl.carbonum, Math.floor(prodC * st.taxRate / 100));
      const tp = Math.min(pl.plutonium, Math.floor(prodP * st.taxRate / 100));
      if (tm + tc + tp <= 0) continue;
      await prisma.planet.update({ where: { id: pl.id }, data: { metalium: { decrement: tm }, carbonum: { decrement: tc }, plutonium: { decrement: tp } } });
      fm += tm; fc += tc; fp += tp;
    }
    if (fm + fc + fp > 0) {
      await prisma.galaxyState.update({ where: { galaxy: st.galaxy }, data: { fundMetalium: { increment: fm }, fundCarbonum: { increment: fc }, fundPlutonium: { increment: fp } } });
    }
  }
}

// Visão do governo da galáxia para um jogador.
export async function govView(planetId: string) {
  const g = await planetGalaxy(planetId);
  if (g == null) return null;
  const st = await ensureGalaxy(g);
  const planets = await prisma.planet.findMany({ where: { galaxy: g }, include: { user: { select: { username: true } } } });
  const votes = await prisma.galaxyVote.findMany({ where: { galaxy: g } });
  const tally: Record<string, number> = {};
  for (const v of votes) tally[v.candidatePlanetId] = (tally[v.candidatePlanetId] || 0) + 1;
  const nameOf = (id: string | null) => id ? planets.find((p) => p.id === id)?.name ?? null : null;
  const myVote = votes.find((v) => v.voterPlanetId === planetId)?.candidatePlanetId ?? null;

  return {
    galaxy: g,
    galaxyName: st.name, flag: st.flag,
    cg: nameOf(st.cgPlanetId), cgId: st.cgPlanetId,
    me: nameOf(st.mePlanetId), meId: st.mePlanetId,
    mg: nameOf(st.mgPlanetId), mgId: st.mgPlanetId,
    md: nameOf(st.mdPlanetId), mdId: st.mdPlanetId,
    taxRate: st.taxRate,
    fund: { metalium: st.fundMetalium, carbonum: st.fundCarbonum, plutonium: st.fundPlutonium },
    treaties: await listTreaties(g),
    iAmCG: st.cgPlanetId === planetId, iAmME: st.mePlanetId === planetId, iAmMG: st.mgPlanetId === planetId, iAmMD: st.mdPlanetId === planetId,
    myVote,
    members: planets.map((p) => ({ id: p.id, name: p.name, commander: p.user.username, coords: `${p.galaxy}:${p.system}:${p.slot}`, votes: tally[p.id] || 0 })),
  };
}

// MG vê as frotas dos planetas da galáxia.
export async function mgFleets(mgPlanetId: string) {
  const g = await planetGalaxy(mgPlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.mgPlanetId !== mgPlanetId) throw new Error("Apenas o Ministro da Guerra pode ver isto");
  const planets = await prisma.planet.findMany({ where: { galaxy: g }, select: { id: true, name: true } });
  const byId = new Map(planets.map((p) => [p.id, p.name]));
  const fleets = await prisma.fleet.findMany({ where: { ownerPlanetId: { in: planets.map((p) => p.id) } } });
  return fleets.map((f) => ({
    owner: byId.get(f.ownerPlanetId) ?? "?",
    mission: f.mission, status: f.status,
    target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
  }));
}
