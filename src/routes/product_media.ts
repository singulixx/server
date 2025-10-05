import { Router } from "express";
import { prisma } from "../db.js";
import { authRequired } from "../utils/auth.js";

const r = Router({ mergeParams: true });
r.use(authRequired);

// list media for a product
r.get("/:id/media", async (req, res) => {
  const id = Number(req.params.id);
  const media = await prisma.productMedia.findMany({ where: { productId: id } });
  res.json(media);
});

// attach media by URL
r.post("/:id/media", async (req, res) => {
  const id = Number(req.params.id);
  const { url, kind = "IMAGE" } = req.body || {};
  if (!url) return res.status(400).json({ error: "url wajib" });
  const created = await prisma.productMedia.create({ data: { productId: id, url, kind } });
  res.json(created);
});

// delete media
r.delete("/:id/media/:mediaId", async (req, res) => {
  const id = Number(req.params.id);
  const mediaId = Number(req.params.mediaId);
  await prisma.productMedia.delete({ where: { id: mediaId } });
  res.json({ ok: true });
});

export default r;
