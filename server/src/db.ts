import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Opções para transações interativas. SQLite serializa escritas; com o motor
// de tick rodando, o default de 5s estourava. Damos folga pra esperar o lock.
export const TX_OPTS = { timeout: 20000, maxWait: 15000 };

// ===== Fila de escrita no processo =====
// SQLite só aceita 1 escritor por vez. Em vez de deixar o motor de tick e as
// ações do jogador (pesquisa/construção/naves) disputarem o lock — onde a ação
// podia esperar até o busy_timeout (5s) ou sofrer "starvation" — serializamos
// TODAS as escritas numa fila única. Cada operação espera só a anterior (rápida),
// nunca o lock do SQLite. Use withWrite() em volta de cada transação de escrita.
// IMPORTANTE: não aninhar withWrite dentro de withWrite (trava a fila).
let writeChain: Promise<unknown> = Promise.resolve();
export function withWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  // a cadeia continua mesmo se uma operação falhar (não trava a fila)
  writeChain = run.then(() => {}, () => {});
  return run;
}
