-- CreateTable
CREATE TABLE "SabotageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saboteurPlanetId" TEXT NOT NULL,
    "targetGalaxy" INTEGER NOT NULL,
    "targetSystem" INTEGER NOT NULL,
    "targetSlot" INTEGER NOT NULL,
    "targetName" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "detail" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SabotageLog_saboteurPlanetId_idx" ON "SabotageLog"("saboteurPlanetId");

-- CreateIndex
CREATE INDEX "SabotageOrder_saboteurPlanetId_idx" ON "SabotageOrder"("saboteurPlanetId");
