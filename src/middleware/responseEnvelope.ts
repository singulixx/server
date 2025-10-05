
import type { Request, Response, NextFunction } from "express";

/**
 * Global JSON response envelope with:
 * - Consistent success/error shape
 * - Default empty handling
 * - List normalization {items,total}
 * - Pagination meta (limit, offset, nextOffset) when query has them
 * - Error categories inferred from HTTP status (or override with extra.category)
 */
export default function responseEnvelope() {
  return function (req: Request, res: Response, next: NextFunction) {
    const originalJson = res.json.bind(res);

    (res as any).success = (data: any, message: string | null = null, meta: any = {}) => {
      const base = normalizeSuccess(req, res, data, message, meta);
      return originalJson(base);
    };

    (res as any).error = (message: string, code?: number, extra?: any) => {
      if (code) res.status(code);
      const base = normalizeError(req, res, message, extra);
      return originalJson(base);
    };

    res.json = (body?: any) => {
      try {
        if (!shouldWrap(req, res, body)) return originalJson(body);
        const base = (res.statusCode >= 400)
          ? normalizeError(req, res, extractMessage(body), body)
          : normalizeSuccess(req, res, body, null, {});
        return originalJson(base);
      } catch (_e) {
        return originalJson(body);
      }
    };

    next();
  };
}

function shouldWrap(_req: Request, res: Response, body: any) {
  if (body && typeof body === "object" && ("status" in body)) return false;
  const ct = res.getHeader("Content-Type");
  if (ct && String(ct).toLowerCase().includes("text/csv")) return false;
  return true;
}

function normalizeSuccess(req: Request, res: Response, data: any, message: string | null, meta: any) {
  const shaped = shapeData(data);
  const baseMeta: any = { ...meta };

  if (Array.isArray(shaped.data)) {
    baseMeta.count = shaped.data.length;
    if (typeof shaped.meta?.total === "number") baseMeta.total = shaped.meta.total;
  }
  if (shaped.wasNullOrEmpty) baseMeta.empty = true;

  // Pagination meta from query (?limit=&offset=)
  const limitQ = parseInt(String((req.query as any).limit ?? "")) || undefined;
  const offsetQ = parseInt(String((req.query as any).offset ?? (req.query as any).skip ?? "")) || 0;
  if (limitQ || offsetQ) {
    baseMeta.limit = limitQ ?? baseMeta.limit ?? null;
    baseMeta.offset = offsetQ ?? baseMeta.offset ?? 0;
    if (typeof baseMeta.total === "number" && typeof baseMeta.limit === "number") {
      const next = offsetQ + baseMeta.limit;
      baseMeta.nextOffset = next < baseMeta.total ? next : null;
    }
  }

  return {
    status: "success",
    message,
    data: shaped.data,
    meta: baseMeta,
  };
}

function normalizeError(_req: Request, res: Response, message: string, extra?: any) {
  const code = res.statusCode >= 400 ? res.statusCode : 400;
  res.status(code);
  const category = (extra && extra.category) || inferCategory(code);
  const meta: any = { code, category };
  if (extra && typeof extra === "object") meta.extra = extra;
  return {
    status: "error",
    message: message || defaultMessageFor(code),
    data: null,
    meta,
  };
}

function extractMessage(body: any): string {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof body.error === "string") return body.error;
  if (typeof body.message === "string") return body.message;
  return "";
}

function shapeData(data: any): { data: any, meta?: any, wasNullOrEmpty: boolean } {
  if (data == null) return { data: null, wasNullOrEmpty: true };
  if (typeof data === "object" && "items" in data && "total" in data) {
    const items = (data as any).items ?? [];
    const total = (data as any).total ?? (Array.isArray(items) ? items.length : 0);
    const empty = Array.isArray(items) ? items.length === 0 : false;
    return { data: items, meta: { total }, wasNullOrEmpty: empty };
  }
  if (Array.isArray(data)) return { data, wasNullOrEmpty: data.length === 0 };
  return { data, wasNullOrEmpty: false };
}

function inferCategory(code: number): string {
  if (code === 400) return "validation";
  if (code === 401) return "unauthorized";
  if (code === 403) return "forbidden";
  if (code === 404) return "not_found";
  if (code === 409) return "conflict";
  if (code === 422) return "unprocessable";
  if (code === 429) return "rate_limited";
  if (code >= 500) return "server_error";
  return "error";
}

function defaultMessageFor(code: number): string {
  switch (code) {
    case 400: return "Bad request";
    case 401: return "Unauthorized";
    case 403: return "Forbidden";
    case 404: return "Not found";
    case 409: return "Conflict";
    case 422: return "Unprocessable entity";
    case 429: return "Too many requests";
    default: return code >= 500 ? "Server error" : "Request failed";
  }
}

// Type augmentation
declare module "express-serve-static-core" {
  interface Response {
    success?: (data: any, message?: string | null, meta?: any) => Response;
    error?: (message: string, code?: number, extra?: any) => Response;
  }
}
