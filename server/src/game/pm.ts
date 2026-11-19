import { prisma } from "../db.js";
import { addNews } from "./news.js";
import { isLinked, MULTI_BLOCK_MSG } from "./ipguard.js";
import { pushToUser } from "./push.js";

// Envia uma mensagem privada. `to` pode ser uma COORDENADA "g:s:slot" (forma
// principal) ou um username (usado ao responder uma mensagem recebida).
export async function sendPM(fromUserId: string, fromName: string, to: string, subject: string, body: string, anonymous: boolean) {
  subject = subject.trim().slice(0, 80) || "(sem assunto)";
  body = body.trim();
  if (!body) throw new Error("Escreva uma mensagem");

  let target: { id: string; planet: { id: string } | null } | null = null;
  const t = to.trim();
  const coord = t.match(/^(\d+):(\d+):(\d+)$/);
  if (t.startsWith("uid:")) {
    // Resposta direta numa conversa (userId do interlocutor).
    target = await prisma.user.findUnique({ where: { id: t.slice(4) }, include: { planet: { select: { id: true } } } });
    if (!target) throw new Error("Jogador nao encontrado");
  } else if (coord) {
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
  // Push: avisa o destinatário da mensagem (best-effort).
  pushToUser(target.id, { title: "📩 Nova mensagem", body: `Você recebeu uma mensagem de ${anonymous ? "Anônimo" : fromName}`, tag: "pm", url: "/" }).catch(() => {});
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

// ===== Modo CHAT (conversas por jogador) =====
// Lista de conversas: para cada OUTRO jogador com quem troquei mensagens, a última
// mensagem, horário e quantas não lidas. Ordenado pela mais recente.
export async function conversations(userId: string) {
  const rows = await prisma.privateMessage.findMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    orderBy: { createdAt: "desc" }, take: 500,
  });
  // Nome/coord dos interlocutores.
  const otherIds = [...new Set(rows.map((m) => (m.fromUserId === userId ? m.toUserId : m.fromUserId)))];
  const planets = await prisma.planet.findMany({ where: { userId: { in: otherIds } }, select: { userId: true, name: true, galaxy: true, system: true, slot: true, user: { select: { username: true } } } });
  const info = new Map(planets.map((p) => [p.userId, { name: p.user.username, planet: p.name, coords: `${p.galaxy}:${p.system}:${p.slot}` }]));

  const byOther = new Map<string, { otherId: string; name: string; coords: string | null; last: string; lastAt: Date; unread: number; lastMine: boolean }>();
  for (const m of rows) {
    const other = m.fromUserId === userId ? m.toUserId : m.fromUserId;
    // Mensagem anônima recebida: mostra "Anônimo" (não revela quem é na lista).
    const anonIn = m.anonymous && m.toUserId === userId;
    const disp = info.get(other);
    if (!byOther.has(other)) {
      byOther.set(other, {
        otherId: other,
        name: anonIn ? "Anônimo" : (disp?.name ?? "?"),
        coords: anonIn ? null : (disp?.coords ?? null),
        last: m.body, lastAt: m.createdAt, unread: 0, lastMine: m.fromUserId === userId,
      });
    }
    if (m.toUserId === userId && !m.read) byOther.get(other)!.unread++;
  }
  return [...byOther.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

// Mensagens de UMA conversa (cronológica) + marca as recebidas como lidas.
export async function conversation(userId: string, otherId: string) {
  const rows = await prisma.privateMessage.findMany({
    where: {
      OR: [
        { fromUserId: userId, toUserId: otherId },
        { fromUserId: otherId, toUserId: userId },
      ],
    },
    orderBy: { createdAt: "asc" }, take: 500,
  });
  // Marca como lidas as recebidas desta conversa.
  await prisma.privateMessage.updateMany({ where: { fromUserId: otherId, toUserId: userId, read: false }, data: { read: true } });
  return rows.map((m) => ({
    id: m.id,
    mine: m.fromUserId === userId,
    // Recebida anônima aparece como "Anônimo"; enviada por mim mostra normal.
    fromName: (m.anonymous && m.toUserId === userId) ? "Anônimo" : m.fromName,
    subject: m.subject,
    body: m.body,
    at: m.createdAt,
  }));
}
