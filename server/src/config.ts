import "dotenv/config";

export const isProd = process.env.NODE_ENV === "production";

// Em produção o host (Render/Railway) injeta PORT. Em dev usamos API_PORT
// próprio para não colidir com ferramentas de preview que injetam PORT.
const port = Number((isProd ? process.env.PORT : undefined) ?? process.env.API_PORT ?? 3001);

const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-troque-em-producao";
if (isProd && jwtSecret === "dev-secret-troque-em-producao") {
  throw new Error("JWT_SECRET não definido em produção — defina uma variável de ambiente forte.");
}

export const config = {
  port,
  jwtSecret,
  tickIntervalSeconds: Number(process.env.TICK_INTERVAL_SECONDS ?? 3600),
  // Duração do round em ticks. Ao atingir, o round encerra (congela ações e
  // declara o campeão). Reinício é manual (script reset-round).
  roundTicks: Number(process.env.ROUND_TICKS ?? 1200),
  // Pasta do client buildado a servir em produção (sobrescrevível por env).
  clientDist: process.env.CLIENT_DIST ?? "",
};
