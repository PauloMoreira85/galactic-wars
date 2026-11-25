import { prisma } from "../db.js";
import { ROID_PRODUCTION_PER_TICK } from "./constants.js";
import { addNews } from "./news.js";
import { addMorale } from "./morale.js";
import { galaxyId, galaxyWhere, galaxyDecompose } from "./geo.js";
import { parseUnits, totalUnits } from "./unitmap.js";
import { radarVisibleCount } from "./catalog.js";

// "setor:paralelo" para exibir uma galáxia (a partir do id interno).
function coordLabel(id: number): string {
  const { setor, paralelo } = galaxyDecompose(id);
  return `${setor}:${paralelo}`;
}

export const MAX_TAX = 25;            // teto do imposto (%)
export const MAX_MARKET_FEE = 25;     // teto da taxa de troca do mercado (%)
export const DONATION_MAX_PCT = 50;   // teto ACUMULADO por janela: um planeta recebe até 50% do fundo
export const DONATION_WINDOW = 72;    // ticks da janela; recebido zera quando a janela passa

async function ensureGalaxy(galaxy: number) {
  return prisma.galaxyState.upsert({ where: { galaxy }, update: {}, create: { galaxy } });
}

// Retorna o ID da galáxia (= par setor:sistema, via galaxyId) do planeta.
async function planetGalaxy(planetId: string): Promise<number | null> {
  const p = await prisma.planet.findUnique({ where: { id: planetId }, select: { galaxy: true, system: true } });
  return p ? galaxyId(p.galaxy, p.system) : null;
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
    // Moral: quem assume o posto de Comandante da Galaxia ganha +10; quem perde, -10.
    if (st.cgPlanetId) await addMorale(st.cgPlanetId, -10);
    if (top) await addMorale(top, 10);
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
  if (targetPlanetId === cgPlanetId) throw new Error("O Comandante não pode acumular um cargo de ministro (1 cargo por planeta)");
  if ((await planetGalaxy(targetPlanetId)) !== g) throw new Error("O ministro deve ser da sua galaxia");
  // 1 cargo por planeta: tira o alvo de qualquer outro ministério antes de nomear.
  const data: any = {};
  if (st.mePlanetId === targetPlanetId) data.mePlanetId = null;
  if (st.mgPlanetId === targetPlanetId) data.mgPlanetId = null;
  if (st.mdPlanetId === targetPlanetId) data.mdPlanetId = null;
  data[role === "me" ? "mePlanetId" : role === "mg" ? "mgPlanetId" : "mdPlanetId"] = targetPlanetId;
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
  return ts.map((t) => {
    const other = t.galaxyA === galaxy ? t.galaxyB : t.galaxyA;
    return { other, otherCoord: coordLabel(other), status: t.status, proposedByMe: t.proposedBy === galaxy };
  });
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

// ME define a taxa de troca do mercado da galáxia (% que fica no fundo).
export async function setMarketFee(mePlanetId: string, rate: number) {
  const g = await planetGalaxy(mePlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.mePlanetId !== mePlanetId) throw new Error("Apenas o Ministro da Economia pode definir a taxa do mercado");
  const r = Math.max(0, Math.min(MAX_MARKET_FEE, Math.floor(rate)));
  await prisma.galaxyState.update({ where: { galaxy: g }, data: { marketFee: r } });
}

// ME tranca/destranca o mercado da galáxia (trancado = ninguém troca com o fundo).
export async function setMarketLocked(mePlanetId: string, locked: boolean) {
  const g = await planetGalaxy(mePlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.mePlanetId !== mePlanetId) throw new Error("Apenas o Ministro da Economia pode trancar o mercado");
  await prisma.galaxyState.update({ where: { galaxy: g }, data: { marketLocked: locked } });
}

// ME doa recursos do fundo para um planeta (cap 50% do total do fundo, cooldown por planeta).
// QUALQUER planeta da galáxia doa recursos PRA o fundo (voluntário). O ME depois
// distribui com donate(). Desconta do planeta e soma no fundo; registra no livro
// caixa (from = planeta, to = "Fundo da galáxia").
export async function contributeToFund(planetId: string, amounts: { metalium: number; carbonum: number; plutonium: number }) {
  const g = await planetGalaxy(planetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  await ensureGalaxy(g);
  const planet = await prisma.planet.findUnique({ where: { id: planetId }, select: { name: true, metalium: true, carbonum: true, plutonium: true } });
  if (!planet) throw new Error("Planeta nao encontrado");

  const m = Math.max(0, Math.floor(amounts.metalium));
  const c = Math.max(0, Math.floor(amounts.carbonum));
  const p = Math.max(0, Math.floor(amounts.plutonium));
  if (m + c + p <= 0) throw new Error("Informe um valor para doar ao fundo");
  if (m > planet.metalium || c > planet.carbonum || p > planet.plutonium) {
    throw new Error(`Recursos insuficientes. Você tem: ${planet.metalium} M · ${planet.carbonum} C · ${planet.plutonium} P.`);
  }
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  await prisma.$transaction([
    prisma.planet.update({ where: { id: planetId }, data: { metalium: { decrement: m }, carbonum: { decrement: c }, plutonium: { decrement: p } } }),
    prisma.galaxyState.update({ where: { galaxy: g }, data: { fundMetalium: { increment: m }, fundCarbonum: { increment: c }, fundPlutonium: { increment: p } } }),
    prisma.donationLog.create({ data: { galaxy: g, fromName: planet.name, toName: "Fundo da galáxia", metalium: m, carbonum: c, plutonium: p, tick } }),
  ]);
}

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
  if (st.fundMetalium + st.fundCarbonum + st.fundPlutonium <= 0) {
    throw new Error("O fundo da galáxia está vazio. Defina um imposto (% da produção) pra abastecê-lo antes de doar.");
  }
  if (m > st.fundMetalium || c > st.fundCarbonum || p > st.fundPlutonium) {
    throw new Error(`Fundo insuficiente. Disponível no fundo: ${st.fundMetalium} M · ${st.fundCarbonum} C · ${st.fundPlutonium} P.`);
  }
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const doacao = m + c + p;

  // Teto ACUMULADO por JANELA: um planeta pode RECEBER até DONATION_MAX_PCT% do fundo
  // dentro de DONATION_WINDOW ticks — em QUANTAS doações quiser. O teto é fixado em
  // 50% do fundo no INÍCIO da janela (previsível); quando a janela passa, zera e o
  // planeta pode receber outros 50%. (Pedido da galera: o 50% é sobre a janela, não
  // por doação individual.)
  const fundTotal = st.fundMetalium + st.fundCarbonum + st.fundPlutonium;
  const cd = await prisma.donationCooldown.findUnique({ where: { planetId: toPlanetId } });
  const janelaAtiva = cd && (tick - cd.windowStart) < DONATION_WINDOW && cd.capInWindow > 0;
  // Teto e acumulado da janela corrente (ou uma janela nova começando agora).
  const cap = janelaAtiva ? cd!.capInWindow : Math.floor(fundTotal * DONATION_MAX_PCT / 100);
  const jaRecebido = janelaAtiva ? cd!.recvInWindow : 0;
  const windowStart = janelaAtiva ? cd!.windowStart : tick;
  if (jaRecebido + doacao > cap) {
    const resta = Math.max(0, cap - jaRecebido);
    const faltam = janelaAtiva ? DONATION_WINDOW - (tick - cd!.windowStart) : 0;
    throw new Error(
      `Esse planeta já recebeu ${jaRecebido} nesta janela (teto ${cap} = ${DONATION_MAX_PCT}% do fundo). ` +
      `Pode receber mais ${resta} agora${janelaAtiva ? ` (janela zera em ${faltam}t)` : ""}. Você pediu ${doacao}.`
    );
  }

  // Nomes dos planetas (ME e destino) pro livro caixa.
  const [meP, toP] = await Promise.all([
    prisma.planet.findUnique({ where: { id: mePlanetId }, select: { name: true } }),
    prisma.planet.findUnique({ where: { id: toPlanetId }, select: { name: true } }),
  ]);
  await prisma.$transaction([
    prisma.galaxyState.update({ where: { galaxy: g }, data: { fundMetalium: { decrement: m }, fundCarbonum: { decrement: c }, fundPlutonium: { decrement: p } } }),
    prisma.planet.update({ where: { id: toPlanetId }, data: { metalium: { increment: m }, carbonum: { increment: c }, plutonium: { increment: p } } }),
    // Registra o acumulado da janela (cria/atualiza).
    prisma.donationCooldown.upsert({
      where: { planetId: toPlanetId },
      update: { lastTick: tick, windowStart, recvInWindow: jaRecebido + doacao, capInWindow: cap },
      create: { planetId: toPlanetId, lastTick: tick, windowStart, recvInWindow: doacao, capInWindow: cap },
    }),
    // Livro caixa: registra a doação (transparência pra galáxia).
    prisma.donationLog.create({ data: { galaxy: g, fromName: meP?.name ?? "ME", toName: toP?.name ?? "?", metalium: m, carbonum: c, plutonium: p, tick } }),
  ]);
  await addNews(toPlanetId, tick, `💰 Recebeu doação do Ministro da Economia: ${m} M · ${c} C · ${p} P`);
}

// Aplica o imposto: desvia taxRate% da produção de cada planeta pro fundo da galáxia.
// Chamado pelo motor de tick (n = nº de ticks processados).
export async function processTax(n: number) {
  if (n <= 0) return;
  const states = await prisma.galaxyState.findMany({ where: { taxRate: { gt: 0 } } });
  for (const st of states) {
    const planets = await prisma.planet.findMany({ where: galaxyWhere(st.galaxy) });
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
  const planets = await prisma.planet.findMany({ where: galaxyWhere(g), include: { user: { select: { username: true } } } });
  const votes = await prisma.galaxyVote.findMany({ where: { galaxy: g } });
  const tally: Record<string, number> = {};
  for (const v of votes) tally[v.candidatePlanetId] = (tally[v.candidatePlanetId] || 0) + 1;
  const nameOf = (id: string | null) => id ? planets.find((p) => p.id === id)?.name ?? null : null;
  const myVote = votes.find((v) => v.voterPlanetId === planetId)?.candidatePlanetId ?? null;

  // Teto de doação por membro (acumulado na janela): já recebido e quanto ainda pode.
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const fundTotalNow = st.fundMetalium + st.fundCarbonum + st.fundPlutonium;
  const cds = await prisma.donationCooldown.findMany({ where: { planetId: { in: planets.map((p) => p.id) } } });
  const cdBy = new Map(cds.map((c) => [c.planetId, c]));
  const donInfo = (pid: string) => {
    const cd = cdBy.get(pid);
    const ativa = cd && (tick - cd.windowStart) < DONATION_WINDOW && cd.capInWindow > 0;
    const cap = ativa ? cd!.capInWindow : Math.floor(fundTotalNow * DONATION_MAX_PCT / 100);
    const recv = ativa ? cd!.recvInWindow : 0;
    const resetIn = ativa ? Math.max(0, DONATION_WINDOW - (tick - cd!.windowStart)) : 0;
    return { recv, cap, canReceive: Math.max(0, cap - recv), resetIn };
  };

  return {
    galaxy: g, galaxyCoord: coordLabel(g),
    galaxyName: st.name, flag: st.flag,
    cg: nameOf(st.cgPlanetId), cgId: st.cgPlanetId,
    me: nameOf(st.mePlanetId), meId: st.mePlanetId,
    mg: nameOf(st.mgPlanetId), mgId: st.mgPlanetId,
    md: nameOf(st.mdPlanetId), mdId: st.mdPlanetId,
    taxRate: st.taxRate,
    marketFee: st.marketFee,
    marketLocked: st.marketLocked,
    fund: { metalium: st.fundMetalium, carbonum: st.fundCarbonum, plutonium: st.fundPlutonium },
    treaties: await listTreaties(g),
    iAmCG: st.cgPlanetId === planetId, iAmME: st.mePlanetId === planetId, iAmMG: st.mgPlanetId === planetId, iAmMD: st.mdPlanetId === planetId,
    myVote,
    members: planets.map((p) => ({ id: p.id, name: p.name, commander: p.user.username, coords: `${p.galaxy}:${p.system}:${p.slot}`, votes: tally[p.id] || 0, donation: donInfo(p.id) })),
    // Livro caixa: últimas 30 doações do fundo desta galáxia (mais recentes primeiro).
    donations: (await prisma.donationLog.findMany({ where: { galaxy: g }, orderBy: { createdAt: "desc" }, take: 30 }))
      .map((d) => ({ from: d.fromName, to: d.toName, metalium: d.metalium, carbonum: d.carbonum, plutonium: d.plutonium, tick: d.tick })),
  };
}

// MG vê as frotas dos planetas da galáxia.
export async function mgFleets(mgPlanetId: string) {
  const g = await planetGalaxy(mgPlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.mgPlanetId !== mgPlanetId) throw new Error("Apenas o Ministro da Guerra pode ver isto");
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const planets = await prisma.planet.findMany({ where: galaxyWhere(g), include: { user: { select: { username: true } } } });
  const allFleets = await prisma.fleet.findMany({ where: { ownerPlanetId: { in: planets.map((p) => p.id) } } });
  // Visão militar COMPLETA de aliado: naves na base (hangar) + todas as frotas,
  // com a composição real (inclusive naves invisíveis — é inteligência interna).
  return planets.map((p) => {
    const base = parseUnits(p.units);
    const fleets = allFleets.filter((f) => f.ownerPlanetId === p.id).map((f) => {
      const u = parseUnits(f.units);
      return {
        name: f.name, mission: f.mission, status: f.status,
        target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
        // TEC: ticks restantes até chegar/voltar (idle = 0; engaged = em combate).
        ticks: f.status === "idle" ? 0 : Math.max(0, f.arriveTick - tick),
        units: u, total: totalUnits(u),
      };
    });
    return {
      planet: p.name, commander: p.user.username,
      coords: `${p.galaxy}:${p.system}:${p.slot}`,
      base, baseTotal: totalUnits(base), fleets,
    };
  });
}

// ⚔️ INFORMAÇÃO DE GUERRA (MG + CG) — como no GW original: por PLANETA da galáxia,
// os ATAQUES chegando (ordem de TEC) e, embaixo, as DEFESAS chegando (ordem de TEC).
// Visível ao Ministro da Guerra OU ao Conselho da Galáxia (CG).
export async function warInfo(viewerPlanetId: string) {
  const g = await planetGalaxy(viewerPlanetId);
  if (g == null) throw new Error("Planeta nao encontrado");
  const st = await ensureGalaxy(g);
  if (st.mgPlanetId !== viewerPlanetId && st.cgPlanetId !== viewerPlanetId) {
    throw new Error("Apenas o Ministro da Guerra ou o Comandante da Galáxia podem ver isto");
  }
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const { setor, paralelo } = galaxyDecompose(g);
  // Planetas da galáxia (= par setor:paralelo).
  const planets = await prisma.planet.findMany({ where: { galaxy: setor, system: paralelo }, include: { user: { select: { username: true } } }, orderBy: { slot: "asc" } });
  // Frotas em movimento MIRANDO esta galáxia (vindas de qualquer lugar).
  const incoming = await prisma.fleet.findMany({ where: { targetGalaxy: setor, targetSystem: paralelo, status: { in: ["outbound", "engaged", "garrison"] } } });
  const ownerIds = [...new Set(incoming.map((f) => f.ownerPlanetId))];
  const owners = await prisma.planet.findMany({ where: { id: { in: ownerIds } }, include: { user: { select: { username: true } } } });
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  return planets.map((p) => {
    const mine = incoming.filter((f) => f.targetSlot === p.slot);
    const row = (f: typeof incoming[number]) => {
      const o = ownerMap.get(f.ownerPlanetId);
      return {
        fleetName: f.name,
        from: o ? `${o.galaxy}:${o.system}:${o.slot}` : "?",
        fromPlanet: o?.name ?? "?", fromCommander: o?.user.username ?? "?",
        ships: radarVisibleCount(parseUnits(f.units)), // radar esconde invisíveis (Rakshasa)
        status: f.status,
        tec: f.status === "engaged" ? 0 : Math.max(0, f.arriveTick - tick),
        engaged: f.status === "engaged",
      };
    };
    const byTec = (a: { tec: number }, b: { tec: number }) => a.tec - b.tec;
    const attacks = mine.filter((f) => f.mission === "attack").map(row).sort(byTec);
    const defenses = mine.filter((f) => f.mission !== "attack").map(row).sort(byTec);
    return {
      planet: p.name, commander: p.user.username,
      coords: `${p.galaxy}:${p.system}:${p.slot}`, slot: p.slot,
      attacks, defenses,
    };
  });
}
