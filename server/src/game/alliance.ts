import { prisma } from "../db.js";
import { parseUnits, totalUnits } from "./unitmap.js";
import { botAttackMessage } from "./chat.js";
import { pushToUser } from "./push.js";

// Push a TODOS os membros de uma aliança (menos o autor opcional). Best-effort —
// usado pra avisar mensagem de aliança e eventos do Quadro de Ataque no celular.
export async function pushAlliance(allianceId: string, exceptPlanetId: string | null, title: string, body: string) {
  const members = await prisma.allianceMember.findMany({ where: { allianceId }, select: { planetId: true } });
  const ids = members.map((m) => m.planetId).filter((id) => id !== exceptPlanetId);
  if (!ids.length) return;
  const planets = await prisma.planet.findMany({ where: { id: { in: ids } }, select: { userId: true } });
  for (const p of planets) {
    pushToUser(p.userId, { title, body, tag: "alianca", url: "/" }).catch(() => {});
  }
}

// 18 = até 3 galáxias (6 planetas cada). Equilibra o tamanho das tags.
export const MAX_MEMBERS = 18;
// dc = Defense Commander · ac = Attack Commander (ambos veem a movimentação).
export const ROLES = ["lider", "alto_comando", "dc", "ac", "scanner", "porta_voz", "recruta"];
export const ROLE_LABEL: Record<string, string> = {
  lider: "TL (Tag Leader)", alto_comando: "Alto Comando", dc: "DC (Defense Commander)", ac: "AC (Attack Commander)", scanner: "Scanner", porta_voz: "Porta-Voz", recruta: "Recruta",
};

// Cargos que enxergam o painel de movimentação da aliança: DC/AC (os "olhos")
// + TL e Alto Comando (coordenam os dois e tomam as decisões).
export function canSeeFleets(role: string) { return role === "dc" || role === "ac" || role === "lider" || role === "alto_comando"; }

// Quem organiza o Quadro de Ataque (criar/remover alvos, travar/liberar): AC + TL/HC.
export function canManageAttack(role: string) { return role === "ac" || role === "lider" || role === "alto_comando"; }

async function memberOf(planetId: string) {
  return prisma.allianceMember.findUnique({ where: { planetId } });
}
function canInvite(role: string) { return role === "lider" || role === "alto_comando"; }

// Cria uma aliança; o criador vira Líder.
export async function createAlliance(planetId: string, name: string, tag: string) {
  if (await memberOf(planetId)) throw new Error("Voce ja esta em uma alianca");
  name = name.trim(); tag = tag.trim();
  if (name.length < 3 || tag.length < 2) throw new Error("Nome (min 3) e tag (min 2) obrigatorios");
  if (await prisma.alliance.findFirst({ where: { OR: [{ name }, { tag }] } })) throw new Error("Nome ou tag ja em uso");
  const a = await prisma.alliance.create({ data: { name, tag } });
  await prisma.allianceMember.create({ data: { planetId, allianceId: a.id, role: "lider" } });
  return a;
}

// ===== Entrada por PEDIDO (o jogador pede; TL/HC aceita) =====
// A tabela AllianceInvite passa a representar um PEDIDO pendente do jogador.

// Jogador pede pra entrar numa aliança (por tag ou nome da aliança).
export async function requestJoin(planetId: string, tagOrName: string) {
  if (await memberOf(planetId)) throw new Error("Você já está em uma aliança");
  const q = tagOrName.trim();
  const alliance = await prisma.alliance.findFirst({ where: { OR: [{ tag: q }, { name: q }] } });
  if (!alliance) throw new Error("Aliança não encontrada (confira a tag)");
  const count = await prisma.allianceMember.count({ where: { allianceId: alliance.id } });
  if (count >= MAX_MEMBERS) throw new Error(`Aliança cheia (máx ${MAX_MEMBERS})`);
  await prisma.allianceInvite.upsert({
    where: { allianceId_planetId: { allianceId: alliance.id, planetId } },
    update: {}, create: { allianceId: alliance.id, planetId },
  });
  // Avisa os líderes (TL/HC) que há um pedido.
  const leaders = await prisma.allianceMember.findMany({ where: { allianceId: alliance.id, role: { in: ["lider", "alto_comando"] } }, select: { planetId: true } });
  const applicant = await prisma.planet.findUnique({ where: { id: planetId }, select: { name: true, galaxy: true, system: true, slot: true, user: { select: { username: true } } } });
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  if (leaders.length && applicant) {
    const coord = `${applicant.galaxy}:${applicant.system}:${applicant.slot}`;
    await prisma.news.createMany({ data: leaders.map((l) => ({ planetId: l.planetId, tick, message: `🤝 ${applicant.user.username} (${coord}) pediu pra entrar na aliança — aceite ou recuse em Alianças.` })) });
  }
}

