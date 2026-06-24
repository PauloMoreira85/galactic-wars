import { prisma } from "../db.js";

export const MAX_NAME_CHANGES = 3;

// No início do jogo, qualquer um pode virar Associado (grátis).
export async function becomeAssociado(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuario nao encontrado");
  if (user.associado) return { associado: true };
  await prisma.user.update({ where: { id: userId }, data: { associado: true } });
  return { associado: true };
}

// Associado pode trocar o nome de comandante até 3 vezes.
export async function changeName(userId: string, newName: string) {
  const name = newName.trim();
  if (name.length < 1 || name.length > 30) throw new Error("Nome deve ter de 1 a 30 caracteres");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuario nao encontrado");
  if (!user.associado) throw new Error("Apenas Associados podem trocar de nome");
  if (user.nameChanges >= MAX_NAME_CHANGES) throw new Error(`Você já usou suas ${MAX_NAME_CHANGES} trocas de nome`);
  if (name === user.username) throw new Error("Esse já é o seu nome");
  const taken = await prisma.user.findFirst({ where: { username: name, NOT: { id: userId } } });
  if (taken) throw new Error("Esse nome já está em uso");
  await prisma.user.update({ where: { id: userId }, data: { username: name, nameChanges: { increment: 1 } } });
  return { username: name, nameChanges: user.nameChanges + 1, remaining: MAX_NAME_CHANGES - (user.nameChanges + 1) };
}

export async function associadoView(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuario nao encontrado");
  return {
    associado: user.associado,
    username: user.username,
    nameChanges: user.nameChanges,
    nameChangesLeft: user.associado ? Math.max(0, MAX_NAME_CHANGES - user.nameChanges) : 0,
    maxNameChanges: MAX_NAME_CHANGES,
  };
}
