import { prisma } from "../db.js";
import { addNews } from "./news.js";

// Envia uma mensagem privada para outro jogador (por username).
export async function sendPM(fromUserId: string, fromName: string, toUsername: string, subject: string, body: string, anonymous: boolean) {
  subject = subject.trim().slice(0, 80) || "(sem assunto)";
  body = body.trim();
  if (!body) throw new Error("Escreva uma mensagem");
  const target = await prisma.user.findUnique({ where: { username: toUsername }, include: { planet: true } });
  if (!target) throw new Error("Jogador nao encontrado");
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
