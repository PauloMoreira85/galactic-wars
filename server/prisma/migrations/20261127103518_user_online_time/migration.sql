-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "race" TEXT NOT NULL DEFAULT 'humanos',
    "raceRound" DATETIME,
    "associado" BOOLEAN NOT NULL DEFAULT false,
    "nameChanges" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onlineMs" BIGINT NOT NULL DEFAULT 0,
    "resetToken" TEXT,
    "resetExpires" DATETIME,
    "whatsapp" TEXT,
    "pixKey" TEXT,
    "avatar" TEXT,
    "notifOff" TEXT
);
INSERT INTO "new_User" ("associado", "avatar", "createdAt", "email", "id", "lastSeen", "nameChanges", "notifOff", "password", "pixKey", "race", "raceRound", "resetExpires", "resetToken", "username", "whatsapp") SELECT "associado", "avatar", "createdAt", "email", "id", "lastSeen", "nameChanges", "notifOff", "password", "pixKey", "race", "raceRound", "resetExpires", "resetToken", "username", "whatsapp" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
