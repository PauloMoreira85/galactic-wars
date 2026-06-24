-- CreateTable
CREATE TABLE "Alliance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AllianceMember" (
    "planetId" TEXT NOT NULL PRIMARY KEY,
    "allianceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'recruta',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AllianceMember_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AllianceInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "allianceId" TEXT NOT NULL,
    "planetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AllianceInvite_allianceId_fkey" FOREIGN KEY ("allianceId") REFERENCES "Alliance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_name_key" ON "Alliance"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Alliance_tag_key" ON "Alliance"("tag");

-- CreateIndex
CREATE INDEX "AllianceMember_allianceId_idx" ON "AllianceMember"("allianceId");

-- CreateIndex
CREATE INDEX "AllianceInvite_planetId_idx" ON "AllianceInvite"("planetId");

-- CreateIndex
CREATE UNIQUE INDEX "AllianceInvite_allianceId_planetId_key" ON "AllianceInvite"("allianceId", "planetId");
