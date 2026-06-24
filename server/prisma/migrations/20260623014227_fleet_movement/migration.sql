-- CreateTable
CREATE TABLE "Fleet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerPlanetId" TEXT NOT NULL,
    "mission" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'outbound',
    "originGalaxy" INTEGER NOT NULL,
    "originSystem" INTEGER NOT NULL,
    "originSlot" INTEGER NOT NULL,
    "targetGalaxy" INTEGER NOT NULL,
    "targetSystem" INTEGER NOT NULL,
    "targetSlot" INTEGER NOT NULL,
    "fCaca" INTEGER NOT NULL DEFAULT 0,
    "fCorveta" INTEGER NOT NULL DEFAULT 0,
    "fFragata" INTEGER NOT NULL DEFAULT 0,
    "fDestroyer" INTEGER NOT NULL DEFAULT 0,
    "fCruzador" INTEGER NOT NULL DEFAULT 0,
    "fNavemae" INTEGER NOT NULL DEFAULT 0,
    "departTick" INTEGER NOT NULL,
    "arriveTick" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Fleet_ownerPlanetId_fkey" FOREIGN KEY ("ownerPlanetId") REFERENCES "Planet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Fleet_arriveTick_idx" ON "Fleet"("arriveTick");

-- CreateIndex
CREATE INDEX "Fleet_ownerPlanetId_idx" ON "Fleet"("ownerPlanetId");

-- CreateIndex
CREATE INDEX "Fleet_targetGalaxy_targetSystem_targetSlot_idx" ON "Fleet"("targetGalaxy", "targetSystem", "targetSlot");
