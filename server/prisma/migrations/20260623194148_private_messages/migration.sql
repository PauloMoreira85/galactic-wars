-- CreateTable
CREATE TABLE "PrivateMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromUserId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PrivateMessage_toUserId_idx" ON "PrivateMessage"("toUserId");

-- CreateIndex
CREATE INDEX "PrivateMessage_fromUserId_idx" ON "PrivateMessage"("fromUserId");
