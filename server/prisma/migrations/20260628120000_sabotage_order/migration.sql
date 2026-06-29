-- Sabotagem com tempo de conclusão: fila de sabotagens lançadas (efeito em resolveTick).
CREATE TABLE "SabotageOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saboteurPlanetId" TEXT NOT NULL,
    "targetGalaxy" INTEGER NOT NULL,
    "targetSystem" INTEGER NOT NULL,
    "targetSlot" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "launchTick" INTEGER NOT NULL,
    "resolveTick" INTEGER NOT NULL
);
CREATE INDEX "SabotageOrder_resolveTick_idx" ON "SabotageOrder"("resolveTick");
