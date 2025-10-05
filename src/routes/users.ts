import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";
import { authRequired, requireRole } from "../utils/auth";

const r = Router();
r.use(authRequired, requireRole("OWNER"));

// List staff
r.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: "STAFF" },
    select: { id: true, name: true, username: true, role: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ users });
});

// Create staff
r.post("/", async (req, res) => {
  const { name, username, password } = (req.body || {}) as { name?: string; username?: string; password?: string };
  if (!username || !password) return res.status(400).json({ error: "username dan password wajib" });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name: name || "Staff", username, password: hashed, role: "STAFF" },
      select: { id: true, name: true, username: true, role: true },
    });
    res.status(201).json({ user });
  } catch (e: any) {
    if (e?.code === "P2002") return res.status(409).json({ error: "username sudah terdaftar" });
    res.status(500).json({ error: "server error" });
  }
});

// Update staff (name/password)
r.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id invalid" });
  const { name, password } = (req.body || {}) as { name?: string; password?: string };
  const staff = await prisma.user.findUnique({ where: { id } });
  if (!staff || staff.role !== "STAFF") return res.status(404).json({ error: "staff tidak ditemukan" });

  const data: any = {};
  if (name) data.name = name;
  if (password) data.password = await bcrypt.hash(password, 10);
  const updated = await prisma.user.update({ where: { id }, data, select: { id: true, name: true, username: true, role: true } });
  res.json({ user: updated });
});

// Reset password (owner sets temp password) -> force change on next login
r.patch("/:id/password", async (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = (req.body || {}) as { newPassword?: string };
  if (!Number.isInteger(id) || !newPassword) return res.status(400).json({ error: "invalid" });

  const staff = await prisma.user.findUnique({ where: { id } });
  if (!staff || staff.role !== "STAFF") return res.status(404).json({ error: "staff tidak ditemukan" });

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { password: hashed } });
  res.json({ ok: true });
});

// Delete staff
r.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "id invalid" });

  const staff = await prisma.user.findUnique({ where: { id } });
  if (!staff || staff.role !== "STAFF") return res.status(404).json({ error: "staff tidak ditemukan" });

  await prisma.user.delete({ where: { id } });
  res.json({ ok: true });
});

export default r;
