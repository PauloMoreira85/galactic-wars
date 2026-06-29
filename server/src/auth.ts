import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { prisma } from "./db.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string) {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: "30d" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Nao autenticado" });
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalido" });
  }
}

// Exige que o usuário autenticado seja admin (ADMIN_USERS no env). Use APÓS requireAuth.
export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.userId) return res.status(401).json({ error: "Nao autenticado" });
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
  if (!user || !config.adminUsers.includes(user.username.toLowerCase())) {
    return res.status(403).json({ error: "Acesso restrito (admin)" });
  }
  next();
}
