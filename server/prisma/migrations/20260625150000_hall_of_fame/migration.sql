-- Hall da Fama: top-3 de cada round encerrado.
CREATE TABLE "HallOfFame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "commander" TEXT NOT NULL,
    "planet" TEXT NOT NULL,
    "coords" TEXT NOT NULL,
    "race" TEXT,
    "roids" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "endedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HallOfFame_round_idx" ON "HallOfFame"("round");
