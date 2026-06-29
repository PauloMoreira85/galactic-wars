-- Moral do planeta (0-200, começa em 100). Afeta a produção: ×(0.7 + 0.003×moral).
ALTER TABLE "Planet" ADD COLUMN "morale" INTEGER NOT NULL DEFAULT 100;
