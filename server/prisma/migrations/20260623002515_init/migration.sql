-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Planet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "galaxy" INTEGER NOT NULL DEFAULT 1,
    "system" INTEGER NOT NULL DEFAULT 1,
    "slot" INTEGER NOT NULL DEFAULT 1,
    "metalium" INTEGER NOT NULL DEFAULT 0,
    "carbonum" INTEGER NOT NULL DEFAULT 0,
    "plutonium" INTEGER NOT NULL DEFAULT 0,
    "roidMetalium" INTEGER NOT NULL DEFAULT 0,
    "roidCarbonum" INTEGER NOT NULL DEFAULT 0,
    "roidPlutonium" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Planet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "tickNumber" INTEGER NOT NULL DEFAULT 0,
    "lastTickAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Planet_userId_key" ON "Planet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Planet_galaxy_system_slot_key" ON "Planet"("galaxy", "system", "slot");
