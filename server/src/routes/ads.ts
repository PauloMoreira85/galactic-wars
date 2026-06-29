import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireAdmin } from "../auth.js";

export const adsRouter = Router();

const MAX_IMG = 200_000; // ~200KB (data URL base64) — banner

// Imagem: data URL de imagem OU URL http(s). Link: http(s).
const isImage = (s: string) => /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(s) || /^https?:\/\//.test(s);
const isLink = (s: string) => /^https?:\/\//.test(s);

export const PLACEMENTS = ["landing", "cadastro", "game", "round", "todas"] as const;

const adSchema = z.object({
  title: z.string().min(1).max(80),
  imageUrl: z.string().min(1).max(MAX_IMG).refine(isImage, "Imagem inválida (use upload ou URL http)"),
  linkUrl: z.string().min(1).max(2000).refine(isLink, "Link deve começar com http(s)://"),
  caption: z.string().max(200).optional().nullable(),
  placement: z.enum(PLACEMENTS).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

// ===== Admin (gerência) — vem ANTES das rotas públicas com :id =====
adsRouter.get("/admin/all", requireAuth, requireAdmin, async (_req, res) => {
  const ads = await prisma.advertiser.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  res.json({ ads });
});

adsRouter.post("/admin", requireAuth, requireAdmin, async (req, res) => {
  const p = adSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos" });
  const ad = await prisma.advertiser.create({ data: { ...p.data, caption: p.data.caption || null } });
  res.json({ ad });
});

adsRouter.put("/admin/:id", requireAuth, requireAdmin, async (req, res) => {
  const p = adSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Dados inválidos" });
  const data: any = { ...p.data };
  if ("caption" in data) data.caption = data.caption || null;
  const ad = await prisma.advertiser.update({ where: { id: req.params.id }, data }).catch(() => null);
  if (!ad) return res.status(404).json({ error: "Anúncio não encontrado" });
  res.json({ ad });
});

adsRouter.delete("/admin/:id", requireAuth, requireAdmin, async (req, res) => {
  await prisma.advertiser.delete({ where: { id: req.params.id } }).catch(() => {});
  res.json({ ok: true });
});

// ===== Público =====
// Anúncios ativos para exibir. ?placement=landing|cadastro|game|round filtra pelo
// local (incluindo os marcados como "todas"). Sem o parâmetro, devolve todos ativos.
adsRouter.get("/", async (req, res) => {
  const where: any = { active: true };
  const pl = String(req.query.placement || "");
  if ((PLACEMENTS as readonly string[]).includes(pl)) where.OR = [{ placement: pl }, { placement: "todas" }];
  const ads = await prisma.advertiser.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, title: true, imageUrl: true, linkUrl: true, caption: true },
  });
  res.json({ ads });
});

// Registra um clique (best-effort, sem auth).
adsRouter.post("/:id/click", async (req, res) => {
  await prisma.advertiser.update({ where: { id: req.params.id }, data: { clicks: { increment: 1 } } }).catch(() => {});
  res.json({ ok: true });
});
