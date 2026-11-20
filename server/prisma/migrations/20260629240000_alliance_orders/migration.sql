-- Mural de ordens da aliança (recado do TL/HC visível a todos os membros).
ALTER TABLE "Alliance" ADD COLUMN "orders" TEXT;
ALTER TABLE "Alliance" ADD COLUMN "ordersBy" TEXT;
ALTER TABLE "Alliance" ADD COLUMN "ordersAt" DATETIME;
