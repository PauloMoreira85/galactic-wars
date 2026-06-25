-- Recuperação de senha por e-mail (token temporário).
ALTER TABLE "User" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "resetExpires" DATETIME;
