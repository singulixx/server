// src/routes/balls.ts
import { Router } from "express";
import type { Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { prisma } from "../db.js";
import { authRequired } from "../utils/auth.js";
import { audit } from "../utils/audit.js";

const r = Router();

// Gunakan /tmp untuk serverless environment (seperti Vercel)
const isServerless = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
const uploadBase = isServerless ? os.tmpdir() : process.cwd();
const UPLOAD_DIR = path.join(uploadBase, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ABS_UPLOAD_DIR = UPLOAD_DIR;

// Auto-generate Ball code if not provided: BALL-YYYYMM-####
async function generateBallCode() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `BALL-${yyyy}${mm}-`;
  const last = await prisma.ball.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
    orderBy: { code: "desc" },
    take: 1,
  });

  let seq = 1;
  if (last.length > 0) {
    const m = last[0].code.match(/(\d{4})$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }

  let code: string;
  while (true) {
    code = `${prefix}${String(seq).padStart(4, "0")}`;
    const exists = await prisma.ball.findUnique({ where: { code } });
    if (!exists) break;
    seq++;
  }
  return code;
}

// Setup multer dengan storage disk dan validasi tipe file (image & pdf)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ABS_UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // max 10MB per file
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "application/pdf",
    ];
    if (allowedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Tipe file tidak didukung"));
  },
});

// Middleware auth
r.use(authRequired);

// Map status dari frontend ke Prisma enum
function mapStatus(feStatus: string): "UNOPENED" | "OPENED" | "SORTED" {
  switch (feStatus) {
    case "BELUM_DIBUKA":
      return "UNOPENED";
    case "DIBUKA":
      return "OPENED";
    case "SELESAI_SORTIR":
      return "SORTED";
    default:
      return "UNOPENED";
  }
}

// ---------- CREATE ----------
r.post("/", upload.array("nota", 5), async (req, res) => {
  try {
    const u = (req as any).user;
    const { code, asal, kategori, supplier, beratKg, hargaBeli, status } = req.body;

    if (!asal || !kategori || !supplier) {
      return res.status(400).json({ error: "asal, kategori, supplier wajib diisi" });
    }

    const weight = parseFloat(beratKg);
    const buy = Number(hargaBeli);
    if (!(weight > 0) || !(buy > 0)) {
      return res.status(400).json({ error: "beratKg & hargaBeli harus > 0" });
    }

    // Jika code diisi manual, pastikan unik
    if (typeof code !== "undefined" && String(code).trim().length) {
      const codeTrim = String(code).trim();
      const dup = await prisma.ball.findUnique({ where: { code: codeTrim } });
      if (dup) {
        return res.status(400).json({ error: "Code sudah digunakan" });
      }
    }

    const finalCode =
      code && String(code).trim().length
        ? String(code).trim()
        : await generateBallCode();

    // File url array
    const docUrls =
      req.files && Array.isArray(req.files)
        ? (req.files as Express.Multer.File[]).map(
            (file) => `/uploads/${file.filename}`
          )
        : [];

    const created = await prisma.ball.create({
      data: {
        code: finalCode,
        origin: asal,
        category: kategori,
        supplier,
        weightKg: weight,
        buyPrice: buy,
        status: mapStatus(status),
        docUrl: docUrls.length > 0 ? JSON.stringify(docUrls) : null,
        createdBy: u?.id ?? null,
      },
    });

    await audit(u?.id ?? null, "CREATE", "Ball", created.id, {
      code: finalCode,
      asal,
      kategori,
      supplier,
      beratKg: weight,
      hargaBeli: buy,
      status,
      docUrl: created.docUrl,
    });

    res.json(created);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(400).json({ error: "Code sudah digunakan" });
    }
    console.error("❌ Create Ball error:", err);
    res.status(400).json({ error: err?.message || "Gagal membuat Ball" });
  }
});

// ---------- UPDATE ----------
r.put("/:id", upload.array("nota", 5), async (req, res) => {
  try {
    const u = (req as any).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "ID tidak valid" });

    const { code, asal, kategori, supplier, beratKg, hargaBeli, status } =
      req.body;

    // Lock perubahan code
    if (typeof code !== "undefined") {
      const existing = await prisma.ball.findUnique({ where: { id } });
      if (!existing)
        return res.status(404).json({ error: "Ball tidak ditemukan" });
      if (String(code).trim() !== existing.code) {
        return res.status(400).json({ error: "Perubahan 'code' tidak diizinkan" });
      }
    }

    const data: any = {};
    if (asal) data.origin = asal;
    if (kategori) data.category = kategori;
    if (supplier) data.supplier = supplier;

    if (beratKg) {
      const w = parseFloat(beratKg);
      if (!(w > 0)) return res.status(400).json({ error: "beratKg harus > 0" });
      data.weightKg = w;
    }

    if (hargaBeli) {
      const b = Number(hargaBeli);
      if (!(b > 0))
        return res.status(400).json({ error: "hargaBeli harus > 0" });
      data.buyPrice = b;
    }

    if (status) data.status = mapStatus(status as string);

    if (req.files && Array.isArray(req.files)) {
      const fileUrls = (req.files as Express.Multer.File[]).map(
        (file) => `/uploads/${file.filename}`
      );
      data.docUrl = JSON.stringify(fileUrls);
    }

    data.updatedBy = u?.id ?? null;

    const updated = await prisma.ball.update({
      where: { id },
      data,
    });

    await audit(u?.id ?? null, "UPDATE", "Ball", id, data);
    res.json(updated);
  } catch (err: any) {
    console.error("❌ Update Ball error:", err);
    res.status(400).json({ error: err?.message || "Gagal update Ball" });
  }
});

