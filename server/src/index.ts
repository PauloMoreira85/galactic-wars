import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, isProd } from "./config.js";
import { prisma } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { gameRouter } from "./routes/game.js";
import { startTickEngine } from "./game/tick.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/game", gameRouter);

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
  // SQLite: WAL melhora muito a concorrência de escrita do motor de tick.
  try {
    // PRAGMA retorna linha → usar queryRawUnsafe (executeRawUnsafe rejeita resultados no SQLite).
    await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
  } catch (e) {
    console.warn("[db] não foi possível ativar WAL:", e);
  }

  app.listen(config.port, () => {
    console.log(`[server] API em http://localhost:${config.port}`);
    startTickEngine().catch((e) => console.error("[tick] falha ao iniciar:", e));
  });
}

boot();
