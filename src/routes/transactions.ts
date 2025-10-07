// src/routes/transactions.ts
import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { authRequired } from "../utils/auth.js";

const r = Router();
r.use(authRequired);

// Helpers
function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

r.get("/", async (req: Request, res: Response) => {
  try {
    const q: any = req.query || {};
    const limit = Number.isFinite(Number(q.limit)) ? Number(q.limit) : 20;
    const offset = Number.isFinite(Number(q.offset))
      ? Number(q.offset)
      : Number.isFinite(Number(q.skip))
      ? Number(q.skip)
      : 0;

    const where: any = { deletedAt: null };

    // date range
    if (q.from || q.to) {
      where.occurredAt = {};
      if (q.from) where.occurredAt.gte = new Date(String(q.from) + "T00:00:00.000Z");
      if (q.to) where.occurredAt.lte = new Date(String(q.to) + "T23:59:59.999Z");
    }

    // filters
    if (q.storeId) where.storeId = Number(q.storeId);
    if (q.channelId) where.channelAccountId = Number(q.channelId);
    if (q.search) {
      const s = String(q.search);
      where.OR = [
        { product: { name: { contains: s, mode: "insensitive" } } },
        { store: { name: { contains: s, mode: "insensitive" } } },
        { note: { contains: s, mode: "insensitive" } }, // if note exists in relation—no runtime problem for query
      ];
    }

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        skip: offset,
        take: limit,
        where,
        orderBy: { occurredAt: "desc" },
        include: {
          product: { select: { id: true, name: true } },
          store: { select: { id: true, name: true, type: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ items, total });
  } catch (err: any) {
    console.error("❌ List transactions error:", err);
    res.status(400).json({ error: err?.message || "Gagal mengambil transaksi" });
  }
});

r.post("/", async (req: Request, res: Response) => {
  try {
    const u = (req as any).user;
    const { storeId, productId, qty, unitPrice } = req.body || {};

    const sId = toNum(storeId);
    const pId = toNum(productId);
    const q = toNum(qty);
    const price = toNum(unitPrice);

    // Block selling products derived from balls unless explicitly allowed
    try {
      const prod = await prisma.product.findUnique({ where: { id: pId } });
      const allow = String(process.env.ALLOW_SELL_SORTED_PRODUCTS || "false").toLowerCase() === "true";
      if (prod && prod.ballId && !allow) {
        return res.status(400).json({ error: "Produk hasil sortir (berasal dari BALL) tidak boleh dijual dari menu ini." });
      }
    } catch {}

    if (!sId || !pId || !q) return res.status(400).json({ error: "storeId, productId, qty wajib" });
    if (!(q > 0)) return res.status(400).json({ error: "qty harus > 0" });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "unitPrice tidak valid" });

    const product = await prisma.product.findUnique({ where: { id: pId } });
    if (!product) return res.status(404).json({ error: "Product not found" });
    if ((product.stock ?? 0) < q) return res.status(400).json({ error: "Stok tidak cukup" });

    const totalPrice = price * q;

    const created = await prisma.$transaction(async (tx) => {
      // Resolve channel account
      let channelAccountId: number | null = null;
      if (req.body?.channelAccountId) {
        channelAccountId = Number(req.body.channelAccountId);
      }

      if (!channelAccountId) {
        // fallback: try to resolve platform string from req.body.channel (if provided)
        const platformRaw = req.body?.channel ? String(req.body.channel).toUpperCase() : "OFFLINE";
        // find active channel account by platform (if any)
        const existing = await tx.channelAccount.findFirst({ where: { platform: platformRaw as any, active: true } });
        if (existing) {
          channelAccountId = existing.id;
        } else if (platformRaw === "OFFLINE") {
          const createdCh = await tx.channelAccount.create({ data: { platform: "OFFLINE", label: "Offline", credentials: {} } });
          channelAccountId = createdCh.id;
        } else {
          // if platform provided but no channel found, fail explicitly
          throw new Error("Channel account not found for platform " + platformRaw);
        }
      }

      const t = await tx.transaction.create({
        data: {
          storeId: sId ?? null,
          productId: pId,
          channelAccountId,
          qty: q,
          unitPrice: price,
          totalPrice,
          occurredAt: req.body?.occurredAt ? new Date(req.body.occurredAt) : new Date(),
          status: "paid",
          priceType: "UNIT",
        },
      });

      // Decrement stock
      await tx.product.update({
        where: { id: pId },
        data: { stock: { decrement: q } },
      });
      return t;
    });

    res.json(created);
  } catch (err: any) {
    console.error("❌ Create transaction error:", err);
    res.status(400).json({ error: err?.message || "Gagal menyimpan transaksi" });
  }
});

r.put("/:id", async (req: Request, res: Response) => {
  try {
    const u = (req as any).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });

    const { qty, unitPrice, occurredAt } = req.body || {};
    const newQty = toNum(qty);
    const newPrice = toNum(unitPrice);

    const updated = await prisma.$transaction(async (tx) => {
      const old = await tx.transaction.findUnique({ where: { id } });
      if (!old) throw new Error("Transaksi tidak ditemukan");

      const product = await tx.product.findUnique({ where: { id: old.productId } });
      if (!product) throw new Error("Product not found");

      let nextQty = Number.isFinite(newQty) && newQty > 0 ? newQty : old.qty;
      let nextPrice = Number.isFinite(newPrice) && newPrice >= 0 ? newPrice : old.unitPrice;

      // adjust stock by diff
      const diff = nextQty - old.qty;
      if (diff > 0) {
        if ((product.stock ?? 0) < diff) throw new Error("Stok tidak cukup untuk perubahan qty");
        await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: diff } } });
      } else if (diff < 0) {
        await tx.product.update({ where: { id: product.id }, data: { stock: { increment: Math.abs(diff) } } });
      }

      const t = await tx.transaction.update({
        where: { id },
        data: {
          qty: nextQty,
          unitPrice: nextPrice,
          totalPrice: nextQty * nextPrice,
          occurredAt: occurredAt ? new Date(occurredAt) : old.occurredAt,
          // no customer/note/channel/updatedById fields used because not present in schema
        },
      });

      return t;
    });

    res.json(updated);
  } catch (err: any) {
    console.error("❌ Update transaction error:", err);
    res.status(400).json({ error: err?.message || "Gagal update transaksi" });
  }
});

r.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });

    await prisma.$transaction(async (tx) => {
      const t = await tx.transaction.findUnique({ where: { id } });
      if (!t) throw new Error("Transaksi tidak ditemukan");

      // return stock
      await tx.product.update({
        where: { id: t.productId },
        data: { stock: { increment: t.qty } },
      });

      await tx.transaction.delete({ where: { id } });
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error("❌ Delete transaction error:", err);
    res.status(400).json({ error: err?.message || "Gagal menghapus transaksi" });
  }
});

export default r;
