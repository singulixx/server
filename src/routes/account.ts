import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../utils/prisma";
import { authRequired, requireRole } from "../utils/auth";

const r = Router();

// Change own password (logged-in)
r.patch("/password", authRequired, async (req, res) => {
  const userId = (req as any).user.id as number;
  const { currentPassword, newPassword } = (req.body || {}) as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "field wajib" });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "user tidak ditemukan" });

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return res.status(400).json({ error: "password sekarang salah" });

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  res.json({ ok: true });
});

// Generate recovery codes (OWNER only) — show once on generate
r.post("/recovery-codes/generate", authRequired, requireRole("OWNER"), async (req, res) => {
  const uid = (req as any).user.id as number;
  // delete existing unused codes to avoid accumulation
  await prisma.recoveryCode.deleteMany({ where: { userId: uid, usedAt: null } });

  const rawCodes: string[] = Array.from({ length: 10 }, () => crypto.randomBytes(10).toString("base64url"));
  for (const raw of rawCodes) {
    const hash = await bcrypt.hash(raw, 10);
    await prisma.recoveryCode.create({ data: { userId: uid, codeHash: hash } });
  }
  res.json({ codes: rawCodes });
});

// Reset password using recovery code (OWNER only)
r.post("/recovery-reset", async (req, res) => {
  const { username, recoveryCode, newPassword } = (req.body || {}) as { email?: string; recoveryCode?: string; newPassword?: string };
  if (!username || !recoveryCode || !newPassword) return res.status(400).json({ error: "field wajib" });

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || user.role !== "OWNER") return res.status(400).json({ error: "tidak valid" });

  const recs = await prisma.recoveryCode.findMany({ where: { userId: user.id, usedAt: null }, orderBy: { createdAt: "desc" } });
  let matched: string | null = null;
  for (const rc of recs) {
    const ok = await bcrypt.compare(recoveryCode, rc.codeHash);
    if (ok) { matched = rc.id; break; }
  }
  if (!matched) return res.status(400).json({ error: "kode recovery tidak valid" });

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
    prisma.recoveryCode.update({ where: { id: matched }, data: { usedAt: new Date() } }),
  ]);

  res.json({ ok: true });
});

export default r;
