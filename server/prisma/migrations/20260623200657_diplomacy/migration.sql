-- AlterTable
ALTER TABLE "GalaxyState" ADD COLUMN "mdPlanetId" TEXT;

-- CreateTable
CREATE TABLE "GalaxyTreaty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "galaxyA" INTEGER NOT NULL,
    "galaxyB" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposedBy" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "GalaxyTreaty_galaxyA_galaxyB_key" ON "GalaxyTreaty"("galaxyA", "galaxyB");
