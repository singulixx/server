import { Router, Request, Response } from "express";
import { ShopeeService } from "../services/shopee.js";

const router = Router();

/**
 * STEP 1 — Generate Shopee Auth URL
 */
router.get("/shopee/auth", async (req: Request, res: Response) => {
  try {
    let shopIdRaw = req.query.shop_id ?? req.query.shopId ?? "0";

    // Normalisasi agar selalu string tunggal
    if (Array.isArray(shopIdRaw)) {
      shopIdRaw = shopIdRaw[0];
    }

    const shopId: string = String(shopIdRaw);

    const url = ShopeeService.generateAuthUrl(shopId);
    res.json({ url });
  } catch (err) {
    console.error("Shopee auth error:", err);
    res.status(500).json({ error: "Failed to generate URL" });
  }
});

/**
 * STEP 2 — Callback for exchanging code → tokens
 */
router.get("/shopee/callback", async (req: Request, res: Response) => {
  try {
    let { code, shop_id } = req.query;

    // Normalize code
    if (Array.isArray(code)) code = code[0];
    if (!code) return res.status(400).json({ error: "Missing code" });

    // Normalize shop_id
    if (Array.isArray(shop_id)) shop_id = shop_id[0];
    if (!shop_id) return res.status(400).json({ error: "Missing shop_id" });

    const result = await ShopeeService.getAccessToken(
      String(code),
      String(shop_id)
    );

    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Shopee callback error:", err?.response?.data || err);

    res.status(500).json({
      error: "Callback failed",
      details: err?.response?.data || err?.message,
    });
  }
});

export default router;
