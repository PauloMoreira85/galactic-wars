import { prisma } from "../db.js";

// Cliente compatível com o `prisma` global OU o `tx` de uma transação.
type NewsClient = { news: { create: (args: { data: { planetId: string; tick: number; message: string } }) => Promise<unknown> } };

// Registra uma notícia no log do planeta.
// IMPORTANTE: quando chamado DENTRO de uma transação interativa (prisma.$transaction),
// passe o `tx` como `client` — senão o `prisma` global tenta gravar numa OUTRA
// conexão e fica preso esperando o lock de escrita que a própria transação detém
// (trava até o busy_timeout: era o gargalo de "tudo demora 5-10s").
export async function addNews(planetId: string, tick: number, message: string, client: NewsClient = prisma) {
  try {
    await client.news.create({ data: { planetId, tick, message } });
  } catch {}
}

// Últimas notícias do planeta.
export async function recentNews(planetId: string, take = 60) {
  const rows = await prisma.news.findMany({ where: { planetId }, orderBy: { id: "desc" }, take });
  return rows.map((n) => ({ tick: n.tick, message: n.message }));
}
