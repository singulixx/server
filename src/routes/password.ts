import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma.js";
import { logAudit } from "../utils/audit.js";

const r = Router();

// Request reset: accepts { username }
r.post("/forgot", async (req, res) => {
  const { username } = (req.body || {}) as { username?: string };
  if (!username) return res.status(400).json({ error: "username wajib" });

  const user = await prisma.user.findUnique({ where: { username } });
  // Do not reveal if user exists
  if (user) {
    const raw = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordTokenHash: hash,
        resetPasswordExpiresAt: expiresAt,
        resetPasswordUsed: false,
      },
    });
    const payload: any = { ok: true };
    if ((process.env.NODE_ENV || "development") !== "production") {
      payload.devToken = raw;
    }
    await logAudit({
      actorId: user.id,
      actorRole: user.role as any,
      action: "auth.forgot",
      path: "/api/auth/forgot",
      method: "POST",
      metadata: { requestedFor: username },
    });
    return res.json(payload);
  }
  return res.json({ ok: true });
});

// Reset: { username, token, newPassword }
r.post("/reset", async (req, res) => {
  const { username, token, newPassword } = (req.body || {}) as { username?: string; token?: string; newPassword?: string };
  if (!username || !token || !newPassword) return res.status(400).json({ error: "field wajib" });

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.resetPasswordTokenHash || !user.resetPasswordExpiresAt) {
    return res.status(400).json({ error: "Token tidak valid" });
  }
  if (user.resetPasswordUsed) return res.status(400).json({ error: "Token sudah digunakan" });
  if (new Date(user.resetPasswordExpiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: "Token kadaluarsa" });
  }

  const hash = crypto.createHash("sha256").update(token).digest("hex");
  if (hash !== user.resetPasswordTokenHash) {
    return res.status(400).json({ error: "Token tidak valid" });
  }

  const password = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password,
      resetPasswordUsed: true,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
    },
  });

  await logAudit({
    actorId: user.id,
    actorRole: user.role as any,
    action: "auth.reset",
    path: "/api/auth/reset",
    method: "POST",
    metadata: { username },
  });

  res.json({ ok: true });
});

export default r;
