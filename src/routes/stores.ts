import { Router, Request, Response } from "express";
import { ShopeeService } from "../services/shopee.js";

const router = Router();

router.get("/shopee/auth", async (req: Request, res: Response) => {
  try {
    const url = ShopeeService.generateAuthUrl();
    res.json({ url });
  } catch (err) {
    console.error("Shopee auth error:", err);
    res.status(500).json({ error: "Failed to generate URL" });
  }
});

router.get("/shopee/callback", async (req: Request, res: Response) => {
  try {
    const { code, shop_id } = req.query;

    if (!code || !shop_id) {
      return res.status(400).json({ error: "Missing code or shop_id" });
    }

    const result = await ShopeeService.getAccessToken(
      code as string,
      Number(shop_id)
    );

    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error("Shopee callback error:", err?.response?.data || err);
    res.status(500).json({
      error: "Callback failed",
      details: err?.response?.data,
    });
  }
});

export default router;
