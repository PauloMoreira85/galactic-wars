import { prisma } from "../db.js";
import { addNews } from "./news.js";
import { isLinked, MULTI_BLOCK_MSG } from "./ipguard.js";

// Envia uma mensagem privada. `to` pode ser uma COORDENADA "g:s:slot" (forma
// principal) ou um username (usado ao responder uma mensagem recebida).
export async function sendPM(fromUserId: string, fromName: string, to: string, subject: string, body: string, anonymous: boolean) {
  subject = subject.trim().slice(0, 80) || "(sem assunto)";
  body = body.trim();
  if (!body) throw new Error("Escreva uma mensagem");

  let target: { id: string; planet: { id: string } | null } | null = null;
  const coord = to.trim().match(/^(\d+):(\d+):(\d+)$/);
  if (coord) {
    const planet = await prisma.planet.findUnique({
      where: { galaxy_system_slot: { galaxy: +coord[1], system: +coord[2], slot: +coord[3] } },
      include: { user: { select: { id: true } } },
    });
    if (!planet) throw new Error(`Coordenada ${to.trim()} vazia — não há planeta nesse slot`);
    target = { id: planet.user.id, planet: { id: planet.id } };
  } else {
    target = await prisma.user.findUnique({ where: { username: to.trim() }, include: { planet: { select: { id: true } } } });
    if (!target) throw new Error("Jogador nao encontrado (use a coordenada g:s:slot)");
  }
  if (target.id === fromUserId) throw new Error("Você não pode mandar mensagem pra si mesmo");
  // Anti multi-conta: não pode mandar PM pra conta do mesmo IP.
  if (await isLinked(fromUserId, target.id)) throw new Error(MULTI_BLOCK_MSG);
  await prisma.privateMessage.create({ data: { fromUserId, fromName, toUserId: target.id, subject, body, anonymous } });
  if (target.planet) {
    const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
    await addNews(target.planet.id, tick, `📩 Nova mensagem privada de ${anonymous ? "Anônimo" : fromName}`);
  }
}

export async function inbox(userId: string) {
  const rows = await prisma.privateMessage.findMany({ where: { toUserId: userId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((m) => ({ id: m.id, from: m.anonymous ? "Anônimo" : m.fromName, subject: m.subject, body: m.body, read: m.read, at: m.createdAt }));
}

export async function sentbox(userId: string) {
  const rows = await prisma.privateMessage.findMany({ where: { fromUserId: userId }, orderBy: { createdAt: "desc" }, take: 100 });
  // Resolve nome do destinatário.
  const ids = [...new Set(rows.map((r) => r.toUserId))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
  const byId = new Map(users.map((u) => [u.id, u.username]));
  return rows.map((m) => ({ id: m.id, to: byId.get(m.toUserId) ?? "?", subject: m.subject, body: m.body, anonymous: m.anonymous, at: m.createdAt }));
}

export async function markRead(userId: string, id: string) {
  await prisma.privateMessage.updateMany({ where: { id, toUserId: userId }, data: { read: true } });
}

export async function unreadCount(userId: string) {
  return prisma.privateMessage.count({ where: { toUserId: userId, read: false } });
}
