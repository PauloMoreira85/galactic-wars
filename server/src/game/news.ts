import { prisma } from "../db.js";

// Registra uma notícia no log do planeta.
export async function addNews(planetId: string, tick: number, message: string) {
  try {
    await prisma.news.create({ data: { planetId, tick, message } });
  } catch {}
}

// Últimas notícias do planeta.
export async function recentNews(planetId: string, take = 60) {
  const rows = await prisma.news.findMany({ where: { planetId }, orderBy: { id: "desc" }, take });
  return rows.map((n) => ({ tick: n.tick, message: n.message }));
}
