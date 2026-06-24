-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Fleet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerPlanetId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Frota',
    "mission" TEXT NOT NULL DEFAULT 'attack',
    "status" TEXT NOT NULL DEFAULT 'idle',
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
    "units" TEXT NOT NULL DEFAULT '{}',
    "departTick" INTEGER NOT NULL,
    "arriveTick" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Fleet_ownerPlanetId_fkey" FOREIGN KEY ("ownerPlanetId") REFERENCES "Planet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Fleet" ("arriveTick", "battleStartTick", "battleState", "battleTicksDone", "capCarbonum", "capMetalium", "capPlutonium", "createdAt", "departTick", "fCaca", "fCorveta", "fCruzador", "fDestroyer", "fFragata", "fNavemae", "fRoider1", "fRoider2", "id", "mission", "originGalaxy", "originSlot", "originSystem", "ownerPlanetId", "status", "targetGalaxy", "targetSlot", "targetSystem", "units") SELECT "arriveTick", "battleStartTick", "battleState", "battleTicksDone", "capCarbonum", "capMetalium", "capPlutonium", "createdAt", "departTick", "fCaca", "fCorveta", "fCruzador", "fDestroyer", "fFragata", "fNavemae", "fRoider1", "fRoider2", "id", "mission", "originGalaxy", "originSlot", "originSystem", "ownerPlanetId", "status", "targetGalaxy", "targetSlot", "targetSystem", "units" FROM "Fleet";
DROP TABLE "Fleet";
ALTER TABLE "new_Fleet" RENAME TO "Fleet";
CREATE INDEX "Fleet_arriveTick_idx" ON "Fleet"("arriveTick");
CREATE INDEX "Fleet_ownerPlanetId_idx" ON "Fleet"("ownerPlanetId");
CREATE INDEX "Fleet_targetGalaxy_targetSystem_targetSlot_idx" ON "Fleet"("targetGalaxy", "targetSystem", "targetSlot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
