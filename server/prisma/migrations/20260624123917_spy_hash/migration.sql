/*
  Warnings:

  - Added the required column `hash` to the `SpyReport` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SpyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "spyPlanetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetCoords" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_SpyReport" ("agent", "createdAt", "data", "id", "spyPlanetId", "targetCoords", "targetName", "tick") SELECT "agent", "createdAt", "data", "id", "spyPlanetId", "targetCoords", "targetName", "tick" FROM "SpyReport";
DROP TABLE "SpyReport";
ALTER TABLE "new_SpyReport" RENAME TO "SpyReport";
CREATE UNIQUE INDEX "SpyReport_hash_key" ON "SpyReport"("hash");
CREATE INDEX "SpyReport_spyPlanetId_idx" ON "SpyReport"("spyPlanetId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