// Jogador cancela o próprio pedido.
export async function cancelJoinRequest(planetId: string) {
  await prisma.allianceInvite.deleteMany({ where: { planetId } });
}

// TL/HC aceita um pedido pendente (applicant vira recruta).
export async function acceptRequest(actorPlanetId: string, applicantPlanetId: string) {
  const mem = await memberOf(actorPlanetId);
  if (!mem || !canInvite(mem.role)) throw new Error("Apenas TL ou Alto Comando pode aceitar pedidos");
  const req = await prisma.allianceInvite.findUnique({ where: { allianceId_planetId: { allianceId: mem.allianceId, planetId: applicantPlanetId } } });
  if (!req) throw new Error("Pedido não encontrado");
  if (await memberOf(applicantPlanetId)) { await prisma.allianceInvite.deleteMany({ where: { planetId: applicantPlanetId } }); throw new Error("Esse jogador já entrou em uma aliança"); }
  const count = await prisma.allianceMember.count({ where: { allianceId: mem.allianceId } });
  if (count >= MAX_MEMBERS) throw new Error("Aliança cheia");
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const alliance = await prisma.alliance.findUnique({ where: { id: mem.allianceId }, select: { tag: true } });
  await prisma.$transaction([
    prisma.allianceMember.create({ data: { planetId: applicantPlanetId, allianceId: mem.allianceId, role: "recruta" } }),
    prisma.allianceInvite.deleteMany({ where: { planetId: applicantPlanetId } }), // limpa todos os pedidos dele
    prisma.news.create({ data: { planetId: applicantPlanetId, tick, message: `✅ Seu pedido foi aceito — você entrou na aliança [${alliance?.tag ?? "?"}]!` } }),
  ]);
}

// TL/HC recusa um pedido.
export async function rejectRequest(actorPlanetId: string, applicantPlanetId: string) {
  const mem = await memberOf(actorPlanetId);
  if (!mem || !canInvite(mem.role)) throw new Error("Apenas TL ou Alto Comando pode recusar pedidos");
  await prisma.allianceInvite.deleteMany({ where: { allianceId: mem.allianceId, planetId: applicantPlanetId } });
}

export async function leaveAlliance(planetId: string) {
  const mem = await memberOf(planetId);
  if (!mem) throw new Error("Voce nao esta em uma alianca");
  const count = await prisma.allianceMember.count({ where: { allianceId: mem.allianceId } });
  if (mem.role === "lider" && count > 1) throw new Error("Transfira a lideranca antes de sair (ou expulse os membros)");
  await prisma.allianceMember.delete({ where: { planetId } });
  if (count <= 1) await prisma.alliance.delete({ where: { id: mem.allianceId } }); // ultimo membro -> dissolve
}

// TL expulsa qualquer um; HC expulsa só membros "comuns" (não TL nem outro HC).
export async function kickMember(actorPlanetId: string, targetPlanetId: string) {
  const mem = await memberOf(actorPlanetId);
  if (!mem || (mem.role !== "lider" && mem.role !== "alto_comando")) throw new Error("Apenas TL ou Alto Comando pode expulsar");
  if (targetPlanetId === actorPlanetId) throw new Error("Voce nao pode se expulsar");
  const t = await memberOf(targetPlanetId);
  if (!t || t.allianceId !== mem.allianceId) throw new Error("Esse planeta nao e da sua alianca");
  // HC não pode expulsar o TL nem outro HC — isso é exclusivo do TL.
  if (mem.role === "alto_comando" && (t.role === "lider" || t.role === "alto_comando")) {
    throw new Error("Alto Comando não pode expulsar o TL nem outro Alto Comando");
  }
  await prisma.allianceMember.delete({ where: { planetId: targetPlanetId } });
}

