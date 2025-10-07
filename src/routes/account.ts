// src/routes/account.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../utils/prisma.js";
import { authRequired, requireRole } from "../utils/auth.js";

const r = Router();

function rcModelOrNull() {
  // TypeScript: cast ke any hanya di sini supaya file tetap compile
  const anyPrisma = prisma as any;
  return anyPrisma.recoveryCode ?? null;
}

// Change own password (logged-in)
r.patch("/password", authRequired, async (req, res) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) return res.status(401).json({ error: "unauthorized" });

    const { currentPassword, newPassword } = (req.body || {}) as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "field wajib" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "user tidak ditemukan" });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ error: "password sekarang salah" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /password error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// Generate recovery codes (OWNER only) — show once on generate
r.post("/recovery-codes/generate", authRequired, requireRole("OWNER"), async (req, res) => {
  try {
    const uid = (req as any).user?.id as number | undefined;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const rc = rcModelOrNull();
    if (!rc) {
      console.error("Prisma model 'recoveryCode' not available on prisma client. Run `npx prisma generate` with the correct schema and ensure migrations are applied.");
      return res.status(500).json({ error: "recovery_code_model_missing" });
    }

    await rc.deleteMany({ where: { userId: uid, usedAt: null } });

    const rawCodes: string[] = Array.from({ length: 10 }, () => crypto.randomBytes(10).toString("base64url"));
    for (const raw of rawCodes) {
      const hash = await bcrypt.hash(raw, 10);
      await rc.create({ data: { userId: uid, codeHash: hash } });
    }
    res.json({ codes: rawCodes });
  } catch (e) {
    console.error("POST /recovery-codes/generate error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// Reset password using recovery code (OWNER only)
r.post("/recovery-reset", async (req, res) => {
  try {
    const { username, recoveryCode, newPassword } = (req.body || {}) as { username?: string; recoveryCode?: string; newPassword?: string };
    if (!username || !recoveryCode || !newPassword) return res.status(400).json({ error: "field wajib" });

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.role !== "OWNER") return res.status(400).json({ error: "tidak valid" });

    const rc = rcModelOrNull();
    if (!rc) {
      console.error("Prisma model 'recoveryCode' not available on prisma client. Run `npx prisma generate` with the correct schema and ensure migrations are applied.");
      return res.status(500).json({ error: "recovery_code_model_missing" });
    }

    const recs = await rc.findMany({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } });
    let matched: number | null = null;
    for (const rcRow of recs) {
      const ok = await bcrypt.compare(recoveryCode, rcRow.codeHash);
      if (ok) { matched = rcRow.id; break; }
    }
    if (!matched) return res.status(400).json({ error: "kode recovery tidak valid" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
      rc.update({ where: { id: matched }, data: { usedAt: new Date() } }),
    ]);

    res.json({ ok: true });
  } catch (e) {
    console.error("POST /recovery-reset error:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

export default r;
