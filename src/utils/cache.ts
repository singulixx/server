import type { Request, Response } from "express";
import crypto from "crypto";
export function setCacheHeaders(req: Request, res: Response, payload: any, maxAgeSec = 5): boolean {
  try {
    const json = typeof payload === "string" ? payload : JSON.stringify(payload);
    const etag = crypto.createHash("md5").update(json).digest("hex");
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", `public, max-age=${maxAgeSec}`);
    const inm = req.headers["if-none-match"];
    if (inm && inm === etag) { res.status(304).end(); return true; }
  } catch {}
  return false;
}