// Define cargo. TL faz tudo (inclusive promover a TL, que o rebaixa a HC, e nomear HC).
// HC pode nomear cargos operacionais, mas NÃO pode criar TL nem HC, nem mexer em TL/HC.
export async function setMemberRole(actorPlanetId: string, targetPlanetId: string, role: string) {
  const mem = await memberOf(actorPlanetId);
  if (!mem || (mem.role !== "lider" && mem.role !== "alto_comando")) throw new Error("Apenas TL ou Alto Comando pode mudar cargos");
  if (!ROLES.includes(role)) throw new Error("Cargo invalido");
  const t = await memberOf(targetPlanetId);
  if (!t || t.allianceId !== mem.allianceId) throw new Error("Esse planeta nao e da sua alianca");

  if (mem.role === "alto_comando") {
    // HC não cria TL nem HC, e não altera o cargo de um TL ou de outro HC.
    if (role === "lider" || role === "alto_comando") throw new Error("Só o TL pode nomear TL ou Alto Comando");
    if (t.role === "lider" || t.role === "alto_comando") throw new Error("Alto Comando não pode alterar o cargo do TL nem de outro Alto Comando");
  }

  if (role === "lider") {
    // Só o TL chega aqui: passar a liderança rebaixa o TL atual a Alto Comando.
    await prisma.$transaction([
      prisma.allianceMember.update({ where: { planetId: targetPlanetId }, data: { role: "lider" } }),
      prisma.allianceMember.update({ where: { planetId: actorPlanetId }, data: { role: "alto_comando" } }),
    ]);
  } else {
    await prisma.allianceMember.update({ where: { planetId: targetPlanetId }, data: { role } });
  }
}

// Visão da aliança do jogador (ou convites pendentes se não tiver aliança).
export async function allianceView(planetId: string) {
  const mem = await memberOf(planetId);
  if (!mem) {
    // Sem aliança: mostra o(s) pedido(s) pendente(s) DELE (pra poder cancelar).
    const reqs = await prisma.allianceInvite.findMany({ where: { planetId }, include: { alliance: true } });
    return { inAlliance: false, myRequests: reqs.map((i) => ({ allianceId: i.allianceId, name: i.alliance.name, tag: i.alliance.tag })) };
  }
  const alliance = await prisma.alliance.findUnique({ where: { id: mem.allianceId } });
  const members = await prisma.allianceMember.findMany({ where: { allianceId: mem.allianceId } });
  const planets = await prisma.planet.findMany({
    where: { id: { in: members.map((m) => m.planetId) } },
    include: { user: { select: { username: true } } },
  });
  const pById = new Map(planets.map((p) => [p.id, p]));
  const pending = canInvite(mem.role) ? await prisma.allianceInvite.findMany({ where: { allianceId: mem.allianceId } }) : [];
  const pendingPlanets = await prisma.planet.findMany({ where: { id: { in: pending.map((i) => i.planetId) } }, include: { user: { select: { username: true } } } });

  return {
    inAlliance: true,
    id: alliance!.id, name: alliance!.name, tag: alliance!.tag, maxMembers: MAX_MEMBERS,
    myRole: mem.role,
    canInvite: canInvite(mem.role), isLeader: mem.role === "lider",
    // TL e HC gerenciam pessoal (cargos/expulsar); a UI aplica os limites por cargo.
    canManage: mem.role === "lider" || mem.role === "alto_comando",
    orders: alliance!.orders ?? null, ordersBy: alliance!.ordersBy ?? null, ordersAt: alliance!.ordersAt ?? null,
    members: members.map((m) => {
      const p: any = pById.get(m.planetId);
      return { planetId: m.planetId, role: m.role, name: p?.name ?? "?", commander: p?.user.username ?? "?", coords: p ? `${p.galaxy}:${p.system}:${p.slot}` : "?" };
    }).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)),
    pending: pendingPlanets.map((p) => ({ planetId: p.id, name: p.name, commander: p.user.username })),
  };
}

