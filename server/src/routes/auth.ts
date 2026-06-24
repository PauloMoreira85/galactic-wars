import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { signToken } from "../auth.js";
import { STARTING, SLOTS_PER_SYSTEM } from "../game/constants.js";
import { RACE_KEYS, publicRaces } from "../game/races.js";

export const authRouter = Router();

// Lista publica de racas para a tela de registro.
authRouter.get("/races", (_req, res) => res.json({ races: publicRaces() }));

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string().min(6).max(100),
  planetName: z.string().min(1).max(30).optional(),
  preposition: z.enum(["de", "da", "do"]).optional(),
  race: z.enum(RACE_KEYS as [string, ...string[]]),
});

// Acha um slot livre no mapa. Distribui os jogadores entre galaxias (round-robin)
// para que jogadores proximos fiquem em galaxias DIFERENTES (e portanto possam
// guerrear entre si — mesma galaxia = aliados).
const GALAXIES = 9;
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
  const { email, username, password, planetName, preposition, race } = parsed.data;

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

  return res.json({ token: signToken(user.id), username: user.username });
});
