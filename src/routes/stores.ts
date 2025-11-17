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

// GANTI endpoint debug dengan yang lebih comprehensive
router.get("/debug/shopee-auth-comprehensive", async (req, res) => {
  try {
    const crypto = await import("node:crypto");

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const redirectUrl = process.env.SHOPEE_REDIRECT_URL;

    if (!partnerId || !partnerKey || !redirectUrl) {
      return res.status(400).json({
        error: "Missing environment variables",
        partnerId: !!partnerId,
        partnerKey: !!partnerKey,
        redirectUrl: !!redirectUrl,
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const path = "/api/v2/shop/auth_partner";
    const baseUrl =
      process.env.SHOPEE_BASE_URL ||
      "https://partner.test-stable.shopeemobile.com";

    // Test multiple signature methods
    const methods = [];

    // Method 1: HEX dengan length fix
    let normalized1 = partnerKey.replace(/^shpk/i, "").trim();
    if (normalized1.length % 2 !== 0) normalized1 = "0" + normalized1;
    const keyBuffer1 = Buffer.from(normalized1, "hex");
    const hmac1 = crypto.createHmac("sha256", keyBuffer1);
    hmac1.update(`${partnerId}${path}${timestamp}`);
    const sig1 = hmac1.digest("hex");
    methods.push({
      name: "hex_fixed_length",
      signature: sig1,
      url: `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sig1}&redirect=${encodeURIComponent(
        redirectUrl
      )}`,
    });

    // Method 2: HEX tanpa fix length
    const normalized2 = partnerKey.replace(/^shpk/i, "").trim();
    const keyBuffer2 = Buffer.from(normalized2, "hex");
    const hmac2 = crypto.createHmac("sha256", keyBuffer2);
    hmac2.update(`${partnerId}${path}${timestamp}`);
    const sig2 = hmac2.digest("hex");
    methods.push({
      name: "hex_original",
      signature: sig2,
      url: `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sig2}&redirect=${encodeURIComponent(
        redirectUrl
      )}`,
    });

    // Method 3: UTF-8 raw
    const keyBuffer3 = Buffer.from(partnerKey, "utf8");
    const hmac3 = crypto.createHmac("sha256", keyBuffer3);
    hmac3.update(`${partnerId}${path}${timestamp}`);
    const sig3 = hmac3.digest("hex");
    methods.push({
      name: "utf8_raw",
      signature: sig3,
      url: `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sig3}&redirect=${encodeURIComponent(
        redirectUrl
      )}`,
    });

    // Method 4: Dengan base64 (jarang digunakan, tapi coba saja)
    const keyBuffer4 = Buffer.from(partnerKey, "base64");
    const hmac4 = crypto.createHmac("sha256", keyBuffer4);
    hmac4.update(`${partnerId}${path}${timestamp}`);
    const sig4 = hmac4.digest("hex");
    methods.push({
      name: "base64",
      signature: sig4,
      url: `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sig4}&redirect=${encodeURIComponent(
        redirectUrl
      )}`,
    });

    res.json({
      debug: {
        partnerId,
        partnerKeyLength: partnerKey.length,
        normalizedKeyLength: normalized1.length,
        timestamp,
        path,
        baseString: `${partnerId}${path}${timestamp}`,
      },
      methods,
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

// Tambahkan di routes/stores.ts
router.get("/debug/shopee-signature-deep-dive", async (req, res) => {
  try {
    const crypto = await import("node:crypto");

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const redirectUrl = process.env.SHOPEE_REDIRECT_URL;

    if (!partnerId || !partnerKey || !redirectUrl) {
      return res.status(400).json({ error: "Missing env vars" });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const path = "/api/v2/shop/auth_partner";
    const baseUrl = "https://partner.test-stable.shopeemobile.com";

    // Test berbagai kemungkinan base string format
    const testCases = [
      {
        name: "standard",
        baseString: `${partnerId}${path}${timestamp}`,
        description: "partnerId + path + timestamp",
      },
      {
        name: "with_slash",
        baseString: `${partnerId}${path}${timestamp}`,
        description: "Same as standard",
      },
      {
        name: "with_query",
        baseString: `${partnerId}${path}${timestamp}${encodeURIComponent(
          redirectUrl
        )}`,
        description: "Includes redirect in base string",
      },
      {
        name: "reverse_order",
        baseString: `${path}${partnerId}${timestamp}`,
        description: "path + partnerId + timestamp",
      },
      {
        name: "timestamp_first",
        baseString: `${timestamp}${partnerId}${path}`,
        description: "timestamp + partnerId + path",
      },
    ];

    const results = [];
    const normalizedKey = partnerKey.replace(/^shpk/i, "").trim();

    for (const testCase of testCases) {
      try {
        const keyBuffer = Buffer.from(normalizedKey, "hex");
        const hmac = crypto.createHmac("sha256", keyBuffer);
        hmac.update(testCase.baseString);
        const signature = hmac.digest("hex");

        const testUrl = `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}&redirect=${encodeURIComponent(
          redirectUrl
        )}`;

        results.push({
          name: testCase.name,
          description: testCase.description,
          baseString: testCase.baseString,
          signature,
          url: testUrl,
        });
      } catch (error) {
        results.push({
          name: testCase.name,
          error: error.message,
        });
      }
    }

    // Juga test dengan partner key sebagai raw string (bukan HEX)
    try {
      const keyBuffer = Buffer.from(partnerKey, "utf8");
      const hmac = crypto.createHmac("sha256", keyBuffer);
      hmac.update(`${partnerId}${path}${timestamp}`);
      const rawSignature = hmac.digest("hex");

      results.push({
        name: "raw_utf8_key",
        description: "Partner key as UTF-8 string (not HEX)",
        baseString: `${partnerId}${path}${timestamp}`,
        signature: rawSignature,
        url: `${baseUrl}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${rawSignature}&redirect=${encodeURIComponent(
          redirectUrl
        )}`,
      });
    } catch (error) {
      results.push({
        name: "raw_utf8_key",
        error: error.message,
      });
    }

    res.json({
      environment: {
        partnerId,
        partnerKeyLength: partnerKey.length,
        normalizedKeyLength: normalizedKey.length,
        redirectUrl,
        timestamp,
      },
      testCases: results,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/debug/shopee-key-format", async (req, res) => {
  try {
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerKey) {
      return res.status(400).json({ error: "No partner key" });
    }

    const analyses = [];

    // Analysis 1: HEX pattern
    const hexRegex = /^[0-9a-fA-F]+$/;
    const isHex = hexRegex.test(partnerKey.replace(/^shpk/i, ""));
    analyses.push({
      type: "HEX",
      isValid: isHex,
      length: partnerKey.length,
      normalized: partnerKey.replace(/^shpk/i, ""),
    });

    // Analysis 2: Base64 pattern
    const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
    const isBase64 = base64Regex.test(partnerKey);
    analyses.push({
      type: "Base64",
      isValid: isBase64,
      length: partnerKey.length,
    });

    // Analysis 3: Raw string
    analyses.push({
      type: "Raw String",
      isValid: true,
      length: partnerKey.length,
      first10Chars: partnerKey.substring(0, 10),
    });

    // Test different decoding methods
    const decodingTests = [];

    try {
      const hexBuffer = Buffer.from(partnerKey.replace(/^shpk/i, ""), "hex");
      decodingTests.push({
        method: "HEX",
        success: true,
        bufferLength: hexBuffer.length,
        buffer: hexBuffer.toString("base64"),
      });
    } catch (e) {
      decodingTests.push({
        method: "HEX",
        success: false,
        error: e.message,
      });
    }

    try {
      const base64Buffer = Buffer.from(partnerKey, "base64");
      decodingTests.push({
        method: "Base64",
        success: true,
        bufferLength: base64Buffer.length,
        buffer: base64Buffer.toString("hex"),
      });
    } catch (e) {
      decodingTests.push({
        method: "Base64",
        success: false,
        error: e.message,
      });
    }

    try {
      const utf8Buffer = Buffer.from(partnerKey, "utf8");
      decodingTests.push({
        method: "UTF8",
        success: true,
        bufferLength: utf8Buffer.length,
        buffer: utf8Buffer.toString("hex"),
      });
    } catch (e) {
      decodingTests.push({
        method: "UTF8",
        success: false,
        error: e.message,
      });
    }

    res.json({
      originalKey: partnerKey.substring(0, 8) + "...",
      originalLength: partnerKey.length,
      analyses,
      decodingTests,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
// Di routes/stores.ts - endpoint untuk verify environment
router.get("/debug/verify-shopee-env", async (req, res) => {
  try {
    const crypto = await import("node:crypto");

    // Ambil dari environment
    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    const redirectUrl = process.env.SHOPEE_REDIRECT_URL;
    const baseUrl = process.env.SHOPEE_BASE_URL;

    console.log("🔍 Environment Variables:", {
      partnerId: partnerId ? `${partnerId.substring(0, 6)}...` : "MISSING",
      partnerKey: partnerKey ? `${partnerKey.substring(0, 12)}...` : "MISSING",
      redirectUrl: redirectUrl || "MISSING",
      baseUrl: baseUrl || "MISSING",
    });

    if (!partnerId || !partnerKey || !redirectUrl) {
      return res.status(400).json({
        error: "Missing environment variables",
        partnerId: !!partnerId,
        partnerKey: !!partnerKey,
        redirectUrl: !!redirectUrl,
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const path = "/api/v2/shop/auth_partner";

    // Process key
    let normalizedKey = partnerKey;
    if (partnerKey.toLowerCase().startsWith("shpk")) {
      normalizedKey = partnerKey.substring(4);
    }
    normalizedKey = normalizedKey.trim();

    if (normalizedKey.length % 2 !== 0) {
      normalizedKey = "0" + normalizedKey;
    }

    const baseString = `${partnerId}${path}${timestamp}`;
    const keyBuffer = Buffer.from(normalizedKey, "hex");
    const hmac = crypto.createHmac("sha256", keyBuffer);
    hmac.update(baseString);
    const signature = hmac.digest("hex");

    const authUrl = `${
      baseUrl || "https://partner.test-stable.shopeemobile.com"
    }${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${signature}&redirect=${encodeURIComponent(
      redirectUrl
    )}`;

    res.json({
      success: true,
      environment: {
        partnerId,
        partnerKeyPrefix: partnerKey.substring(0, 8),
        partnerKeyLength: partnerKey.length,
        normalizedKeyLength: normalizedKey.length,
        redirectUrl,
        baseUrl: baseUrl || "default",
      },
      signature: {
        timestamp,
        baseString,
        signature,
        keyBufferLength: keyBuffer.length,
      },
      authUrl,
    });
  } catch (error: any) {
    console.error("Verify env error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
export default router;