// ===== Quadro de Ataque (sala de alvos estilo mIRC) =====
// Monta a visão do quadro: alvos + quem pegou cada um + estado travado/liberado.
// Todo membro VÊ; só pega quando liberado; só o comando (AC/TL/HC) organiza.
export async function attackBoardView(planetId: string) {
  const mem = await memberOf(planetId);
  if (!mem) throw new Error("Voce nao esta em uma alianca");
  const board = await prisma.attackBoard.findUnique({ where: { allianceId: mem.allianceId } });
  const locked = board?.locked ?? true;
  const targets = await prisma.attackTarget.findMany({ where: { allianceId: mem.allianceId }, orderBy: { createdAt: "asc" }, include: { claims: true } });
  // Nomes/coords dos planetas que pegaram alvos.
  const claimerIds = [...new Set(targets.flatMap((t) => t.claims.map((c) => c.planetId)))];
  const planets = await prisma.planet.findMany({ where: { id: { in: claimerIds } }, select: { id: true, galaxy: true, system: true, slot: true, user: { select: { username: true } } } });
  const pById = new Map(planets.map((p) => [p.id, p]));
  // Nome/coord dos próprios alvos (se o slot tiver planeta).
  const tgtPlanets = await prisma.planet.findMany({
    where: { OR: targets.map((t) => ({ galaxy: t.galaxy, system: t.system, slot: t.slot })) },
    select: { name: true, galaxy: true, system: true, slot: true },
  });
  const tgtName = new Map(tgtPlanets.map((p) => [`${p.galaxy}:${p.system}:${p.slot}`, p.name]));
  const intelByCoord = await allianceIntelByCoord(mem.allianceId); // coord -> spyHash

  return {
    locked,
    canManage: canManageAttack(mem.role),
    myPlanetId: planetId,
    targets: targets.map((t) => {
      const coord = `${t.galaxy}:${t.system}:${t.slot}`;
      return {
        id: t.id, coord, targetName: tgtName.get(coord) ?? null, note: t.note ?? null, createdBy: t.createdBy,
        intelHash: intelByCoord[coord] ?? null, // espionagem compartilhada deste alvo (se houver)
        ownerPlanetId: t.ownerPlanetId ?? null, shared: t.shared,
        iAmOwner: t.ownerPlanetId === planetId,
        mineClaimed: t.claims.some((c) => c.planetId === planetId),
        claimers: t.claims.map((c) => {
          const p: any = pById.get(c.planetId);
          return { planetId: c.planetId, name: p?.user.username ?? "?", coords: p ? `${p.galaxy}:${p.system}:${p.slot}` : "?", isOwner: c.planetId === t.ownerPlanetId };
        }),
      };
    }),
  };
}

async function requireAttackManager(planetId: string) {
  const mem = await memberOf(planetId);
  if (!mem) throw new Error("Voce nao esta em uma alianca");
  if (!canManageAttack(mem.role)) throw new Error("Apenas AC, TL ou Alto Comando organiza o quadro de ataque");
  return mem;
}

// Nome do comandante de um planeta (pras narrações do bot).
async function nameOfPlanet(planetId: string): Promise<string> {
  const p = await prisma.planet.findUnique({ where: { id: planetId }, select: { user: { select: { username: true } } } });
  return p?.user.username ?? "?";
}

// Trava/libera o quadro inteiro (mutar/desmutar a sala).
export async function toggleAttackLock(planetId: string, locked: boolean) {
  const mem = await requireAttackManager(planetId);
  await prisma.attackBoard.upsert({
    where: { allianceId: mem.allianceId },
    update: { locked, updatedAt: new Date() },
    create: { allianceId: mem.allianceId, locked },
  });
  await botAttackMessage(mem.allianceId, locked
    ? "🔒 Quadro TRAVADO. Aguardem a liberação."
    : "🔓 QUADRO LIBERADO! Peguem os alvos — digite !pego <coord> (ou clique em pegar).");
  // Liberar o quadro é o evento mais importante — avisa todo mundo no celular.
  if (!locked) await pushAlliance(mem.allianceId, null, "⚔️ Quadro de Ataque liberado", "Peguem os alvos no Quadro de Ataque da aliança!");
}

// Adiciona um alvo ao quadro.
export async function addAttackTarget(planetId: string, coord: string, note: string) {
  const mem = await requireAttackManager(planetId);
  const m = coord.trim().match(/^(\d+):(\d+):(\d+)$/);
  if (!m) throw new Error("Coordenada inválida (use g:s:slot)");
  const planet = await prisma.planet.findUnique({ where: { id: planetId }, select: { user: { select: { username: true } } } });
  await prisma.attackTarget.create({ data: {
    allianceId: mem.allianceId, galaxy: +m[1], system: +m[2], slot: +m[3],
    note: note.trim().slice(0, 120) || null, createdBy: planet?.user.username ?? "?",
  } });
  const coordStr = `${+m[1]}:${+m[2]}:${+m[3]}`;
  await botAttackMessage(mem.allianceId, `🎯 Novo alvo: ${coordStr}${note.trim() ? ` — ${note.trim()}` : ""}`);
  // Avisa os membros no celular que entrou alvo novo pra coordenar.
  await pushAlliance(mem.allianceId, planetId, "🎯 Novo alvo no Quadro de Ataque", `${coordStr}${note.trim() ? ` — ${note.trim()}` : ""}`);
}

