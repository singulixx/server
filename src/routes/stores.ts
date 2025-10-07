import { Router } from "express";
import { prisma } from "../db.js";
import { authRequired } from "../utils/auth.js";
import { setCacheHeaders } from "../utils/cache.js"; // <-- pastikan ini ada

const router = Router();
router.use(authRequired);

// WAS: async (_req, res) => { ... setCacheHeaders(req, res, ...) ... }

router.get("/", async (req, res) => {
  const { limit, offset, skip } = req.query as any;
  const take = Math.min(Math.max(parseInt(String(limit)) || 50, 1), 100);
  const off = Number.isFinite(Number(offset)) ? Number(offset) : (Number(skip) || 0);
  const [items, total] = await Promise.all([
    prisma.store.findMany({ orderBy: { createdAt: "desc" }, take, skip: off }),
    prisma.store.count()
  ]);
  if (setCacheHeaders(req, res, items)) return;
  res.json({ items, total, limit: take, offset: off });
});

// sisanya boleh tetap sama
router.post("/", async (req, res) => {
  try {
    const { name, type } = req.body;
    if (!name || !type) return res.status(400).json({ error: "name & type required" });
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
    if (!store) return res.status(404).json({ connected: false, message: "Store not found" });

    const t = (store.type || "").toUpperCase();
    if (t !== "SHOPEE") return res.json({ connected: true, message: "Manual channel" });

    const connected = !!store.apiKey || (!!store.partnerId && !!store.secretKey);
    res.json({ connected });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ connected: false, message: "Status error" });
  }
});

export default router;