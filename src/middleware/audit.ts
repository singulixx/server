import type { Request, Response, NextFunction } from "express";
import { logAudit } from "../utils/audit";

const SENSITIVE_PATHS = [/\/auth\/login/i, /\/auth\/reset/i, /\/auth\/forgot/i, /\/account\/password/i];
const shouldRedact = (path: string) => SENSITIVE_PATHS.some((re) => re.test(path));

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const user = (req as any).user as { id?: number; role?: "OWNER"|"STAFF" } | undefined;
  const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const path = req.originalUrl || req.url;
    const method = req.method;
    const meta: any = { durationMs: duration };

    if (!shouldRedact(path)) {
      meta.body = req.body;
      meta.query = req.query;
      meta.params = req.params;
    } else {
      meta.redacted = true;
    }

    logAudit({
      actorId: user?.id ?? null,
      actorRole: (user?.role as any) ?? null,
      action: `${method} ${path}`,
      method,
      path,
      ip: String(ip),
      status,
      success: status < 400,
      metadata: meta,
    });
  });

  next();
}