export async function removeAttackTarget(planetId: string, targetId: string) {
  const mem = await requireAttackManager(planetId);
  const t = await prisma.attackTarget.findUnique({ where: { id: targetId } });
  if (!t || t.allianceId !== mem.allianceId) throw new Error("Alvo não é do seu quadro");
  await prisma.attackTarget.delete({ where: { id: targetId } });
}

// Membro "pega" um alvo (só com o quadro liberado). Quem pega 1º vira DONO; os
// próximos só entram se o dono tiver aberto o alvo pra parceiros (MASS).
export async function claimTarget(planetId: string, targetId: string) {
  const mem = await memberOf(planetId);
  if (!mem) throw new Error("Voce nao esta em uma alianca");
  const board = await prisma.attackBoard.findUnique({ where: { allianceId: mem.allianceId } });
  if (board?.locked ?? true) throw new Error("O quadro está travado — aguarde o comando liberar");
  // Transação: decide dono/parceiro de forma atômica (evita 2 "donos" no mesmo tick).
  let becameOwner = false; let coordStr = "";
  await prisma.$transaction(async (tx) => {
    const t = await tx.attackTarget.findUnique({ where: { id: targetId } });
    if (!t || t.allianceId !== mem.allianceId) throw new Error("Alvo não é do seu quadro");
    coordStr = `${t.galaxy}:${t.system}:${t.slot}`;
    const already = await tx.attackClaim.findUnique({ where: { targetId_planetId: { targetId, planetId } } });
    if (!t.ownerPlanetId) {
      await tx.attackTarget.update({ where: { id: targetId }, data: { ownerPlanetId: planetId } });
      becameOwner = true;
    } else if (t.ownerPlanetId !== planetId && !t.shared) {
      throw new Error("Esse alvo já tem dono e está fechado — peça ao dono pra abrir pra MASS");
    }
    if (!already) await tx.attackClaim.create({ data: { targetId, planetId } });
    else return; // já estava nele: não re-narra
  });
  if (coordStr) {
    const who = await nameOfPlanet(planetId);
    await botAttackMessage(mem.allianceId, becameOwner ? `⚔️ ${who} pegou ${coordStr} (dono 👑)` : `👥 ${who} juntou-se ao MASS em ${coordStr}`);
  }
}

// O DONO abre/fecha o alvo pra parceiros (MASS). Fechar não expulsa quem já entrou.
export async function setTargetShared(planetId: string, targetId: string, shared: boolean) {
  const t = await prisma.attackTarget.findUnique({ where: { id: targetId } });
  if (!t) throw new Error("Alvo não encontrado");
  const mem = await memberOf(planetId);
  // Dono OU comando pode abrir/fechar.
  const isManager = mem && canManageAttack(mem.role);
  if (t.ownerPlanetId !== planetId && !isManager) throw new Error("Só o dono do alvo (ou o comando) pode abrir pra MASS");
  await prisma.attackTarget.update({ where: { id: targetId }, data: { shared } });
  const coordStr = `${t.galaxy}:${t.system}:${t.slot}`;
  await botAttackMessage(t.allianceId, shared ? `🟢 ${coordStr} aberto pra MASS — podem juntar!` : `🔴 ${coordStr} fechado pelo dono`);
}

// Membro larga um alvo que pegou. Se era o dono, passa a titularidade pro próximo
// (mais antigo) ou libera o alvo se ninguém mais estiver nele.
export async function unclaimTarget(planetId: string, targetId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.attackClaim.deleteMany({ where: { targetId, planetId } });
    const t = await tx.attackTarget.findUnique({ where: { id: targetId } });
    if (!t || t.ownerPlanetId !== planetId) return;
    const next = await tx.attackClaim.findFirst({ where: { targetId }, orderBy: { claimedAt: "asc" } });
    await tx.attackTarget.update({ where: { id: targetId }, data: { ownerPlanetId: next?.planetId ?? null, shared: next ? t.shared : false } });
  });
}

