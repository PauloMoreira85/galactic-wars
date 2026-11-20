-- Quadro de Ataque da Aliança (organizado pelo AC/TL/HC).
CREATE TABLE "AttackBoard" (
  "allianceId" TEXT NOT NULL PRIMARY KEY,
  "locked" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AttackTarget" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "allianceId" TEXT NOT NULL,
  "galaxy" INTEGER NOT NULL,
  "system" INTEGER NOT NULL,
  "slot" INTEGER NOT NULL,
  "note" TEXT,
  "createdBy" TEXT NOT NULL,
  "ownerPlanetId" TEXT,
  "shared" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AttackTarget_allianceId_idx" ON "AttackTarget"("allianceId");

CREATE TABLE "AttackClaim" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "targetId" TEXT NOT NULL,
  "planetId" TEXT NOT NULL,
  "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttackClaim_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "AttackTarget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AttackClaim_targetId_planetId_key" ON "AttackClaim"("targetId", "planetId");
CREATE INDEX "AttackClaim_planetId_idx" ON "AttackClaim"("planetId");
