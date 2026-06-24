-- CreateTable
CREATE TABLE "PlanetEffect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pct" INTEGER NOT NULL DEFAULT 0,
    "expiresTick" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "SabotageCooldown" (
    "planetId" TEXT NOT NULL PRIMARY KEY,
    "lastTick" INTEGER NOT NULL
);

-- CreateIndex
CREATE INDEX "PlanetEffect_planetId_idx" ON "PlanetEffect"("planetId");

-- CreateIndex
CREATE INDEX "PlanetEffect_expiresTick_idx" ON "PlanetEffect"("expiresTick");
