import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { signToken } from "../auth.js";
import { sendMail } from "../email.js";
import { clientIp, recordIp } from "../game/ipguard.js";
import { STARTING, SLOTS_PER_SYSTEM, GALAXIES } from "../game/constants.js";
import { RACE_KEYS, publicRaces, type RaceKey } from "../game/races.js";
import { unitsOfRace, CLASS_LABEL } from "../game/catalog.js";

export const authRouter = Router();

// Lista publica de racas para a tela inicial/registro (com personagem + naves).
authRouter.get("/races", (_req, res) => {
  const races = publicRaces().map((r) => ({
    ...r,
    charImg: `/art/personagem/${r.key}.jpg`,
    ships: unitsOfRace(r.key as RaceKey).map((u) => ({ name: u.nome, classe: CLASS_LABEL[u.classe], roider: u.roider })),
  }));
  res.json({ races });
});

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string().min(6).max(100),
  planetName: z.string().min(1).max(30).optional(),
  preposition: z.enum(["de", "da", "do"]).optional(),
  race: z.enum(RACE_KEYS as [string, ...string[]]),
  whatsapp: z.string().max(30).optional(),
});

// Acha um slot livre no mapa. Distribui os jogadores entre galaxias (round-robin)
// para que jogadores proximos fiquem em galaxias DIFERENTES (e portanto possam
// guerrear entre si — mesma galaxia = aliados). GALAXIES vem de constants (=6).
async function allocateSlot() {
  // Coordenadas ja ocupadas (evita colisao com a constraint unica).
  const planets = await prisma.planet.findMany({ select: { galaxy: true, system: true, slot: true } });
  const taken = new Set(planets.map((p) => `${p.galaxy}:${p.system}:${p.slot}`));
  for (let i = 0; i < 1_000_000; i++) {
    const galaxy = (i % GALAXIES) + 1;
    const idx = Math.floor(i / GALAXIES); // posicao dentro da galaxia
    const system = Math.floor(idx / SLOTS_PER_SYSTEM) + 1;
    const slot = (idx % SLOTS_PER_SYSTEM) + 1;
    if (!taken.has(`${galaxy}:${system}:${slot}`)) return { galaxy, system, slot };
  }
  throw new Error("Sem slots livres no universo");
}

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos", details: parsed.error.flatten() });
  }
  const { email, username, password, planetName, preposition, race, whatsapp } = parsed.data;

  const exists = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (exists) {
    return res.status(409).json({ error: "Email ou nome de usuario ja em uso" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const coords = await allocateSlot();
    const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hash,
        race,
        whatsapp: whatsapp?.trim() || null,
        planet: {
          create: {
            name: planetName?.trim() || `Planeta de ${username}`,
            preposition: preposition ?? "de",
            ...coords,
            metalium: STARTING.metalium,
            carbonum: STARTING.carbonum,
            plutonium: STARTING.plutonium,
            roidMetalium: STARTING.roidMetalium,
            roidCarbonum: STARTING.roidCarbonum,
            roidPlutonium: STARTING.roidPlutonium,
            createdTick: tick,
            // Comeca com 2 pesquisas feitas -> 2 construcoes ja liberadas
            // Complexo de Mineracao + Central de Inteligencia. Pesquisas de Caca,
            // Sabotagem e Propulsao ficam disponiveis (sem pre-requisito).
            tech: JSON.stringify({ pesqMineracao: 1, pesq_centralInteligencia: 1 }),
          },
        },
      },
    });
    await recordIp(user.id, clientIp(req));
    return res.json({ token: signToken(user.id), username: user.username });
  } catch (e: any) {
    console.error("[register] falha:", e?.message ?? e);
    return res.status(500).json({ error: "Falha ao criar conta. Tente novamente." });
  }
});

const loginSchema = z.object({
  login: z.string(), // email ou username
  password: z.string(),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados invalidos" });
  }
  const { login, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { OR: [{ email: login }, { username: login }] },
  });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Credenciais invalidas" });
  }

  await recordIp(user.id, clientIp(req));
  return res.json({ token: signToken(user.id), username: user.username });
});

// ===== Recuperação de senha por e-mail =====
const APP_URL = process.env.APP_URL ?? "https://galacticwar.com.br";

// Pede o link de recuperação. Sempre responde ok (não revela se o e-mail existe).
authRouter.post("/forgot", async (req, res) => {
  const parsed = z.object({ login: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe e-mail ou usuário" });
  const { login } = parsed.data;
  const user = await prisma.user.findFirst({ where: { OR: [{ email: login }, { username: login }] } });
  if (user) {
    const token = randomBytes(24).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await prisma.user.update({ where: { id: user.id }, data: { resetToken: token, resetExpires: expires } });
    const link = `${APP_URL}/reset?token=${token}`;
    const html = `<p>Olá, Comandante <b>${user.username}</b>.</p>
      <p>Para redefinir sua senha no Galactic Wars, clique no link abaixo (válido por 1 hora):</p>
      <p><a href="${link}">${link}</a></p>
      <p>Se não foi você, ignore este e-mail.</p>`;
    const sent = await sendMail(user.email, "Galactic Wars — recuperação de senha", html);
    if (!sent) console.log(`[forgot] SMTP off — link de reset de ${user.username}: ${link}`);
  }
  res.json({ ok: true });
});

// Redefine a senha usando o token do e-mail.
authRouter.post("/reset", async (req, res) => {
  const parsed = z.object({ token: z.string().min(10), password: z.string().min(6).max(100) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Token ou senha inválidos (mín. 6 caracteres)" });
  const user = await prisma.user.findFirst({ where: { resetToken: parsed.data.token } });
  if (!user || !user.resetExpires || user.resetExpires.getTime() < Date.now()) {
    return res.status(400).json({ error: "Link inválido ou expirado. Peça outro." });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(parsed.data.password, 10), resetToken: null, resetExpires: null },
  });
  res.json({ ok: true });
});