// ===== Comandos de chat da sala de Ataque (bot estilo mIRC) =====
// Interpreta "!comando ..." digitado na sala de ataque. Retorna true se consumiu
// como comando (não deve virar mensagem normal). O bot responde na própria sala.
export async function runAttackCommand(planetId: string, body: string): Promise<boolean> {
  const text = body.trim();
  if (!text.startsWith("!")) return false;
  const mem = await memberOf(planetId);
  if (!mem) return false; // sem aliança: não é comando válido (vira msg normal mesmo)
  const [cmd, ...rest] = text.slice(1).split(/\s+/);
  const arg = rest.join(" ").trim();
  const who = await nameOfPlanet(planetId);
  const coordRe = /^(\d+):(\d+):(\d+)$/;

  const findTarget = async (coord: string) => {
    const m = coord.match(coordRe); if (!m) return null;
    return prisma.attackTarget.findFirst({ where: { allianceId: mem.allianceId, galaxy: +m[1], system: +m[2], slot: +m[3] } });
  };

  switch (cmd.toLowerCase()) {
    case "pego": case "pegar": {
      const t = await findTarget(arg);
      if (!t) { await botAttackMessage(mem.allianceId, `❓ ${who}: alvo ${arg || "?"} não está no quadro.`); return true; }
      try { await claimTarget(planetId, t.id); } // claimTarget já narra o sucesso
      catch (e: any) { await botAttackMessage(mem.allianceId, `⛔ ${who}: ${e.message}`); }
      return true;
    }
    case "largo": case "largar": {
      const t = await findTarget(arg);
      if (t) { await unclaimTarget(planetId, t.id); await botAttackMessage(mem.allianceId, `↩️ ${who} largou ${arg}.`); }
      return true;
    }
    case "alvo": {
      // !alvo 4:2:3 [nota] — só comando (AC/TL/HC)
      const parts = arg.split(/\s+/); const coord = parts.shift() ?? "";
      try { await addAttackTarget(planetId, coord, parts.join(" ")); } // já narra
      catch (e: any) { await botAttackMessage(mem.allianceId, `⛔ ${who}: ${e.message}`); }
      return true;
    }
    case "libera": case "liberar": {
      try { await toggleAttackLock(planetId, false); } catch (e: any) { await botAttackMessage(mem.allianceId, `⛔ ${who}: ${e.message}`); }
      return true;
    }
    case "trava": case "travar": {
      try { await toggleAttackLock(planetId, true); } catch (e: any) { await botAttackMessage(mem.allianceId, `⛔ ${who}: ${e.message}`); }
      return true;
    }
    case "abre": case "mass": {
      const t = await findTarget(arg);
      if (t) { try { await setTargetShared(planetId, t.id, true); } catch (e: any) { await botAttackMessage(mem.allianceId, `⛔ ${who}: ${e.message}`); } }
      return true;
    }
    case "alvos": case "lista": {
      const board = await prisma.attackBoard.findUnique({ where: { allianceId: mem.allianceId } });
      const targets = await prisma.attackTarget.findMany({ where: { allianceId: mem.allianceId }, orderBy: { createdAt: "asc" }, include: { claims: true } });
      const claimerIds = [...new Set(targets.flatMap((t) => t.claims.map((c) => c.planetId)))];
      const planets = await prisma.planet.findMany({ where: { id: { in: claimerIds } }, select: { id: true, user: { select: { username: true } } } });
      const nm = new Map(planets.map((p) => [p.id, p.user.username]));
      const lines = targets.length === 0 ? ["(vazio)"] : targets.map((t) => {
        const c = `${t.galaxy}:${t.system}:${t.slot}`;
        const quem = t.claims.map((x) => nm.get(x.planetId) ?? "?").join(", ") || "livre";
        return `${c}${t.shared ? " [MASS]" : ""} → ${quem}`;
      });
      await botAttackMessage(mem.allianceId, `📋 Quadro (${board?.locked ?? true ? "🔒 travado" : "🔓 liberado"}):\n${lines.join("\n")}`);
      return true;
    }
    case "ajuda": case "help": {
      await botAttackMessage(mem.allianceId, "📖 Comandos: !pego <coord> · !largo <coord> · !alvos · !alvo <coord> [nota] (comando) · !libera / !trava (comando) · !abre <coord> (dono/comando)");
      return true;
    }
    default:
      await botAttackMessage(mem.allianceId, `❓ ${who}: comando "!${cmd}" não existe. Use !ajuda.`);
      return true;
  }
}

