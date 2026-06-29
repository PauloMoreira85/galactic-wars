import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, isProd } from "./config.js";
import { prisma } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { gameRouter } from "./routes/game.js";
import { adsRouter } from "./routes/ads.js";
import { startTickEngine } from "./game/tick.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
// Atrás do Caddy: confia no proxy para que req.ip = IP real do cliente
// (via X-Forwarded-For). Necessário para a proteção anti multi-conta.
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "256kb" }));

// Diagnóstico: loga requisições lentas (> limiar) pra achar gargalos no servidor.
const SLOW_REQ_MS = Number(process.env.SLOW_REQ_MS ?? 800);
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - t0;
    if (ms >= SLOW_REQ_MS) console.log(`[slow] ${req.method} ${req.originalUrl} ${ms}ms -> ${res.statusCode}`);
  });
  next();
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Metadados públicos da instância (usado pela landing pra explicar a dinâmica:
// RUR = tick de 5s, 3 rounds/dia, etc). Reflete a config real (env).
app.get("/api/meta", (_req, res) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  res.json({
    tickIntervalSeconds: config.tickIntervalSeconds,
    roundTicks: config.roundTicks,
    roundDurationMinutes: Math.round((config.roundTicks * config.tickIntervalSeconds) / 60),
    startTimes: config.roundStartTimes.map((m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/game", gameRouter);
app.use("/api/ads", adsRouter);

// Em produção, o mesmo processo serve o client buildado (client/dist).
// server/dist/index.js -> ../../client/dist
if (isProd) {
  const clientDist = config.clientDist || path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  // SPA fallback: GET de ROTAS devolve index.html — mas NUNCA para arquivos
  // (assets com extensão) nem para /art. Assim imagem ausente dá 404 de verdade
  // (e o onError do cliente dispara o fallback de extensão / placeholder).
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    if (req.path.startsWith("/art/") || path.extname(req.path)) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
  console.log(`[server] servindo client de ${clientDist}`);
}

// Rede de seguranca: nao deixa um erro async solto derrubar o servidor.
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

async function boot() {
  // SQLite tuning. O gargalo era o fsync por commit (synchronous=FULL) no disco
  // do droplet: cada escrita do tick/ação custava ~centenas de ms. Com WAL +
  // synchronous=NORMAL o fsync vira só no checkpoint -> escritas ~10-100x mais
  // rápidas (sem risco de corrupção; no máximo perde os últimos segundos num
  // corte de energia). connection_limit=1 (na DATABASE_URL) garante que estes
  // PRAGMAs por-conexão valham pra TODAS as queries.
  try {
    // PRAGMA retorna linha → usar queryRawUnsafe (executeRawUnsafe rejeita resultados no SQLite).
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=10000;");
    await prisma.$queryRawUnsafe("PRAGMA wal_autocheckpoint=1000;");
    await prisma.$queryRawUnsafe("PRAGMA cache_size=-16000;"); // ~16 MB de cache
    console.log("[db] SQLite: WAL + synchronous=NORMAL ativos");
  } catch (e) {
    console.warn("[db] não foi possível aplicar PRAGMAs:", e);
  }

  app.listen(config.port, () => {
    console.log(`[server] API em http://localhost:${config.port}`);
    startTickEngine().catch((e) => console.error("[tick] falha ao iniciar:", e));
  });
}

boot();
