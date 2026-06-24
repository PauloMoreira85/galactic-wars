-- AlterTable
ALTER TABLE "GalaxyState" ADD COLUMN "ownerPlanetId" TEXT;

-- CreateTable
CREATE TABLE "GalaxyInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "galaxy" INTEGER NOT NULL,
    "planetId" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "GalaxyInvite_planetId_idx" ON "GalaxyInvite"("planetId");

-- CreateIndex
CREATE UNIQUE INDEX "GalaxyInvite_galaxy_planetId_key" ON "GalaxyInvite"("galaxy", "planetId");