// ===== Intel da Tag (espionagens compartilhadas) =====
// Qualquer membro compartilha um relatório de espionagem seu com a aliança.
export async function shareIntel(planetId: string, spyHash: string) {
  const mem = await memberOf(planetId);
  if (!mem) throw new Error("Voce nao esta em uma alianca");
  const rep = await prisma.spyReport.findUnique({ where: { hash: spyHash.trim().toUpperCase() } });
  if (!rep) throw new Error("Relatório não encontrado (confira o código)");
  // Só compartilha relatório SEU (evita publicar intel de terceiros sem ser dono).
  if (rep.spyPlanetId !== planetId) throw new Error("Esse relatório não é seu");
  const planet = await prisma.planet.findUnique({ where: { id: planetId }, select: { user: { select: { username: true } } } });
  await prisma.allianceIntel.upsert({
    where: { allianceId_spyHash: { allianceId: mem.allianceId, spyHash: rep.hash } },
    update: { sharedBy: planet?.user.username ?? "?", tick: rep.tick },
    create: {
      allianceId: mem.allianceId, spyHash: rep.hash, targetCoords: rep.targetCoords,
      targetName: rep.targetName, agent: rep.agent, sharedBy: planet?.user.username ?? "?", tick: rep.tick,
    },
  });
}

