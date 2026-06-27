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
  // 60s/tick: 20h de round (08:00→04:00) = 1200 ticks.
  tickIntervalSeconds: Number(process.env.TICK_INTERVAL_SECONDS ?? 60),
  // Duração do round em ticks. Ao atingir, o round congela até o reset diário.
  roundTicks: Number(process.env.ROUND_TICKS ?? 1200),
  // ===== Ciclo diário automático =====
  // Round começa todo dia às START (08:00), roda roundTicks ticks (→ 04:00),
  // congela mostrando o resultado e às RESET (07:30) zera (soft) pro próximo.
  // Horários no fuso de Brasília (UTC-3). DAILY_SCHEDULE=false volta ao modo
  // antigo (ticks livres pelo relógio, reset manual) — útil em dev.
  dailySchedule: (process.env.DAILY_SCHEDULE ?? "true") !== "false",
  roundStartHour: Number(process.env.ROUND_START_HOUR ?? 8),
  roundStartMinute: Number(process.env.ROUND_START_MINUTE ?? 0),
  roundResetHour: Number(process.env.ROUND_RESET_HOUR ?? 7),
  roundResetMinute: Number(process.env.ROUND_RESET_MINUTE ?? 30),
  roundTzOffsetHours: Number(process.env.ROUND_TZ_OFFSET_HOURS ?? -3),
  // Pasta do client buildado a servir em produção (sobrescrevível por env).
  clientDist: process.env.CLIENT_DIST ?? "",
};
