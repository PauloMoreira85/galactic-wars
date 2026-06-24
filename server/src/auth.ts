import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

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