// Lista as espionagens compartilhadas na tag (mais recentes primeiro).
export async function allianceIntelView(planetId: string) {
  const mem = await memberOf(planetId);
  if (!mem) throw new Error("Voce nao esta em uma alianca");
  const rows = await prisma.allianceIntel.findMany({ where: { allianceId: mem.allianceId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((r) => ({ id: r.id, spyHash: r.spyHash, targetCoords: r.targetCoords, targetName: r.targetName, agent: r.agent, sharedBy: r.sharedBy, tick: r.tick, at: r.createdAt }));
}

// Mapa coord -> hash do intel mais recente (pra anexar ao Quadro de Ataque).
export async function allianceIntelByCoord(allianceId: string): Promise<Record<string, string>> {
  const rows = await prisma.allianceIntel.findMany({ where: { allianceId }, orderBy: { createdAt: "desc" } });
  const out: Record<string, string> = {};
  for (const r of rows) if (!out[r.targetCoords]) out[r.targetCoords] = r.spyHash; // 1º = mais recente
  return out;
}

export async function unshareIntel(planetId: string, id: string) {
  const mem = await memberOf(planetId);
  if (!mem) throw new Error("Voce nao esta em uma alianca");
  // Remove só se for da sua aliança (qualquer membro pode limpar intel velho).
  await prisma.allianceIntel.deleteMany({ where: { id, allianceId: mem.allianceId } });
}

// TL/HC define o mural de ordens da aliança (recado visível a todos os membros).
export async function setOrders(planetId: string, text: string) {
  const mem = await memberOf(planetId);
  if (!mem || (mem.role !== "lider" && mem.role !== "alto_comando")) throw new Error("Apenas TL ou Alto Comando pode definir as ordens");
  const planet = await prisma.planet.findUnique({ where: { id: planetId }, select: { user: { select: { username: true } } } });
  await prisma.alliance.update({
    where: { id: mem.allianceId },
    data: { orders: text.trim().slice(0, 500) || null, ordersBy: planet?.user.username ?? null, ordersAt: new Date() },
  });
}

// Mapa planetId -> tag da alianca (para mostrar na galaxia).
export async function allianceTags(planetIds: string[]): Promise<Record<string, string>> {
  const mems = await prisma.allianceMember.findMany({ where: { planetId: { in: planetIds } }, include: { alliance: true } });
  const out: Record<string, string> = {};
  for (const m of mems) out[m.planetId] = m.alliance.tag;
  return out;
}

// Tags visíveis PRO VIEWER: só revela a tag dos planetas que são da MESMA aliança
// que a dele (a tag de terceiros é informação estratégica — fica oculta).
export async function allianceTagsForViewer(planetIds: string[], viewerPlanetId: string | null): Promise<Record<string, string>> {
  if (!viewerPlanetId) return {};
  const me = await prisma.allianceMember.findUnique({ where: { planetId: viewerPlanetId }, include: { alliance: true } });
  if (!me) return {}; // viewer sem aliança não vê tag de ninguém
  const mems = await prisma.allianceMember.findMany({ where: { planetId: { in: planetIds }, allianceId: me.allianceId } });
  const out: Record<string, string> = {};
  for (const m of mems) out[m.planetId] = me.alliance.tag;
  return out;
}

// Os dois planetas estão na MESMA aliança? (proteção: aliados não se atacam.)
export async function sameAlliance(planetA: string, planetB: string): Promise<boolean> {
  if (planetA === planetB) return false;
  const mems = await prisma.allianceMember.findMany({ where: { planetId: { in: [planetA, planetB] } }, select: { planetId: true, allianceId: true } });
  if (mems.length < 2) return false;
  return mems[0].allianceId === mems[1].allianceId;
}

// IDs dos OUTROS membros da aliança de um planeta (pra avisar sobre ataque a aliado).
export async function allianceMateIds(planetId: string): Promise<string[]> {
  const me = await prisma.allianceMember.findUnique({ where: { planetId } });
  if (!me) return [];
  const mates = await prisma.allianceMember.findMany({ where: { allianceId: me.allianceId, NOT: { planetId } }, select: { planetId: true } });
  return mates.map((m) => m.planetId);
}

// ===== Painel de movimentação da aliança (só DC e AC) =====
// Mostra: (1) frotas dos MEMBROS em movimento (defesas/ataques indo/voltando) e
// (2) ataques INIMIGOS a caminho de qualquer membro. Permite ao DC/AC organizar
// a defesa e aos ACs sincronizar waves — a informação fica restrita aos cargos.
export async function allianceFleetsView(planetId: string) {
  const me = await prisma.allianceMember.findUnique({ where: { planetId } });
  if (!me) throw new Error("Voce nao esta em uma alianca");
  if (!canSeeFleets(me.role)) throw new Error("Apenas DC e AC veem a movimentação da aliança");

  const members = await prisma.allianceMember.findMany({ where: { allianceId: me.allianceId }, select: { planetId: true } });
  const memberIds = members.map((m) => m.planetId);
  const planets = await prisma.planet.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true, galaxy: true, system: true, slot: true, user: { select: { username: true } } },
  });
  const pById = new Map(planets.map((p) => [p.id, p]));
  const coordOf = (p: any) => p ? `${p.galaxy}:${p.system}:${p.slot}` : "?";
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const STATUS: Record<string, string> = { outbound: "indo", engaged: "em combate", returning: "voltando", garrison: "defendendo", idle: "na base" };

  // (1) Frotas dos membros que estão fora da base.
  const mine = await prisma.fleet.findMany({ where: { ownerPlanetId: { in: memberIds }, status: { in: ["outbound", "engaged", "returning", "garrison"] } } });
  const memberFleets = mine.map((f) => {
    const owner = pById.get(f.ownerPlanetId);
    return {
      owner: owner?.user.username ?? "?", ownerCoords: coordOf(owner),
      name: f.name, mission: f.mission, status: STATUS[f.status] ?? f.status,
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      ships: totalUnits(parseUnits(f.units)),
      ticksLeft: f.status === "engaged" ? 0 : Math.max(0, f.arriveTick - tick),
    };
  }).sort((a, b) => a.ticksLeft - b.ticksLeft);

  // (2) Ataques INIMIGOS (de quem não é da aliança) a caminho de um membro.
  const memberCoords = new Set(planets.map((p) => `${p.galaxy}:${p.system}:${p.slot}`));
  const incoming = await prisma.fleet.findMany({
    where: {
      mission: "attack", status: { in: ["outbound", "engaged"] },
      ownerPlanetId: { notIn: memberIds },
      OR: planets.map((p) => ({ targetGalaxy: p.galaxy, targetSystem: p.system, targetSlot: p.slot })),
    },
  });
  // Frota falsa (fake) não aparece — é finta, ninguém sabe que é falsa.
  const enemyOwners = await prisma.planet.findMany({ where: { id: { in: [...new Set(incoming.map((f) => f.ownerPlanetId))] } }, select: { id: true, name: true, galaxy: true, system: true, slot: true } });
  const eById = new Map(enemyOwners.map((p) => [p.id, p]));
  const attacks = incoming.filter((f) => !f.fake && memberCoords.has(`${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`)).map((f) => {
    const atk = eById.get(f.ownerPlanetId);
    return {
      attacker: atk?.name ?? "?", attackerCoords: atk ? `${atk.galaxy}:${atk.system}:${atk.slot}` : "?",
      target: `${f.targetGalaxy}:${f.targetSystem}:${f.targetSlot}`,
      status: STATUS[f.status] ?? f.status,
      ticksLeft: f.status === "engaged" ? 0 : Math.max(0, f.arriveTick - tick),
    };
  }).sort((a, b) => a.ticksLeft - b.ticksLeft);

  return { role: me.role, memberFleets, attacks };
}
