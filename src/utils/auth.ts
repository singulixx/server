import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type Role = "OWNER" | "STAFF";

export interface JWTPayload {
  id: number;
  username: string;
  role: Role;
  iat: number;
  exp: number;
}

const secret = process.env.JWT_SECRET || "devsecret";

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, secret) as JWTPayload;
    (req as any).user = { id: payload.id, username: payload.username, role: payload.role };
    return next();
  } catch (err: any) {
    if (err?.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...allowed: Role[]) {
  return function (req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user as { role?: Role } | undefined;
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!user.role || !allowed.includes(user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
