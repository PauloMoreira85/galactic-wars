import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { signToken } from "../auth.js";
import { sendMail } from "../email.js";
import { clientIp, recordIp } from "../game/ipguard.js";
import { STARTING, SLOTS_PER_SYSTEM, GALAXIES } from "../game/constants.js";
import { galaxyId, galaxyDecompose, NUM_SETORES } from "../game/geo.js";
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

// Hall da Fama (público — aparece na landing page).
authRouter.get("/hall", async (_req, res) => {
  const rows = await prisma.hallOfFame.findMany({ orderBy: [{ round: "desc" }, { position: "asc" }] });
  const byRound = new Map<number, any>();
  for (const r of rows) {
    if (!byRound.has(r.round)) byRound.set(r.round, { round: r.round, endedAt: r.endedAt, top: [] });
    byRound.get(r.round).top.push({
      position: r.position, commander: r.commander, planet: r.planet,
      coords: r.coords, race: r.race, roids: r.roids, score: r.score,
    });
  }
  res.json({ rounds: [...byRound.values()] });
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

// Acha um slot livre no mapa. ESTRATÉGIA EQUILIBRADA: abre só o número de galáxias
// necessário (~total/SLOTS, mínimo 2 pra sempre haver inimigo) e coloca o novato
// na galáxia mais VAZIA entre as abertas. Assim as galáxias enchem juntas (evita
// dezenas de galáxias com 1-2 planetas) sem deixar todo mundo aliado no começo.
export async function allocateSlot() {
  const planets = await prisma.planet.findMany({
    where: { galaxy: { lte: NUM_SETORES } }, // só públicas (privadas usam setor 6-10)
    select: { galaxy: true, system: true, slot: true },
  });
  // Quantos planetas em cada galáxia (id 1..GALAXIES).
  const count = new Array(GALAXIES + 1).fill(0);
  const taken = new Set<string>();
  for (const p of planets) {
    taken.add(`${p.galaxy}:${p.system}:${p.slot}`);
    const id = galaxyId(p.galaxy, p.system);
    if (id >= 1 && id <= GALAXIES) count[id]++;
  }
  const total = planets.length;
  const open = Math.min(GALAXIES, Math.max(2, Math.ceil((total + 1) / SLOTS_PER_SYSTEM)));

  // Procura a galáxia mais vazia com vaga. 1ª passada nas `open`; se todas cheias,
  // libera as demais até GALAXIES.
  for (const limit of [open, GALAXIES]) {
    let best = -1;
    for (let id = 1; id <= limit; id++) {
      if (count[id] >= SLOTS_PER_SYSTEM) continue;
      if (best === -1 || count[id] < count[best]) best = id;
    }
    if (best === -1) continue;
    const { setor, paralelo } = galaxyDecompose(best);
    for (let slot = 1; slot <= SLOTS_PER_SYSTEM; slot++) {
      if (!taken.has(`${setor}:${paralelo}:${slot}`)) return { galaxy: setor, system: paralelo, slot };
    }
  }
  throw new Error("Universo cheio (todas as galáxias lotadas)");
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
    const gs = await prisma.gameState.findUnique({ where: { id: 1 } });
    const tick = gs?.tickNumber ?? 0;

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hash,
        race,
        // Já escolheu a raça do round atual no registro — não cai na tela obrigatória.
        raceRound: gs?.roundStartAt ?? null,
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
            // Sem tech inicial: Centro de Mineração e Central de Inteligência são
            // construções LIVRES (1ª de cada trilha, sem pesquisa). Naves,
            // Deslocamento e Sabotagem começam na pesquisa (sem pré-requisito).
            tech: JSON.stringify({}),
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
