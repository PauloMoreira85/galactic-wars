-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Fleet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerPlanetId" TEXT NOT NULL,
    "mission" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'outbound',
    "battleStartTick" INTEGER,
    "battleTicksDone" INTEGER NOT NULL DEFAULT 0,
    "battleState" TEXT,
    "capMetalium" INTEGER NOT NULL DEFAULT 0,
    "capCarbonum" INTEGER NOT NULL DEFAULT 0,
    "capPlutonium" INTEGER NOT NULL DEFAULT 0,
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
    "fRoider1" INTEGER NOT NULL DEFAULT 0,
    "fRoider2" INTEGER NOT NULL DEFAULT 0,
    "departTick" INTEGER NOT NULL,
    "arriveTick" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Fleet_ownerPlanetId_fkey" FOREIGN KEY ("ownerPlanetId") REFERENCES "Planet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Fleet" ("arriveTick", "battleStartTick", "battleState", "battleTicksDone", "capCarbonum", "capMetalium", "capPlutonium", "createdAt", "departTick", "fCaca", "fCorveta", "fCruzador", "fDestroyer", "fFragata", "fNavemae", "id", "mission", "originGalaxy", "originSlot", "originSystem", "ownerPlanetId", "status", "targetGalaxy", "targetSlot", "targetSystem") SELECT "arriveTick", "battleStartTick", "battleState", "battleTicksDone", "capCarbonum", "capMetalium", "capPlutonium", "createdAt", "departTick", "fCaca", "fCorveta", "fCruzador", "fDestroyer", "fFragata", "fNavemae", "id", "mission", "originGalaxy", "originSlot", "originSystem", "ownerPlanetId", "status", "targetGalaxy", "targetSlot", "targetSystem" FROM "Fleet";
DROP TABLE "Fleet";
ALTER TABLE "new_Fleet" RENAME TO "Fleet";
CREATE INDEX "Fleet_arriveTick_idx" ON "Fleet"("arriveTick");
CREATE INDEX "Fleet_ownerPlanetId_idx" ON "Fleet"("ownerPlanetId");
CREATE INDEX "Fleet_targetGalaxy_targetSystem_targetSlot_idx" ON "Fleet"("targetGalaxy", "targetSystem", "targetSlot");
CREATE TABLE "new_Planet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "galaxy" INTEGER NOT NULL DEFAULT 1,
    "system" INTEGER NOT NULL DEFAULT 1,
    "slot" INTEGER NOT NULL DEFAULT 1,
    "metalium" INTEGER NOT NULL DEFAULT 0,
    "carbonum" INTEGER NOT NULL DEFAULT 0,
    "plutonium" INTEGER NOT NULL DEFAULT 0,
    "roidMetalium" INTEGER NOT NULL DEFAULT 0,
    "roidCarbonum" INTEGER NOT NULL DEFAULT 0,
    "roidPlutonium" INTEGER NOT NULL DEFAULT 0,
    "shipCaca" INTEGER NOT NULL DEFAULT 0,
    "shipCorveta" INTEGER NOT NULL DEFAULT 0,
    "shipFragata" INTEGER NOT NULL DEFAULT 0,
    "shipDestroyer" INTEGER NOT NULL DEFAULT 0,
    "shipCruzador" INTEGER NOT NULL DEFAULT 0,
    "shipNavemae" INTEGER NOT NULL DEFAULT 0,
    "roider1" INTEGER NOT NULL DEFAULT 0,
    "roider2" INTEGER NOT NULL DEFAULT 0,
    "researchTier" INTEGER NOT NULL DEFAULT 0,
    "tech" TEXT NOT NULL DEFAULT '{}',
    "prodMul" INTEGER NOT NULL DEFAULT 100,
    "travelMul" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Planet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Planet" ("carbonum", "createdAt", "galaxy", "id", "metalium", "name", "plutonium", "prodMul", "researchTier", "roidCarbonum", "roidMetalium", "roidPlutonium", "shipCaca", "shipCorveta", "shipCruzador", "shipDestroyer", "shipFragata", "shipNavemae", "slot", "system", "tech", "travelMul", "userId") SELECT "carbonum", "createdAt", "galaxy", "id", "metalium", "name", "plutonium", "prodMul", "researchTier", "roidCarbonum", "roidMetalium", "roidPlutonium", "shipCaca", "shipCorveta", "shipCruzador", "shipDestroyer", "shipFragata", "shipNavemae", "slot", "system", "tech", "travelMul", "userId" FROM "Planet";
DROP TABLE "Planet";
ALTER TABLE "new_Planet" RENAME TO "Planet";
CREATE UNIQUE INDEX "Planet_userId_key" ON "Planet"("userId");
CREATE UNIQUE INDEX "Planet_galaxy_system_slot_key" ON "Planet"("galaxy", "system", "slot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
