import { Router } from "express";
import { prisma } from "../db.js";
import { shopeeAuthUrl } from "../services/shopee.js";
import { authRequired } from "../utils/auth.js";
import { setCacheHeaders } from "../utils/cache.js"; // <-- pastikan ini ada

const router = Router();
router.use(authRequired);

// WAS: async (_req, res) => { ... setCacheHeaders(req, res, ...) ... }
// ✅ ROUTE DEBUG YANG DIPERBAIKI (tanpa import crypto langsung)
router.get("/debug/shopee-sign", async (req, res) => {
  try {
    // Gunakan dynamic import untuk crypto (Node.js style)
    const crypto = await import("node:crypto");

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const timestamp = 1763029593;
    const path = "/api/v2/shop/auth_partner";

    if (!partnerId || !partnerKey) {
      return res.status(400).json({
        error: "Missing environment variables",
        SHOPEE_PARTNER_ID: !!partnerId,
        SHOPEE_PARTNER_KEY: !!partnerKey,
      });
    }

    const baseString = `${partnerId}${path}${timestamp}`;

    console.log("🔐 Debug Info:", {
      partnerId,
      timestamp,
      path,
      baseString,
      keyLength: partnerKey.length,
      keyPreview: partnerKey.substring(0, 10) + "...",
    });

    // Coba decode sebagai base64
    let keyBuffer: Buffer;
    let keyType = "plain";
    try {
      keyBuffer = Buffer.from(partnerKey, "base64");
      keyType = "base64";
    } catch (e) {
      keyBuffer = Buffer.from(partnerKey, "utf8");
      keyType = "plain";
    }

    const hmac = crypto.createHmac("sha256", keyBuffer);
    hmac.update(baseString);
    const signature = hmac.digest("hex");

    const result = {
      partnerId,
      timestamp,
      baseString,
      generatedSignature: signature,
      expectedSignature:
        "04353338bc2bea20a8d5b6094f430592a3f3745ca72f44888f6099ae988cd5f3",
      match:
        signature ===
        "04353338bc2bea20a8d5b6094f430592a3f3745ca72f44888f6099ae988cd5f3",
      keyLength: partnerKey.length,
      keyType: keyType,
      environment: "vercel",
      message:
        signature ===
        "04353338bc2bea20a8d5b6094f430592a3f3745ca72f44888f6099ae988cd5f3"
          ? "✅ SIGNATURE MATCH!"
          : "❌ SIGNATURE MISMATCH!",
    };

    console.log("🔐 Debug Result:", result);
    res.json(result);
  } catch (error: any) {
    console.error("❌ Debug Error:", error);
    res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
});

router.get("/", async (req, res) => {
  const { limit, offset, skip } = req.query as any;
  const take = Math.min(Math.max(parseInt(String(limit)) || 50, 1), 100);
  const off = Number.isFinite(Number(offset))
    ? Number(offset)
    : Number(skip) || 0;
  const [items, total] = await Promise.all([
    prisma.store.findMany({ orderBy: { createdAt: "desc" }, take, skip: off }),
    prisma.store.count(),
  ]);
  if (setCacheHeaders(req, res, items)) return;
  res.json({ items, total, limit: take, offset: off });
});

// sisanya boleh tetap sama
router.post("/", async (req, res) => {
  try {
    const { name, type } = req.body;
    if (!name || !type)
      return res.status(400).json({ error: "name & type required" });
    const store = await prisma.store.create({ data: { name, type } });
    res.json(store);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message || "Failed to create store" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, type, apiKey, partnerId, secretKey, channel } = req.body;
    const store = await prisma.store.update({
      where: { id },
      data: { name, type, apiKey, partnerId, secretKey, channel },
    });
    res.json(store);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message || "Failed to update store" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.store.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message || "Failed to delete store" });
  }
});

router.get("/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const store = await prisma.store.findUnique({ where: { id } });
    if (!store)
      return res
        .status(404)
        .json({ connected: false, message: "Store not found" });

    const t = (store.type || "").toUpperCase();
    if (t !== "SHOPEE")
      return res.json({ connected: true, message: "Manual channel" });

    const connected =
      !!store.apiKey || (!!store.partnerId && !!store.secretKey);
    res.json({ connected });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ connected: false, message: "Status error" });
  }
});

router.post("/:id/shopee/connect", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, type } = req.body || {};
    if (!name || !type)
      return res.status(400).json({ error: "name & type required" });

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) return res.status(404).json({ error: "Store not found" });

    const t = (type || "").toUpperCase();
    if (t !== "SHOPEE")
      return res.status(400).json({ error: "Invalid store type" });

    // Build auth URL (uses env vars in services/shopee.ts)
    try {
      const authUrl: string = shopeeAuthUrl();
      return res.json({ url: authUrl });
    } catch (err: any) {
      console.error("shopeeAuthUrl error:", err);
      return res.status(500).json({ error: "failed_build_auth_url" });
    }
  } catch (err: any) {
    console.error("POST /:id/shopee/connect error:", err);
    res.status(500).json({ error: err?.message || "internal_error" });
  }
});

export default router;
