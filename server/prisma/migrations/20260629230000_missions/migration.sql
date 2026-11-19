-- AddColumn: missões de novato concluídas (JSON array)
ALTER TABLE "Planet" ADD COLUMN "missionsDone" TEXT NOT NULL DEFAULT '[]';
