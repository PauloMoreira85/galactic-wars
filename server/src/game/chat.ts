import { prisma } from "../db.js";
import { galaxyId } from "./geo.js";

// Envia uma mensagem numa sala.
export async function sendChat(room: string, authorName: string, body: string) {
  body = body.trim().slice(0, 400);
  if (!body) throw new Error("Mensagem vazia");
  await prisma.chatMessage.create({ data: { room, authorName, body } });
  // Mantém cada sala com histórico amplo (~2000 últimas) pra quem ficou offline
  // conseguir rolar pra trás e acompanhar. Só poda quando passa bem disso.
  const total = await prisma.chatMessage.count({ where: { room } });
  if (total > 2200) {
    const old = await prisma.chatMessage.findMany({ where: { room }, orderBy: { createdAt: "desc" }, skip: 2000, select: { id: true } });
    if (old.length) await prisma.chatMessage.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}

export async function recentChat(room: string, take = 80) {
  const rows = await prisma.chatMessage.findMany({ where: { room }, orderBy: { createdAt: "desc" }, take });
  return rows.reverse().map((m) => ({ id: m.id, author: m.authorName, body: m.body, at: m.createdAt }));
}

// Mensagens ANTES de um id (pra rolar pra trás / carregar histórico).
export async function olderChat(room: string, beforeId: string, take = 80) {
  const anchor = await prisma.chatMessage.findUnique({ where: { id: beforeId }, select: { createdAt: true } });
  if (!anchor) return [];
  const rows = await prisma.chatMessage.findMany({
    where: { room, createdAt: { lt: anchor.createdAt } },
    orderBy: { createdAt: "desc" }, take,
  });
  return rows.reverse().map((m) => ({ id: m.id, author: m.authorName, body: m.body, at: m.createdAt }));
}

// Resolve a sala lógica (universo|galaxia|alianca) para a chave real do jogador.
// Retorna null se o jogador não tem acesso (ex: alianca sem aliança).
export async function resolveRoom(userId: string, logical: string): Promise<{ key: string; label: string } | null> {
  if (logical === "universo") return { key: "universo", label: "Universal" };
  const planet = await prisma.planet.findUnique({ where: { userId } });
  if (!planet) return null;
  if (logical === "galaxia") return { key: `gal-${galaxyId(planet.galaxy, planet.system)}`, label: `Galáxia ${planet.galaxy}:${planet.system}` };
  if (logical === "alianca") {
    const mem = await prisma.allianceMember.findUnique({ where: { planetId: planet.id }, include: { alliance: true } });
    if (!mem) return null;
    return { key: `ali-${mem.allianceId}`, label: mem.alliance.tag };
  }
  return null;
}
