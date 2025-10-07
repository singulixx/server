import { Router } from "express";
import { authRequired } from "../utils/auth.js";
import { prisma } from "../db.js";

const router = Router();

// Protect all routes
router.use(authRequired);

// Simple sales report that can be filtered by storeId and date range
router.get("/sales", async (req, res) => {
  try {
    const { storeId, from, to } = req.query as any;

    const where: any = {};
    if (storeId) where.storeId = Number(storeId);
    if (from || to) where.occurredAt = {}; // Gunakan occurredAt bukan date
    if (from) where.occurredAt.gte = new Date(String(from));
    if (to) where.occurredAt.lte = new Date(String(to));

    const sales = await prisma.transaction.findMany({
      where,
      include: {
        product: true,
        store: true,
        channel: true, // Include channel relation jika diperlukan
      },
      orderBy: { occurredAt: "desc" }, // Gunakan occurredAt bukan date
    });

    // Aggregate summary - Perbaiki perhitungan total
    const total = sales.reduce(
      (acc: number, transaction: any) => acc + transaction.totalPrice,
      0
    );

    res.json({
      totalSalesAmount: total,
      count: sales.length,
      rows: sales,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch sales report" });
  }
});

export default router;
