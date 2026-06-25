-- Frota: quantos ticks fica engajada no ataque (1-3, escolhido no envio).
ALTER TABLE "Fleet" ADD COLUMN "engageTicks" INTEGER NOT NULL DEFAULT 3;
