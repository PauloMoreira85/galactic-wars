import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Opções para transações interativas. SQLite serializa escritas; com o motor
// de tick rodando, o default de 5s estourava. Damos folga pra esperar o lock.
export const TX_OPTS = { timeout: 20000, maxWait: 15000 };
