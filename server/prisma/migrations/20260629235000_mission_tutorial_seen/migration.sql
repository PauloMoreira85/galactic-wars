-- Missões tutorial: marca quando o jogador abriu as Ferramentas e a Galáxia pela 1ª vez.
ALTER TABLE "Planet" ADD COLUMN "toolsSeenAt" DATETIME;
ALTER TABLE "Planet" ADD COLUMN "galaxySeenAt" DATETIME;
