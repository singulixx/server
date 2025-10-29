import { Router } from "express";
import { prisma } from "../db.js";
import { authRequired } from "../utils/auth.js";
import { audit } from "../utils/audit.js";

interface ProductData {
  name: string;
  category: string;
  grade: string;
  stock: number;
  ballId: number;
}

const r = Router();

async function recomputeBallTotal(ballId: number) {
  const sums = await prisma.sortSession.aggregate({
    where: { ballId },
    _sum: { gradeA: true, gradeB: true, reject: true },
  });
  const ga = sums._sum.gradeA ?? 0;
  const gb = sums._sum.gradeB ?? 0;
  const rj = sums._sum.reject ?? 0;
  const total = ga + gb + rj;
  await prisma.ball.update({ where: { id: ballId }, data: { totalPcsOpened: total } });
  return total;
}

r.use(authRequired);

// POST berdasarkan ball code
r.post("/:code", async (req, res) => {
  const u = (req as any).user;
  const code = req.params.code;
  const { gradeA, gradeB, reject } = req.body;

  // Cari ball berdasar code
  const ball = await prisma.ball.findUnique({ where: { code } });
  if (!ball) return res.status(404).json({ error: "Ball not found" });

  const sort = await prisma.sortSession.create({
    data: {
      ballId: ball.id,
      gradeA: gradeA ?? 0,
      gradeB: gradeB ?? 0,
      reject: reject ?? 0,
      userId: u.id,
    },
  });

  // Generate products
  const productsData: ProductData[] = [];

  if (gradeA && gradeA > 0) {
    productsData.push({
      name: `${ball.category} - A - ${ball.code}`,
      category: ball.category,
      grade: "A",
      stock: gradeA,
      ballId: ball.id,
    });
  }
  if (gradeB && gradeB > 0) {
    productsData.push({
      name: `${ball.category} - B - ${ball.code}`,
      category: ball.category,
      grade: "B",
      stock: gradeB,
      ballId: ball.id,
    });
  }
  if (reject && reject > 0) {
    productsData.push({
      name: `${ball.category} - REJECT - ${ball.code}`,
      category: ball.category,
      grade: "REJECT",
      stock: reject,
      ballId: ball.id,
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const ps = await Promise.all(
      productsData.map((p) => tx.product.create({ data: p }))
    );
    await tx.ball.update({
      where: { id: ball.id },
      data: { status: "SORTED" },
    });
    return ps;
  });

  await audit(u.id, "SORT", "Ball", ball.id, {
    gradeA,
    gradeB,
    reject,
    products: created.map((p) => p.id),
  });
  try {
    await recomputeBallTotal(ball.id);
  } catch(e) { console.error(e); }
  res.json({ sort, products: created });
});

// List sort sessions
r.get('/', async (_req, res) => {
  const items = await prisma.sortSession.findMany({ orderBy: { createdAt: 'desc' }, include: { ball: true, user: true } });
  res.json(items);
});

// Get by id
r.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const item = await prisma.sortSession.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

// Update counts (does not retro-adjust created products)
r.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { gradeA = 0, gradeB = 0, reject = 0 } = req.body || {};
  const u = (req as any).user;
  const updated = await prisma.sortSession.update({ where: { id }, data: { gradeA, gradeB, reject, userId: u.id } });
  try {
  const sess = await prisma.sortSession.findUnique({ where: { id } });
  if (sess) {
    const total = (sess.gradeA || 0) + (sess.gradeB || 0) + (sess.reject || 0);
    await prisma.ball.update({ where: { id: sess.ballId }, data: { totalPcsOpened: total } });
  }
} catch {}
try {
    const sess = await prisma.sortSession.findUnique({ where: { id } });
    if (sess) await recomputeBallTotal(sess.ballId);
  } catch(e) { console.error(e); }
  res.json(updated);

});

// Delete session (soft assumption: allowed only if exists)
r.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.sortSession.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e:any) {
    res.status(400).json({ error: e.message });
  }
});

export default r;
