-- CreateTable
CREATE TABLE "GalaxyState" (
    "galaxy" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cgPlanetId" TEXT,
    "mePlanetId" TEXT,
    "mgPlanetId" TEXT,
    "taxRate" INTEGER NOT NULL DEFAULT 0,
    "fundMetalium" INTEGER NOT NULL DEFAULT 0,
    "fundCarbonum" INTEGER NOT NULL DEFAULT 0,
    "fundPlutonium" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "GalaxyVote" (
    "voterPlanetId" TEXT NOT NULL PRIMARY KEY,
    "galaxy" INTEGER NOT NULL,
    "candidatePlanetId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DonationCooldown" (
    "planetId" TEXT NOT NULL PRIMARY KEY,
    "lastTick" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "GalaxyVote_galaxy_idx" ON "GalaxyVote"("galaxy");