// ---------- LIST ----------
r.get("/", async (req, res) => {
  try {
    const { status, origin, supplier, limit, offset, skip } = req.query as any;
    const where: any = {};
    if (status) where.status = String(status).toUpperCase();
    if (origin) where.origin = String(origin);
    if (supplier) where.supplier = String(supplier);

    const take = Math.min(Math.max(parseInt(String(limit)) || 20, 1), 100);
    const off = Number.isFinite(Number(offset)) ? Number(offset) : (Number(skip) || 0);

    const [items, total] = await Promise.all([
      prisma.ball.findMany({ where, orderBy: { createdAt: "desc" }, take, skip: off }),
      prisma.ball.count({ where }),
    ]);

    return res.json({ items, total, limit: take, offset: off });
  } catch (e: any) {
    console.error("❌ List Balls error:", e);
    return (res as any).error(String(e.message || "Gagal mengambil data Ball"));
  }
});

// ---------- CATEGORIES ----------
r.get("/categories", async (_req, res) => {
  try {
    const categories = await prisma.ball.findMany({
      select: { category: true },
      distinct: ["category"],
    });
    const categoryList = categories.map((c) => c.category);
    res.json(categoryList);
  } catch (error) {
    console.error("❌ Error get categories:", error);
    return (res as any).error(String("Gagal mengambil data kategori"));
  }
});

// ---------- GET BY ID ----------
r.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "ID tidak valid" });

    const b = await prisma.ball.findUnique({ where: { id } });
    if (!b) return res.status(404).json({ error: "Not found" });
    return res.json(b);
  } catch (err: any) {
    console.error("❌ Get Ball error:", err);
    return (res as any).error(String("Gagal mengambil Ball"));
  }
});

// ---------- UPDATE DOCS ----------
r.put("/:id/docs", async (req, res) => {
  try {
    const u = (req as any).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "ID tidak valid" });

    const { docUrls } = req.body || {};
    if (!Array.isArray(docUrls))
      return res.status(400).json({ error: "docUrls harus array" });

    const updated = await prisma.ball.update({
      where: { id },
      data: { docUrl: JSON.stringify(docUrls), updatedBy: u?.id ?? null },
    });
    await audit(u?.id ?? null, "UPDATE", "Ball", id, { docUrls });
    return res.json(updated);
  } catch (err: any) {
    console.error("❌ Update Ball docs error:", err);
    return res.status(400).json({ error: err?.message || "Gagal update dokumen Ball" });
  }
});

// ---------- DELETE DOC ----------
r.delete("/:id/docs", async (req, res) => {
  try {
    const u = (req as any).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "ID tidak valid" });

    const url =
      (req.query.url as string) || (req.body && (req.body as any).url);
    if (!url) return res.status(400).json({ error: "url wajib diisi" });

    const b = await prisma.ball.findUnique({ where: { id } });
    if (!b) return res.status(404).json({ error: "Not found" });

    let list: string[] = [];
    try {
      const parsed = JSON.parse(b.docUrl || "[]");
      if (Array.isArray(parsed)) list = parsed;
      else if (typeof parsed === "string" && parsed) list = [parsed];
    } catch {
      if (b.docUrl) list = [b.docUrl];
    }

    const next = list.filter((u0) => u0 !== url);
    const updated = await prisma.ball.update({
      where: { id },
      data: {
        docUrl: next.length ? JSON.stringify(next) : null,
        updatedBy: u?.id ?? null,
      },
    });

    await audit(u?.id ?? null, "DELETE", "BallDoc", id, { url });
    return res.json(updated);
  } catch (err: any) {
    console.error("❌ Delete Ball doc error:", err);
    return res.status(400).json({ error: err?.message || "Gagal hapus dokumen Ball" });
  }
});

// ---------- DELETE BALL ----------
r.delete("/:id", async (req, res) => {
  try {
    const u = (req as any).user;
    const id = Number(req.params.id);
    if (Number.isNaN(id))
      return res.status(400).json({ error: "ID tidak valid" });

    const old = await prisma.ball.findUnique({ where: { id } });
    if (!old) return res.status(404).json({ error: "Not found" });

    await prisma.ball.update({
      where: { id },
      data: { code: old.code + "-DELETED" },
    });

    await audit(u?.id ?? null, "DELETE", "Ball", id);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("❌ Delete Ball error:", err);
    res.status(400).json({ error: err?.message || "Gagal menghapus Ball" });
  }
});

export default r;
