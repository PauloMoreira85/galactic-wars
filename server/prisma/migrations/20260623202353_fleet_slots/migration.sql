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
    "roider1" INTEGER NOT NULL DEFAULT 0,
    "roider2" INTEGER NOT NULL DEFAULT 0,
    "units" TEXT NOT NULL DEFAULT '{}',
    "researchTier" INTEGER NOT NULL DEFAULT 0,
    "tech" TEXT NOT NULL DEFAULT '{}',
    "prodMul" INTEGER NOT NULL DEFAULT 100,
    "travelMul" INTEGER NOT NULL DEFAULT 100,
    "fleetSlots" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Planet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Planet" ("carbonum", "createdAt", "galaxy", "id", "metalium", "name", "plutonium", "prodMul", "researchTier", "roidCarbonum", "roidMetalium", "roidPlutonium", "roider1", "roider2", "shipCaca", "shipCorveta", "shipCruzador", "shipDestroyer", "shipFragata", "shipNavemae", "slot", "system", "tech", "travelMul", "units", "userId") SELECT "carbonum", "createdAt", "galaxy", "id", "metalium", "name", "plutonium", "prodMul", "researchTier", "roidCarbonum", "roidMetalium", "roidPlutonium", "roider1", "roider2", "shipCaca", "shipCorveta", "shipCruzador", "shipDestroyer", "shipFragata", "shipNavemae", "slot", "system", "tech", "travelMul", "units", "userId" FROM "Planet";
DROP TABLE "Planet";
ALTER TABLE "new_Planet" RENAME TO "Planet";
CREATE UNIQUE INDEX "Planet_userId_key" ON "Planet"("userId");
CREATE UNIQUE INDEX "Planet_galaxy_system_slot_key" ON "Planet"("galaxy", "system", "slot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
