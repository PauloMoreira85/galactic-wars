-- CreateTable
CREATE TABLE "SpyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spyPlanetId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetCoords" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SpyReport_spyPlanetId_idx" ON "SpyReport"("spyPlanetId");
