// server/src/routes/channels.ts
import { Router } from "express";
import { ShopeeService } from "../services/shopee.js";

const router = Router();

// GET auth URL
router.get("/shopee/auth-url/:shopId", (req, res) => {
  const url = ShopeeService.generateAuthUrl(req.params.shopId);
  res.json({ url });
});

// GET access token
router.get("/shopee/callback", async (req, res) => {
  const { code, shop_id } = req.query;

  const token = await ShopeeService.getAccessToken(String(code), String(shop_id));
  res.json(token);
});

// Refresh token
router.post("/shopee/refresh", async (req, res) => {
  const { refreshToken, shopId } = req.body;

  const token = await ShopeeService.refreshToken(refreshToken, shopId);
  res.json(token);
});

// Get orders
router.get("/shopee/orders/:shopId", async (req, res) => {
  const { shopId } = req.params;
  const { accessToken } = req.query;

  const orders = await ShopeeService.getOrders(String(accessToken), shopId);
  res.json(orders);
});

// Update stock
router.post("/shopee/stock", async (req, res) => {
  const { accessToken, shopId, itemId, stock } = req.body;

  const result = await ShopeeService.updateStock(
    accessToken,
    shopId,
    Number(itemId),
    Number(stock)
  );

  res.json(result);
});

export default router;
