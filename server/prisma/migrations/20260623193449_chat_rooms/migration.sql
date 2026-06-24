-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "room" TEXT NOT NULL DEFAULT 'universo',
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ChatMessage" ("authorName", "body", "createdAt", "id") SELECT "authorName", "body", "createdAt", "id" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE INDEX "ChatMessage_room_idx" ON "ChatMessage"("room");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
