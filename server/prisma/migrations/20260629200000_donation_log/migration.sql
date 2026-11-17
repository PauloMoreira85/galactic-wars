-- CreateTable
CREATE TABLE "DonationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "galaxy" INTEGER NOT NULL,
    "fromName" TEXT NOT NULL,
    "toName" TEXT NOT NULL,
    "metalium" INTEGER NOT NULL DEFAULT 0,
    "carbonum" INTEGER NOT NULL DEFAULT 0,
    "plutonium" INTEGER NOT NULL DEFAULT 0,
    "tick" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DonationLog_galaxy_idx" ON "DonationLog"("galaxy");
