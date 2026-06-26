-- Agentes de inteligência treinados por planeta (P/M/T/D ofensivos + CE defensivo).
ALTER TABLE "Planet" ADD COLUMN "agents" TEXT NOT NULL DEFAULT '{}';
