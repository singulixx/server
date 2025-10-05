import { Router } from "express";
import { prisma } from "../db.js";
import { authRequired } from "../utils/auth.js";
import { audit } from "../utils/audit.js";

const r = Router();
r.use(authRequired);

type PurchaseType = "UNIT" | "BULK" | "KG";

interface NewItem {
  productId?: number;
  newProduct?: {
    name: string;
    category: string;
    grade: string;
    pricePcs?: number | null;
    priceBulk?: number | null;
    priceKg?: number | null;
  };
  qtyOrKg: number;
  buyPrice: number;
}

r.post("/", async (req, res) => {
  const u = (req as any).user as { id: number };
  const { supplier, purchaseType, occurredAt, note, docUrl, items } = req.body || {};

  if (!purchaseType || !["UNIT","BULK","KG"].includes(purchaseType)) {
    return res.status(400).json({ error: "purchaseType harus UNIT/BULK/KG" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items wajib diisi" });
  }
  for (const it of items as NewItem[]) {
    if (!it.qtyOrKg || it.qtyOrKg <= 0) return res.status(400).json({ error: "qtyOrKg harus > 0" });
    if (it.buyPrice == null || it.buyPrice < 0) return res.status(400).json({ error: "buyPrice tidak valid" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const procurement = await tx.procurement.create({
        data: { supplier, purchaseType, occurredAt: occurredAt ? new Date(occurredAt) : new Date(), note, docUrl, createdBy: u.id }
      });

      for (const it of items as NewItem[]) {
        let productId = it.productId;
        if (!productId) {
          if (!it.newProduct) throw new Error("newProduct wajib untuk item tanpa productId");
          const created = await tx.product.create({
            data: {
              name: it.newProduct.name,
              category: it.newProduct.category,
              grade: it.newProduct.grade,
              pricePcs: it.newProduct.pricePcs ?? null,
              priceBulk: it.newProduct.priceBulk ?? null,
              priceKg: it.newProduct.priceKg ?? null,
              stock: 0,
              lastBuyPrice: it.buyPrice,
              lastPurchaseType: purchaseType
            }
          });
          productId = created.id;
        } else {
          await tx.product.update({
            where: { id: productId },
            data: { lastBuyPrice: it.buyPrice, lastPurchaseType: purchaseType }
          });
        }

        await tx.procurementItem.create({
          data: {
            procurementId: procurement.id,
            productId,
            qtyOrKg: it.qtyOrKg,
            buyPrice: it.buyPrice,
            subtotal: it.qtyOrKg * it.buyPrice
          }
        });

        await tx.product.update({
          where: { id: productId },
          data: { stock: { increment: it.qtyOrKg } }
        });
      }

      await audit(u.id, "CREATE", "Procurement", undefined, { supplier, purchaseType });
      return procurement;
    });

    const withItems = await prisma.procurement.findUnique({
      where: { id: result.id },
      include: { items: { include: { product: true } } }
    });
    res.json(withItems);
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

// list with filters

r.get("/", async (req, res) => {
  const { supplier, purchaseType, startDate, endDate, limit, offset, skip } = req.query as any;
  const where:any = { deletedAt: null };
  if (supplier) where.supplier = supplier;
  if (purchaseType) where.purchaseType = purchaseType;
  if (startDate || endDate) {
    where.occurredAt = {};
    if (startDate) where.occurredAt.gte = new Date(String(startDate));
    if (endDate) where.occurredAt.lte = new Date(String(endDate));
  }

  const take = Math.min(Math.max(parseInt(String(limit)) || 20, 1), 100);
  const off = Number.isFinite(Number(offset)) ? Number(offset) : (Number(skip) || 0);

  const [items, total] = await Promise.all([
    prisma.procurement.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      include: { items: { include: { product: true } } },
      take, skip: off
    }),
    prisma.procurement.count({ where }),
  ]);
  res.json({ items, total, limit: take, offset: off });
});

// detail
r.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const row = await prisma.procurement.findUnique({
    where: { id },
    include: { items: { include: { product: true } }, user: { select: { id: true, username: true, name: true } } }
  });
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// update: replace items and adjust stock safely
r.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const u = (req as any).user as { id: number };
  const { supplier, purchaseType, occurredAt, note, docUrl, items } = req.body || {};

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.procurement.findUnique({
        where: { id },
        include: { items: true }
      });
      if (!existing || existing.deletedAt) throw new Error("Procurement tidak ditemukan / sudah dihapus");

      // rollback existing stock
      for (const it of existing.items) {
        await tx.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.qtyOrKg } } });
      }
      // remove existing items
      await tx.procurementItem.deleteMany({ where: { procurementId: id } });

      // update header
      await tx.procurement.update({
        where: { id },
        data: {
          supplier,
          purchaseType,
          occurredAt: occurredAt ? new Date(occurredAt) : existing.occurredAt,
          note,
          docUrl
        }
      });

      // insert new items
      for (const it of (items || []) as NewItem[]) {
        let productId = it.productId;
        if (!productId) {
          if (!it.newProduct) throw new Error("newProduct wajib untuk item tanpa productId");
          const created = await tx.product.create({
            data: {
              name: it.newProduct.name,
              category: it.newProduct.category,
              grade: it.newProduct.grade,
              pricePcs: it.newProduct.pricePcs ?? null,
              priceBulk: it.newProduct.priceBulk ?? null,
              priceKg: it.newProduct.priceKg ?? null,
              stock: 0,
              lastBuyPrice: it.buyPrice,
              lastPurchaseType: purchaseType
            }
          });
          productId = created.id;
        } else {
          await tx.product.update({
            where: { id: productId },
            data: { lastBuyPrice: it.buyPrice, lastPurchaseType: purchaseType }
          });
        }

        await tx.procurementItem.create({
          data: {
            procurementId: id,
            productId,
            qtyOrKg: it.qtyOrKg,
            buyPrice: it.buyPrice,
            subtotal: it.qtyOrKg * it.buyPrice
          }
        });

        await tx.product.update({ where: { id: productId }, data: { stock: { increment: it.qtyOrKg } } });
      }

      await audit(u.id, "UPDATE", "Procurement", id, {});
      return true;
    });
    const refreshed = await prisma.procurement.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
    res.json(refreshed);
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

// soft delete + rollback
r.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const u = (req as any).user as { id: number };
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.procurement.findUnique({ where: { id }, include: { items: true } });
      if (!existing || existing.deletedAt) throw new Error("Tidak ditemukan / sudah terhapus");
      for (const it of existing.items) {
        await tx.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.qtyOrKg } } });
      }
      await tx.procurement.update({ where: { id }, data: { deletedAt: new Date() } });
    });
    await audit(u.id, "DELETE", "Procurement", id, {});
    res.json({ ok: true });
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

export default r;