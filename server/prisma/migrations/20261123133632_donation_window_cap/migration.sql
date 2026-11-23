-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DonationCooldown" (
    "planetId" TEXT NOT NULL PRIMARY KEY,
    "lastTick" INTEGER NOT NULL DEFAULT 0,
    "lastTickM" INTEGER NOT NULL DEFAULT 0,
    "lastTickC" INTEGER NOT NULL DEFAULT 0,
    "lastTickP" INTEGER NOT NULL DEFAULT 0,
    "windowStart" INTEGER NOT NULL DEFAULT 0,
    "recvInWindow" INTEGER NOT NULL DEFAULT 0,
    "capInWindow" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_DonationCooldown" ("lastTick", "lastTickC", "lastTickM", "lastTickP", "planetId") SELECT "lastTick", "lastTickC", "lastTickM", "lastTickP", "planetId" FROM "DonationCooldown";
DROP TABLE "DonationCooldown";
ALTER TABLE "new_DonationCooldown" RENAME TO "DonationCooldown";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
