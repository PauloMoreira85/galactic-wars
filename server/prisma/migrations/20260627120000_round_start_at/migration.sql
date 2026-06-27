-- Ciclo diário: guarda o início (08:00) do round atual para o motor derivar o tick.
ALTER TABLE "GameState" ADD COLUMN "roundStartAt" DATETIME;
