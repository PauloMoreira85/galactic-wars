-- CreateTable
CREATE TABLE "BattleReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tick" INTEGER NOT NULL,
    "attackerPlanetId" TEXT NOT NULL,
    "defenderPlanetId" TEXT NOT NULL,
    "attackerName" TEXT NOT NULL,
    "defenderName" TEXT NOT NULL,
    "attackerCoords" TEXT NOT NULL,
    "defenderCoords" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "capturedMetalium" INTEGER NOT NULL DEFAULT 0,
    "capturedCarbonum" INTEGER NOT NULL DEFAULT 0,
    "capturedPlutonium" INTEGER NOT NULL DEFAULT 0,
    "report" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "BattleReport_attackerPlanetId_idx" ON "BattleReport"("attackerPlanetId");

-- CreateIndex
CREATE INDEX "BattleReport_defenderPlanetId_idx" ON "BattleReport"("defenderPlanetId");
