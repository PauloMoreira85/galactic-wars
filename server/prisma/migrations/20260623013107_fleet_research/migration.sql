-- CreateTable
CREATE TABLE "BuildOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "shipClass" TEXT,
    "targetTier" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "startTick" INTEGER NOT NULL,
    "completeTick" INTEGER NOT NULL,
    CONSTRAINT "BuildOrder_planetId_fkey" FOREIGN KEY ("planetId") REFERENCES "Planet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "researchTier" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Planet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Planet" ("carbonum", "createdAt", "galaxy", "id", "metalium", "name", "plutonium", "roidCarbonum", "roidMetalium", "roidPlutonium", "slot", "system", "userId") SELECT "carbonum", "createdAt", "galaxy", "id", "metalium", "name", "plutonium", "roidCarbonum", "roidMetalium", "roidPlutonium", "slot", "system", "userId" FROM "Planet";
DROP TABLE "Planet";
ALTER TABLE "new_Planet" RENAME TO "Planet";
CREATE UNIQUE INDEX "Planet_userId_key" ON "Planet"("userId");
CREATE UNIQUE INDEX "Planet_galaxy_system_slot_key" ON "Planet"("galaxy", "system", "slot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BuildOrder_completeTick_idx" ON "BuildOrder"("completeTick");

-- CreateIndex
CREATE INDEX "BuildOrder_planetId_idx" ON "BuildOrder"("planetId");
