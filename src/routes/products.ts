// src/routes/products.ts
import { Router } from "express";
import { prisma } from "../db.js";
import { authRequired } from "../utils/auth.js";
import { audit } from "../utils/audit.js";

const r = Router();

// Perf helpers
function parsePaging(req: any) {
  const limit = Math.min(
    Math.max(parseInt(req.query.limit as string) || 50, 1),
    100
  );
  const skip = Math.max(parseInt(req.query.skip as string) || 0, 0);
  return { take: limit, skip };
}
import crypto from "crypto";
function setCacheHeaders(req: any, res: any, payload: any) {
  const body = JSON.stringify(payload);
  const etag = '"' + crypto.createHash("sha1").update(body).digest("hex") + '"';
  res.setHeader(
    "Cache-Control",
    "private, max-age=30, stale-while-revalidate=60"
  );
  res.setHeader("ETag", etag);
  const inm = req.headers["if-none-match"];
  if (inm && inm === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

r.use(authRequired);

// List products (include ball + media, flatten ballCode)

r.get("/", async (req, res) => {
  try {
    const { take: limitTake, skip } = parsePaging(req);
    const where: any = { isDeleted: false };
    // filter by kind: manual (ballId null) | sortir (ballId not null)
    const kind = String((req.query.kind ?? "") as string).toLowerCase();
    if (kind === "manual") where.ballId = null;
    if (kind === "sortir") where.ballId = { not: null };
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { media: true, ball: { select: { code: true } } },
        orderBy: { createdAt: "desc" },
        take: limitTake,
        skip,
      }),
      prisma.product.count({ where }),
    ]);
    const shaped = rows.map((p: any) => {
      const { ball, ...rest } = p;
      return { ...rest, ballCode: ball?.code ?? null };
    });
    res.json({ items: shaped, total, limit: limitTake, offset: skip });
  } catch (err: any) {
    console.error("❌ List products error:", err);
    res.status(400).json({ error: err?.message || "Gagal mengambil produk" });
  }
});

// Get one
r.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "ID tidak valid" });

    const p = await prisma.product.findUnique({
      where: { id },
      include: { media: true, ball: { select: { code: true } } },
    });

    if (!p || (p as any).isDeleted)
      return res.status(404).json({ error: "Not found" });

    const { ball, ...rest } = p as any;
    res.json({ ...rest, ballCode: ball?.code ?? null });
  } catch (err: any) {
    console.error("❌ Get product error:", err);
    return (res as any).error(String(err?.message || "Gagal mengambil produk"));
  }
});

// Create product (manual)
r.post("/", async (req, res) => {
  try {
    const u = (req as any).user;

    // Pisahkan media dari payload utama
    const body = (req.body || {}) as any;
    const media = Array.isArray(body.media) ? body.media : [];
    const { media: _omit, ...data } = body;

    // Minimal validasi nama (sesuaikan dgn schema kamu)
    if (!data.name) return res.status(400).json({ error: "name wajib diisi" });

    const created = await prisma.product.create({
      data,
    });

    // attach media jika ada
    if (Array.isArray(media) && media.length) {
      for (const m of media) {
        if (!m?.url) continue;
        await prisma.productMedia.create({
          data: {
            productId: created.id,
            url: m.url,
            kind: m.kind || "IMAGE",
          },
        });
      }
    }

    await audit(u?.id ?? null, "CREATE", "Product", created.id, {
      name: data.name,
    });
    res.json(created);
  } catch (err: any) {
    console.error("❌ Create product error:", err);
    res.status(400).json({ error: err?.message || "Gagal membuat produk" });
  }
});

// Update product
r.put("/:id", async (req, res) => {
  try {
    const u = (req as any).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "ID tidak valid" });

    const body = (req.body || {}) as any;
    const media = Array.isArray(body.media) ? body.media : [];
    const { media: _omit, ...data } = body;

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    // optionally attach media on update (append)
    if (Array.isArray(media) && media.length) {
      for (const m of media) {
        if (!m?.url) continue;
        await prisma.productMedia.create({
          data: { productId: id, url: m.url, kind: m.kind || "IMAGE" },
        });
      }
    }

    await audit(u?.id ?? null, "UPDATE", "Product", id, data);
    res.json(updated);
  } catch (err: any) {
    console.error("❌ Update product error:", err);
    res.status(400).json({ error: err?.message || "Gagal mengubah produk" });
  }
});

// Soft delete
r.delete("/:id", async (req, res) => {
  try {
    const u = (req as any).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "ID tidak valid" });

    await prisma.product.update({
      where: { id },
      data: { isDeleted: true },
    });

    await audit(u?.id ?? null, "DELETE", "Product", id, {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("❌ Delete product error:", err);
    res.status(400).json({ error: err?.message || "Gagal menghapus produk" });
  }
});

export default r;
