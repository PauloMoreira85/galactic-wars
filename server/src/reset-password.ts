import { prisma } from "./db.js";
import bcrypt from "bcryptjs";

// Reset de senha pelo admin (sem e-mail). Útil quando um jogador esquece a senha.
// Uso (no container): node server/dist/reset-password.js <usuario> <nova_senha>
async function main() {
  const [username, newPass] = process.argv.slice(2);
  if (!username || !newPass) {
    console.error("Uso: node server/dist/reset-password.js <usuario> <nova_senha>");
    process.exit(1);
  }
  if (newPass.length < 6) {
    console.error("A nova senha precisa de pelo menos 6 caracteres.");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`Usuário '${username}' não encontrado.`);
    process.exit(1);
  }
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(newPass, 10) } });
  console.log(`✅ Senha de '${username}' redefinida. Avise o jogador pra trocar em Preferências.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
