-- Anti multi-conta: IPs por conta + pares liberados pelo admin.
CREATE TABLE "AccountIp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "firstSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AccountIp_userId_ip_key" ON "AccountIp"("userId", "ip");
CREATE INDEX "AccountIp_ip_idx" ON "AccountIp"("ip");
CREATE INDEX "AccountIp_userId_idx" ON "AccountIp"("userId");

CREATE TABLE "AllowedPair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AllowedPair_aId_bId_key" ON "AllowedPair"("aId", "bId");
