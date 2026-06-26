-- Ameaça falsa (feint): frota viaja como ataque/defesa mas volta sem engajar.
ALTER TABLE "Fleet" ADD COLUMN "fake" BOOLEAN NOT NULL DEFAULT false;
