import { prisma } from "../db.js";
import { PLANET_SKINS, isSkinKey, DEFAULT_SKIN } from "./skins.js";
import { NEWBIE_PROTECTION_TICKS } from "./constants.js";

export const MAX_NAME_CHANGES = 3;
export const SHIELD_TICKS = NEWBIE_PROTECTION_TICKS; // escudo manual dura 72 ticks (igual à proteção de novato)

// Ativa o ESCUDO manual (72 ticks) — recurso de uso ÚNICO por planeta. Enquanto
// ativo, ninguém pode atacar o planeta. Não é cumulativo e não se reseta.
export async function activateShield(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { planet: true } });
  if (!user?.planet) throw new Error("Planeta nao encontrado");
  const p = user.planet;
  if (p.shieldUsed) throw new Error("Você já usou seu escudo de proteção (é 1 vez só).");
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  // Se ainda está sob proteção de novato, o escudo só começa quando ela acabar
  // (não desperdiça ticks por cima da proteção que já existe).
  const novatoUntil = p.createdTick + NEWBIE_PROTECTION_TICKS;
  const start = Math.max(tick, novatoUntil);
  const until = start + SHIELD_TICKS;
  await prisma.planet.update({ where: { id: p.id }, data: { shieldUntilTick: until, shieldUsed: true } });
  return { shieldUntilTick: until, start, ticksLeft: until - tick };
}

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

// Trocar a aparência (skin) do planeta — recurso de ASSOCIADO. Cosmético e neutro
// quanto à raça (não revela a raça no mapa); sem limite de trocas. Quem não é
// associado fica com a skin padrão ("terra").
export async function changeSkin(userId: string, skin: string) {
  if (!isSkinKey(skin)) throw new Error("Skin inválida");
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { planet: true } });
  if (!user) throw new Error("Usuario nao encontrado");
  if (!user.associado) throw new Error("Apenas Associados podem escolher a aparência do planeta");
  if (!user.planet) throw new Error("Planeta nao encontrado");
  await prisma.planet.update({ where: { id: user.planet.id }, data: { skin } });
  return { skin };
}

export async function associadoView(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { planet: true } });
  if (!user) throw new Error("Usuario nao encontrado");
  const tick = (await prisma.gameState.findUnique({ where: { id: 1 } }))?.tickNumber ?? 0;
  const p = user.planet;
  const shieldActive = !!p && tick < (p.shieldUntilTick ?? 0);
  return {
    associado: user.associado,
    username: user.username,
    nameChanges: user.nameChanges,
    nameChangesLeft: user.associado ? Math.max(0, MAX_NAME_CHANGES - user.nameChanges) : 0,
    maxNameChanges: MAX_NAME_CHANGES,
    // Skins: catálogo pra escolher + a atual do planeta. Só associado pode trocar.
    skins: PLANET_SKINS,
    skin: p && isSkinKey(p.skin) ? p.skin : DEFAULT_SKIN,
    // Escudo manual (72 ticks, 1 uso): usado?, ativo agora?, ticks restantes.
    shield: {
      ticks: SHIELD_TICKS,
      used: !!p?.shieldUsed,
      active: shieldActive,
      ticksLeft: shieldActive ? (p!.shieldUntilTick - tick) : 0,
    },
  };
}
