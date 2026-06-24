-- AlterTable
ALTER TABLE "GalaxyState" ADD COLUMN "flag" TEXT;

-- CreateTable
CREATE TABLE "News" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planetId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "News_planetId_idx" ON "News"("planetId");
