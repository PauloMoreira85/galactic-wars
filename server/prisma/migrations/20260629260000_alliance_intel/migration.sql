-- Espionagem compartilhada com a aliança (Intel da Tag).
CREATE TABLE "AllianceIntel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "allianceId" TEXT NOT NULL,
  "spyHash" TEXT NOT NULL,
  "targetCoords" TEXT NOT NULL,
  "targetName" TEXT NOT NULL,
  "agent" TEXT NOT NULL,
  "sharedBy" TEXT NOT NULL,
  "tick" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AllianceIntel_allianceId_spyHash_key" ON "AllianceIntel"("allianceId", "spyHash");
CREATE INDEX "AllianceIntel_allianceId_idx" ON "AllianceIntel"("allianceId");
CREATE INDEX "AllianceIntel_allianceId_targetCoords_idx" ON "AllianceIntel"("allianceId", "targetCoords");
