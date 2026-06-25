import type { Request } from "express";
import { prisma } from "../db.js";

// Mensagem padrão quando uma interação é barrada por multi-conta (mesmo IP).
export const MULTI_BLOCK_MSG =
  "Interação bloqueada: estas contas acessam do mesmo IP (proteção anti multi-conta). Se for engano, fale com a administração.";

// IP real do cliente. Atrás do Caddy, req.ip já vem do X-Forwarded-For
// (exige app.set("trust proxy", true) no index). Normaliza IPv4 mapeado (::ffff:).
export function clientIp(req: Request): string {
  let ip = (req.ip || req.socket?.remoteAddress || "").trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  return ip;
}

// Registra/atualiza um IP de uma conta (login, registro).
export async function recordIp(userId: string, ip: string): Promise<void> {
  if (!ip) return;
  try {
    await prisma.accountIp.upsert({
      where: { userId_ip: { userId, ip } },
      update: { lastSeen: new Date(), hits: { increment: 1 } },
      create: { userId, ip },
    });
  } catch (e) {
    console.error("[ipguard] falha ao registrar IP:", e);
  }
}

// Registro "barato" durante o jogo (/me é chamado o tempo todo): grava no máximo
// uma vez por userId+ip por processo, evitando uma escrita por requisição.
const recentlyTracked = new Set<string>();
export function trackIp(userId: string, ip: string): void {
  if (!ip) return;
  const k = `${userId}|${ip}`;
  if (recentlyTracked.has(k)) return;
  recentlyTracked.add(k);
  void recordIp(userId, ip);
}

// Par ordenado (menor id primeiro) para casar com AllowedPair nos dois sentidos.
function pairKey(a: string, b: string) {
  return a < b ? { aId: a, bId: b } : { aId: b, bId: a };
}

// Contas que compartilham ao menos um IP com `userId` (exceto ela mesma),
// já descontando os pares liberados manualmente pelo admin.
export async function linkedUserIds(userId: string): Promise<string[]> {
  const mine = await prisma.accountIp.findMany({ where: { userId }, select: { ip: true } });
  const ips = mine.map((r) => r.ip);
  if (!ips.length) return [];
  const others = await prisma.accountIp.findMany({
    where: { ip: { in: ips }, userId: { not: userId } },
    select: { userId: true },
  });
  const ids = [...new Set(others.map((r) => r.userId))];
  if (!ids.length) return [];
  const allowed = await prisma.allowedPair.findMany({
    where: { OR: ids.map((id) => pairKey(userId, id)) },
  });
  const cleared = new Set(allowed.map((p) => (p.aId === userId ? p.bId : p.aId)));
  return ids.filter((id) => !cleared.has(id));
}

// As duas contas compartilham IP e NÃO foram liberadas pelo admin?
export async function isLinked(userIdA: string, userIdB: string): Promise<boolean> {
  if (!userIdA || !userIdB || userIdA === userIdB) return false;
  const linked = await linkedUserIds(userIdA);
  return linked.includes(userIdB);
}

// Lança erro se a interação entre as duas contas está bloqueada (multi-conta).
export async function assertCanInteract(userIdA: string, userIdB: string): Promise<void> {
  if (await isLinked(userIdA, userIdB)) throw new Error(MULTI_BLOCK_MSG);
}
