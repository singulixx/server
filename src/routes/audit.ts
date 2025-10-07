import { Router } from "express";
import prisma from "../utils/prisma.js";
import { authRequired, requireRole } from "../utils/auth.js";

const r = Router();
r.use(authRequired, requireRole("OWNER"));

// GET /api/audit?actorId=&action=&from=&to=&limit=
r.get("/", async (req, res) => {
  const { actorId, action, from, to, limit } = req.query as any;
  const take = Math.min(Number(limit) || 100, 500);
  const where: any = {};
  if (actorId) where.actorId = Number(actorId);
  if (action) where.action = { contains: String(action), mode: "insensitive" };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(String(from));
    if (to) where.createdAt.lte = new Date(String(to));
  }
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
  });
  res.json({ logs });
});

export default r;
