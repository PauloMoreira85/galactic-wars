import "dotenv/config";

export const isProd = process.env.NODE_ENV === "production";

// Em produção o host (Render/Railway) injeta PORT. Em dev usamos API_PORT
// próprio para não colidir com ferramentas de preview que injetam PORT.
const port = Number((isProd ? process.env.PORT : undefined) ?? process.env.API_PORT ?? 3001);

const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-troque-em-producao";
if (isProd && jwtSecret === "dev-secret-troque-em-producao") {
  throw new Error("JWT_SECRET não definido em produção — defina uma variável de ambiente forte.");
}

// ===== Agenda do ciclo (horários de início) =====
const roundStartHour = Number(process.env.ROUND_START_HOUR ?? 8);
const roundStartMinute = Number(process.env.ROUND_START_MINUTE ?? 0);
const roundResetHour = Number(process.env.ROUND_RESET_HOUR ?? 7);
const roundResetMinute = Number(process.env.ROUND_RESET_MINUTE ?? 30);

// Horários de início (minutos após a meia-noite, Brasília), ordenados e únicos.
// ROUND_START_TIMES="12:00,18:00,22:00" → 3 rounds/dia (ex.: RUR). Sem ela, cai
// no horário único ROUND_START_HOUR:ROUND_START_MINUTE (jogo principal: 08:00).
function parseStartTimes(): number[] {
  const raw = process.env.ROUND_START_TIMES;
  if (raw && raw.trim()) {
    const mins = raw.split(",").map((s) => {
      const [h, m] = s.trim().split(":").map((x) => Number(x));
      return (h || 0) * 60 + (m || 0);
    }).filter((n) => Number.isFinite(n) && n >= 0 && n < 1440);
    if (mins.length) return [...new Set(mins)].sort((a, b) => a - b);
  }
  return [roundStartHour * 60 + roundStartMinute];
}
// Lead do reset = minutos antes de cada início em que se zera (soft) o round.
// Default = diferença START−RESET do modo single (08:00−07:30 = 30 min).
const singleLead = (roundStartHour * 60 + roundStartMinute) - (roundResetHour * 60 + roundResetMinute);

export const config = {
  port,
  jwtSecret,
  // 60s/tick: 20h de round (08:00→04:00) = 1200 ticks. RUR usa 5s.
  tickIntervalSeconds: Number(process.env.TICK_INTERVAL_SECONDS ?? 60),
  // Duração do round em ticks. Ao atingir, o round congela até o próximo reset.
  roundTicks: Number(process.env.ROUND_TICKS ?? 1200),
  // ===== Ciclo automático =====
  // O round começa em cada horário de roundStartTimes, roda roundTicks ticks,
  // congela mostrando o resultado e, roundResetLeadMinutes antes do próximo
  // início, zera (soft). Horários no fuso de Brasília (UTC-3). DAILY_SCHEDULE=false
  // volta ao modo livre (ticks pelo relógio, reset manual) — útil em dev.
  dailySchedule: (process.env.DAILY_SCHEDULE ?? "true") !== "false",
  roundStartTimes: parseStartTimes(),
  roundResetLeadMinutes: Number(process.env.RESET_LEAD_MINUTES ?? (singleLead > 0 ? singleLead : 30)),
  roundTzOffsetHours: Number(process.env.ROUND_TZ_OFFSET_HOURS ?? -3),
  // Pasta do client buildado a servir em produção (sobrescrevível por env).
  clientDist: process.env.CLIENT_DIST ?? "",
  // Usuários admin (gerenciam anunciantes etc.) — nomes de líder, case-insensitive.
  // Padrão "JaH" (dono do jogo); dá pra sobrescrever/somar com ADMIN_USERS="nome1,nome2".
  adminUsers: (process.env.ADMIN_USERS ?? "JaH")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
};
