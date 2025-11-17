import { Router } from "express";
import { prisma } from "../db.js";
import { shopeeAuthUrl } from "../services/shopee.js";
import { authRequired } from "../utils/auth.js";
import { setCacheHeaders } from "../utils/cache.js"; // <-- pastikan ini ada

const router = Router();
router.use(authRequired);

// WAS: async (_req, res) => { ... setCacheHeaders(req, res, ...) ... }
// ✅ ROUTE DEBUG YANG DIPERBAIKI (tanpa import crypto langsung)
// Tambahkan di routes/stores.ts atau routes/channels.ts
router.get("/debug/shopee-auth-full", async (req, res) => {
  try {
    const crypto = await import("node:crypto");

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const redirectUrl = process.env.SHOPEE_REDIRECT_URL;
    const useMerchant = process.env.SHOPEE_USE_MERCHANT === "true";

    if (!partnerId || !partnerKey || !redirectUrl) {
      return res.status(400).json({
        error: "Missing environment variables",
        partnerId: !!partnerId,
        partnerKey: !!partnerKey,
        redirectUrl: !!redirectUrl,
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const path = useMerchant
      ? "/api/v2/merchant/auth_partner"
      : "/api/v2/shop/auth_partner";

    // Coba multiple signature methods
    const baseString = `${partnerId}${path}${timestamp}`;

    // Method 1: HEX decoding (current approach)
    const normalizedKey = partnerKey.replace(/^shpk/i, "").trim();
    const keyBufferHex = Buffer.from(normalizedKey, "hex");
    const hmacHex = crypto.createHmac("sha256", keyBufferHex);
    hmacHex.update(baseString);
    const signatureHex = hmacHex.digest("hex");

    // Method 2: Raw string (UTF-8)
    const keyBufferRaw = Buffer.from(partnerKey, "utf8");
    const hmacRaw = crypto.createHmac("sha256", keyBufferRaw);
    hmacRaw.update(baseString);
    const signatureRaw = hmacRaw.digest("hex");

    // Method 3: Without shpk prefix removal
    const keyBufferOriginal = Buffer.from(partnerKey, "hex");
    const hmacOriginal = crypto.createHmac("sha256", keyBufferOriginal);
    hmacOriginal.update(baseString);
    const signatureOriginal = hmacOriginal.digest("hex");

    // Build final URL dengan method yang berbeda
    const baseUrl =
      process.env.SHOPEE_BASE_URL ||
      "https://partner.test-stable.shopeemobile.com";

    const urlHex = `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signatureHex}&redirect=${encodeURIComponent(
      redirectUrl
    )}`;
    const urlRaw = `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signatureRaw}&redirect=${encodeURIComponent(
      redirectUrl
    )}`;

    res.json({
      environment: {
        partnerId,
        partnerKeyLength: partnerKey.length,
        partnerKeyPrefix: partnerKey.substring(0, 4),
        redirectUrl,
        useMerchant,
        baseUrl,
      },
      signature: {
        timestamp,
        path,
        baseString,
        normalizedKey,
        keyLength: normalizedKey.length,
      },
      signatures: {
        hexMethod: signatureHex,
        rawMethod: signatureRaw,
        originalMethod: signatureOriginal,
      },
      testUrls: {
        hexMethod: urlHex,
        rawMethod: urlRaw,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
