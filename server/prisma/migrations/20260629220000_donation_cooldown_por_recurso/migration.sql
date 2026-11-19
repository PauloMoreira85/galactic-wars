-- AddColumn: cooldown de doação POR RECURSO (1 de cada por janela)
ALTER TABLE "DonationCooldown" ADD COLUMN "lastTickM" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DonationCooldown" ADD COLUMN "lastTickC" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DonationCooldown" ADD COLUMN "lastTickP" INTEGER NOT NULL DEFAULT 0;
