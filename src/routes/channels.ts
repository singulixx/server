// src/routes/channels.ts
import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authRequired, requireRole } from "../utils/auth.js";
import { audit } from "../utils/audit.js";
import { pushNewProductMock, importTransactionsMock, syncStockMock } from "../services/marketplace-mock.js";
import { shopeeAuthUrl, shopeeExchangeToken, shopeeGetOrders, shopeeUpdateStock, shopeeRefreshToken } from "../services/shopee.js";
import { tiktokAuthUrl, tiktokExchangeToken, tiktokSearchOrders, tiktokUpdateInventory, tiktokRefreshToken } from "../services/tiktok.js";
import type { Platform } from "@prisma/client";

const r = Router();
r.use(authRequired);

const ALLOWED_PLATFORMS = ["SHOPEE", "TIKTOK", "OFFLINE"] as const;
type AllowedPlatform = typeof ALLOWED_PLATFORMS[number];

/** helper untuk memastikan value platform valid dan mengembalikannya sebagai Platform */
function parsePlatform(input: unknown): Platform | null {
  if (!input || typeof input !== "string") return null;
  const up = input.toUpperCase();
  if ((ALLOWED_PLATFORMS as readonly string[]).includes(up)) {
    return up as Platform;
  }
  return null;
}

// List channel accounts
r.get("/", async (_req: Request, res: Response) => {
  try {
    const list = await prisma.channelAccount.findMany({ orderBy: { createdAt: "desc" } });
    res.json(list);
  } catch (e) {
    console.error("GET /channels error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// Create channel account (Owner)
r.post("/", requireRole("OWNER"), async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { platform?: string; label?: string };
    const parsed = parsePlatform(body.platform) ?? "OFFLINE";
    // jika user memberikan platform tapi invalid, beri 400
    if (body.platform && parsePlatform(body.platform) === null) {
      return res.status(400).json({ error: "invalid_platform", allowed: ALLOWED_PLATFORMS });
    }

    const created = await prisma.channelAccount.create({
      data: { platform: parsed as Platform, label: body.label ?? "unnamed", credentials: {} },
    });

    // audit expects (userId, action, target, targetId?, metadata?)
    await audit((req as any).user?.id ?? null, "channel.create", "Channel", created.id, {
      platform: parsed,
      label: body.label,
    });

    res.json(created);
  } catch (e) {
    console.error("POST /channels error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// Init connect flow (returns URL)
r.post("/:id/connect/init", requireRole("OWNER"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const acc = await prisma.channelAccount.findUnique({ where: { id } });
    if (!acc) return res.status(404).json({ error: "Channel not found" });
    let url: string | null = null;
    if (acc.platform === "SHOPEE") url = shopeeAuthUrl();
    else if (acc.platform === "TIKTOK") url = tiktokAuthUrl(String(id));
    else return res.status(400).json({ error: "Unsupported platform" });
    res.json({ url });
  } catch (e) {
    console.error("POST /:id/connect/init error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// OAuth callback (Shopee)
r.get("/oauth/shopee/callback", async (req: Request, res: Response) => {
  try {
    const { code, shop_id, merchant_id, channel_id } = (req.query as any);
    if (!code) return res.status(400).send("Missing code");
    let chId = channel_id ? Number(channel_id) : undefined;
    if (!chId) {
      const created = await prisma.channelAccount.create({
        data: { platform: "SHOPEE", label: "Shopee " + (shop_id || merchant_id), credentials: {} },
      });
      chId = created.id;
    }

    const token = await shopeeExchangeToken(String(code), shop_id ? Number(shop_id) : undefined, merchant_id ? Number(merchant_id) : undefined);

    // token may be unknown; cast locally and defensively access properties
    const t = token as any;
    const access_token = t?.access_token;
    const refresh_token = t?.refresh_token;
    const expire_in = t?.expire_in;

    await prisma.channelAccount.update({
      where: { id: chId },
      data: {
        credentials: {
          access_token: access_token ?? null,
          refresh_token: refresh_token ?? null,
          expire_at: Math.floor(Date.now() / 1000) + Number(expire_in || 14400),
          shop_id: shop_id ? Number(shop_id) : undefined,
          merchant_id: merchant_id ? Number(merchant_id) : undefined,
        },
      },
    });

    return res.redirect((process.env.WEB_BASE_URL || "http://localhost:3000") + "/channel?connected=shopee");
  } catch (e: any) {
    console.error("GET /oauth/shopee/callback error:", e);
    return res.status(500).send(e?.message || "Failed");
  }
});

// OAuth callback (TikTok)
r.get("/oauth/tiktok/callback", async (req: Request, res: Response) => {
  try {
    const { code, state } = (req.query as any);
    if (!code) return res.status(400).send("Missing code");
    let chId = state ? Number(state) : undefined;
    if (!chId) {
      const created = await prisma.channelAccount.create({ data: { platform: "TIKTOK", label: "TikTok " + Date.now(), credentials: {} } });
      chId = created.id;
    }

    const token = await tiktokExchangeToken(String(code));
    const t = token as any;
    const data = t?.data ?? t;

    await prisma.channelAccount.update({
      where: { id: chId },
      data: {
        credentials: {
          access_token: data?.access_token ?? null,
          refresh_token: data?.refresh_token ?? null,
          expire_at: Math.floor(Date.now() / 1000) + Number(data?.expires_in || 14400),
          shop_id: data?.shop_id ?? null,
          seller_id: data?.seller_id ?? null,
        },
      },
    });

    return res.redirect((process.env.WEB_BASE_URL || "http://localhost:3000") + "/channel?connected=tiktok");
  } catch (e: any) {
    console.error("GET /oauth/tiktok/callback error:", e);
    return res.status(500).send(e?.message || "Failed");
  }
});

// Force refresh token
r.post("/:id/refresh", requireRole("OWNER"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const acc = await prisma.channelAccount.findUnique({ where: { id } });
    if (!acc) return res.status(404).json({ error: "Channel not found" });

    if (acc.platform === "SHOPEE") {
      const data = await shopeeRefreshToken(id);
      return res.json({ ok: true, data });
    } else if (acc.platform === "TIKTOK") {
      const data = await tiktokRefreshToken(id);
      return res.json({ ok: true, data });
    }
    return res.status(400).json({ error: "Unsupported platform" });
  } catch (e) {
    console.error("POST /:id/refresh error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// Import orders (real if MARKETPLACE_MODE=live)
r.post("/:id/import", requireRole("OWNER"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const days = Number(req.body?.days || 3);
    const acc = await prisma.channelAccount.findUnique({ where: { id } });
    if (!acc) return res.status(404).json({ error: "Channel not found" });

    if ((process.env.MARKETPLACE_MODE || "mock") === "mock") {
      const result = await importTransactionsMock(id, days);
      return res.json({ ok: true, mode: "mock", result });
    }
    if (acc.platform === "SHOPEE") {
      const result = await shopeeGetOrders(id, days);
      return res.json({ ok: true, mode: "live", result });
    } else if (acc.platform === "TIKTOK") {
      const result = await tiktokSearchOrders(id, days);
      return res.json({ ok: true, mode: "live", result });
    }
    return res.status(400).json({ error: "Unsupported platform" });
  } catch (e) {
    console.error("POST /:id/import error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// Sync stock (real if live)
r.post("/:id/sync-stock", requireRole("OWNER"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const items = req.body?.items || []; // map SKU to stock; for demo we just forward
    const acc = await prisma.channelAccount.findUnique({ where: { id } });
    if (!acc) return res.status(404).json({ error: "Channel not found" });

    if ((process.env.MARKETPLACE_MODE || "mock") === "mock") {
      const result = await syncStockMock(id);
      return res.json({ ok: true, mode: "mock", result });
    }
    if (acc.platform === "SHOPEE") {
      const result = await shopeeUpdateStock(id, items);
      return res.json({ ok: true, mode: "live", result });
    } else if (acc.platform === "TIKTOK") {
      const result = await tiktokUpdateInventory(id, items);
      return res.json({ ok: true, mode: "live", result });
    }
    return res.status(400).json({ error: "Unsupported platform" });
  } catch (e) {
    console.error("POST /:id/sync-stock error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

export default r;
