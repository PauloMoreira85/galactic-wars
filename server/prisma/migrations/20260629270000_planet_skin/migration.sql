-- Skin (aparência) do planeta no mapa, escolhida pelo jogador (neutra quanto à raça).
-- Default "terra" para todos os planetas existentes.
ALTER TABLE "Planet" ADD COLUMN "skin" TEXT NOT NULL DEFAULT 'terra';
