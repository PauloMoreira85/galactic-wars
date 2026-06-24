import { prisma } from "../db.js";

export interface ForumDef { key: string; cat: string; name: string; desc: string }

export const FORUMS: ForumDef[] = [
  { cat: "Galactic Wars", key: "comunicados", name: "Comunicados", desc: "Comunicados oficiais da equipe." },
  { cat: "Galactic Wars", key: "geral", name: "Geral", desc: "Assuntos gerais relacionados ao Galactic Wars." },
  { cat: "Galactic Wars", key: "aliancas", name: "Alianças", desc: "Discussões sobre alianças, recrutamentos..." },
  { cat: "Galactic Wars", key: "suporte", name: "Suporte", desc: "Dúvidas, bugs e ajuda em geral sobre o jogo." },
  { cat: "Galactic Wars", key: "estrategia", name: "Estratégia", desc: "Dicas e estratégias sobre o jogo." },
  { cat: "Galactic Wars", key: "sugestoes", name: "Sugestões", desc: "Sugestões, idéias e temáticas. Evite repetidas." },
  { cat: "Lixo Espacial", key: "lixao", name: "Lixão Geral", desc: "Conversas fora do jogo, besteiras, piadas, etc." },
  { cat: "Lixo Espacial", key: "videos", name: "Vídeos", desc: "Vídeos do YouTube ou outro site." },
  { cat: "Lixo Espacial", key: "rpg", name: "RPG", desc: "Histórias, contos e ambientações no universo GW." },
  { cat: "Lixo Espacial", key: "eventos", name: "Eventos e Apresentações", desc: "Encontros, apresentações e despedidas." },
];
const FORUM_KEYS = new Set(FORUMS.map((f) => f.key));
// Fóruns válidos: os universais + o fórum de cada galáxia (gal-<n>).
export function isForum(key: string) { return FORUM_KEYS.has(key) || /^gal-\d+$/.test(key); }

// Índice: cada fórum com nº de tópicos, mensagens e última mensagem.
export async function forumIndex() {
  const topics = await prisma.forumTopic.findMany({ select: { id: true, forum: true } });
  const counts: Record<string, { topics: number }> = {};
  const topicForum: Record<string, string> = {};
  for (const t of topics) {
    counts[t.forum] = counts[t.forum] || { topics: 0 };
    counts[t.forum].topics++;
    topicForum[t.id] = t.forum;
  }
  const posts = await prisma.forumPost.findMany({ select: { topicId: true, authorName: true, createdAt: true } });
  const msgs: Record<string, number> = {};
  const last: Record<string, { authorName: string; at: Date }> = {};
  for (const p of posts) {
    const f = topicForum[p.topicId];
    if (!f) continue;
    msgs[f] = (msgs[f] || 0) + 1;
    if (!last[f] || p.createdAt > last[f].at) last[f] = { authorName: p.authorName, at: p.createdAt };
  }
  return FORUMS.map((f) => ({
    ...f,
    topics: counts[f.key]?.topics ?? 0,
    messages: msgs[f.key] ?? 0,
    last: last[f.key] ? { authorName: last[f.key].authorName, at: last[f.key].at } : null,
  }));
}

export async function listTopics(forumKey: string) {
  const topics = await prisma.forumTopic.findMany({ where: { forum: forumKey }, orderBy: { bumpedAt: "desc" }, take: 100 });
  const counts = await prisma.forumPost.groupBy({ by: ["topicId"], where: { topicId: { in: topics.map((t) => t.id) } }, _count: true });
  const cmap: Record<string, number> = {};
  for (const c of counts) cmap[c.topicId] = c._count;
  return topics.map((t) => ({
    id: t.id, title: t.title, author: t.authorName, createdAt: t.createdAt, bumpedAt: t.bumpedAt,
    replies: Math.max(0, (cmap[t.id] ?? 1) - 1),
  }));
}

export async function createTopic(userId: string, authorName: string, forumKey: string, title: string, body: string) {
  if (!isForum(forumKey)) throw new Error("Fórum inválido");
  title = title.trim(); body = body.trim();
  if (title.length < 2) throw new Error("Título muito curto");
  if (body.length < 1) throw new Error("Escreva uma mensagem");
  const topic = await prisma.forumTopic.create({ data: { forum: forumKey, title, authorId: userId, authorName } });
  await prisma.forumPost.create({ data: { topicId: topic.id, authorId: userId, authorName, body } });
  return topic.id;
}

export async function getTopic(id: string) {
  const topic = await prisma.forumTopic.findUnique({ where: { id } });
  if (!topic) return null;
  const posts = await prisma.forumPost.findMany({ where: { topicId: id }, orderBy: { createdAt: "asc" } });
  return {
    id: topic.id, forum: topic.forum, title: topic.title,
    posts: posts.map((p) => ({ author: p.authorName, body: p.body, at: p.createdAt })),
  };
}

export async function reply(userId: string, authorName: string, topicId: string, body: string) {
  body = body.trim();
  if (body.length < 1) throw new Error("Escreva uma mensagem");
  const topic = await prisma.forumTopic.findUnique({ where: { id: topicId } });
  if (!topic) throw new Error("Tópico não encontrado");
  await prisma.forumPost.create({ data: { topicId, authorId: userId, authorName, body } });
  await prisma.forumTopic.update({ where: { id: topicId }, data: { bumpedAt: new Date() } });
}
