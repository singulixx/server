import { Router } from "express";
import { prisma } from "../db.js";
import { authRequired } from "../utils/auth.js";
import { stringify } from "csv-stringify";

const r = Router();

function buildTxWhere(q: any) {
  const where: any = {};
  if (q?.from || q?.to) {
    where.occurredAt = {};
    if (q.from) where.occurredAt.gte = new Date(q.from + "T00:00:00.000Z");
    if (q.to) where.occurredAt.lte = new Date(q.to + "T23:59:59.999Z");
  }
  if (q.channelId) where.channelAccountId = Number(q.channelId);
  if (q.storeId) where.storeId = Number(q.storeId);
  return where;
}


// Ensure summary response always has consistent shape
function shapeSummary(input: any) {
  const totalBall = {
    unopened: Number(input?.totalBall?.unopened || input?.totals?.ball?.unopened || 0),
    opened: Number(input?.totalBall?.opened || input?.totals?.ball?.opened || 0),
    sorted: Number(input?.totalBall?.sorted || input?.totals?.ball?.sorted || 0),
  };
  const totalProduct = {
    A: Number(input?.totalProduct?.A || input?.totals?.products?.A || 0),
    B: Number(input?.totalProduct?.B || input?.totals?.products?.B || 0),
    REJECT: Number(input?.totalProduct?.REJECT || input?.totals?.products?.REJECT || 0),
  };
  const totalSales = Number(input?.totalSales || input?.totals?.sales || 0);
  return { totalBall, totalProduct, totalSales };
}

r.use(authRequired);
/**
 * GET /api/reports/summary
 * — Ringkasan untuk kartu dashboard, dengan dukungan filter (from, to, channelId, storeId).
 * Response: { totalBall, totalProducts, stock: { totalKg, totalQty }, sales: { total, today, month } }
 */
r.get("/summary", async (req, res) => {
  try {
    const whereTx = buildTxWhere(req.query);
    // Balls & products tidak punya relasi langsung ke channel/store; kita tampilkan global
    const [balls, products, txs] = await Promise.all([
      prisma.ball.findMany(),
      prisma.product.findMany({ where: { isDeleted: false } }),
      prisma.transaction.findMany({ where: whereTx }),
    ]);

    const totalBall = {
      unopened: balls.filter((b: any) => b.status === "UNOPENED").length,
      opened: balls.filter((b: any) => b.status === "OPENED").length,
      sorted: balls.filter((b: any) => b.status === "SORTED").length,
    };

    const totalProducts = products.length;
    const stock = {
      totalQty: products.reduce((a: number, p: any) => a + (p.stock || 0), 0),
      totalKg: 0,
    };

    const total = txs.reduce((a: number, t: any) => a + Number(t.totalPrice || t.qty * (t.unitPrice || 0) || 0), 0);

    const now = new Date();
    const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0,0,0));
    const endToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23,59,59,999));
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0,0,0));
    const endMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()+1, 0, 23,59,59,999));

    const [txToday, txMonth] = await Promise.all([
      prisma.transaction.findMany({ where: { ...whereTx, occurredAt: { gte: startToday, lte: endToday } } }),
      prisma.transaction.findMany({ where: { ...whereTx, occurredAt: { gte: startMonth, lte: endMonth } } }),
    ]);
    const sumToday = txToday.reduce((a: number, t: any) => a + Number(t.totalPrice || t.qty * (t.unitPrice || 0) || 0), 0);
    const sumMonth = txMonth.reduce((a: number, t: any) => a + Number(t.totalPrice || t.qty * (t.unitPrice || 0) || 0), 0);

    return res.json({ totalBall, totalProducts, stock, sales: { total, today: sumToday, month: sumMonth } });
  } catch (e) {
    console.error("summary error", e);
    return res.status(500).json({ error: "Failed to build summary" });
  }
});


/**
 * GET /api/reports/overview
 * — Kembalikan bentuk standar: { totalBall, totalProduct, totalSales }
 */
r.get("/overview", async (req, res) => {
  const [balls, products, txs] = await Promise.all([
    prisma.ball.findMany(),
    prisma.product.findMany({ where: { isDeleted: false } }),
    prisma.transaction.findMany({ where: buildTxWhere(req.query) }),
  ]);

  const totalBall = {
    unopened: balls.filter((b) => b.status === "UNOPENED").length,
    opened: balls.filter((b) => b.status === "OPENED").length,
    sorted: balls.filter((b) => b.status === "SORTED").length,
  };

  const totalProduct = {
    A: products.filter((p) => p.grade === "A").reduce((a, p) => a + p.stock, 0),
    B: products.filter((p) => p.grade === "B").reduce((a, p) => a + p.stock, 0),
    REJECT: products
      .filter((p) => p.grade === "REJECT")
      .reduce((a, p) => a + p.stock, 0),
  };

  const totalSales = txs.reduce((acc, t) => acc + Number(t.totalPrice || 0), 0);

  const summary = shapeSummary({ totalBall, totalProduct, totalSales });
  return res.json(summary);
});

/**
 * GET /api/reports/charts
 * — Modal vs Omset per ball, kualitas supplier, penjualan per channel, tren harian, daftar channel.
 * (Tidak menyertakan summary untuk menghindari variabel di luar scope)
 */
r.get("/charts", async (req, res) => {
  const where = buildTxWhere(req.query);
  const [balls, txs, products, channels] = await Promise.all([
    prisma.ball.findMany(),
    prisma.transaction.findMany({ where, include: { product: true, channel: true } }),
    prisma.product.findMany(),
    prisma.channelAccount.findMany(),
  ]);

  // Omzet per ball
  const salesPerBall: Record<number, number> = {};
  for (const t of txs) {
    const bId = t.product?.ballId;
    if (!bId) continue;
    salesPerBall[bId] = (salesPerBall[bId] || 0) + Number(t.totalPrice || 0);
  }

  const modalVsOmset = balls.map((b) => ({
    ballId: b.id,
    code: b.code,
    modal: b.buyPrice,
    omset: salesPerBall[b.id] || 0,
    roi: b.buyPrice ? ((salesPerBall[b.id] || 0) - b.buyPrice) / b.buyPrice : 0,
  }));

  // Kualitas supplier (akumulasi stok per grade dari produk hasil sortir)
  const supplierQuality: Record<string, { A: number; B: number; REJECT: number }> = {};
  for (const p of products) {
    const ball = p.ballId ? balls.find((b) => b.id === p.ballId) : null;
    if (!ball) continue;
    const sup = ball.supplier;
    if (!supplierQuality[sup]) supplierQuality[sup] = { A: 0, B: 0, REJECT: 0 };
    if (p.grade === "A" || p.grade === "B" || p.grade === "REJECT") {
      supplierQuality[sup][p.grade] += p.stock;
    }
  }

  // Penjualan per channel
  const salesByChannel: Record<string, number> = {};
  for (const t of txs) {
    const key = `${t.channel.platform}-${t.channel.label}`;
    salesByChannel[key] = (salesByChannel[key] || 0) + Number(t.totalPrice || 0);
  }

  // Tren harian
  const trendsDaily: Record<string, number> = {};
  for (const t of txs) {
    const d = t.occurredAt.toISOString().slice(0, 10);
    trendsDaily[d] = (trendsDaily[d] || 0) + Number(t.totalPrice || 0);
  }

  return res.json({
    modalVsOmset,
    supplierQuality,
    salesByChannel,
    trendsDaily,
    channels,
  });
});

/**
 * GET /api/reports/export/transactions.csv
 * — Tidak di-wrap JSON (CSV stream), dan TIDAK ada blok perhitungan lain.
 */
r.get("/export/transactions.csv", async (req, res) => {
  const where = buildTxWhere(req.query);
  const txs = await prisma.transaction.findMany({
    where,
    include: { product: true, channel: true },
  });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="transactions.csv"');

  const stringifier = stringify({
    header: true,
    columns: ["id", "product", "channel", "qty", "unitPrice", "totalPrice", "occurredAt", "status"],
  });

  stringifier.pipe(res);
  for (const t of txs) {
    stringifier.write([
      t.id,
      t.product?.name ?? "",
      `${t.channel?.platform ?? ""}-${t.channel?.label ?? ""}`,
      t.qty,
      t.unitPrice,
      t.totalPrice,
      t.occurredAt.toISOString(),
      t.status,
    ]);
  }
  stringifier.end();
});

export default r;

/**
 * GET /api/reports/dashboard
 * — Tetap sesuai versi original: totals per status/grade, sales per channel, ROI, kualitas supplier, dll.
 *   (Tidak menyertakan summary agar tidak ada variabel di luar scope)
 */
r.get("/dashboard", async (req, res) => {
  const { startDate, endDate } = req.query as any;
  const dateFilter: any = {};
  if (startDate || endDate) {
    dateFilter.gte = startDate ? new Date(String(startDate)) : undefined;
    dateFilter.lte = endDate ? new Date(String(endDate)) : undefined;
  }

  const [ballCounts, productGrades, channels, balls, txs, sortSessions, procurements] = await Promise.all([
    prisma.ball.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.product.groupBy({ by: ["grade"], where: { isDeleted: false }, _count: { _all: true } }),
    prisma.channelAccount.findMany(),
    prisma.ball.findMany(),
    prisma.transaction.findMany({
      where: { deletedAt: null, ...(startDate || endDate ? { occurredAt: dateFilter } : {}) },
      include: { product: true, channel: true },
    }),
    prisma.sortSession.findMany(),
    prisma.procurement.findMany({
      where: { deletedAt: null, ...(startDate || endDate ? { occurredAt: dateFilter } : {}) },
      include: { items: true },
    }),
  ]);

  // Totals
  const totalBall = ballCounts.reduce(
    (acc, row) => ({ ...acc, [row.status]: row._count._all }),
    {} as Record<string, number>
  );
  const totalProductByGrade = productGrades.reduce(
    (acc, row) => ({ ...acc, [row.grade]: row._count._all }),
    {} as Record<string, number>
  );

  // Sales per channel
  const salesByChannel: Record<string, number> = {};
  for (const t of txs) {
    const platform = channels.find((c) => c.id === t.channelAccountId)?.platform || "UNKNOWN";
    salesByChannel[platform] = (salesByChannel[platform] || 0) + (t.totalPrice || t.qty * t.unitPrice);
  }

  // Modal vs Omzet per ball + ROI
  const omzetByBall: Record<number, number> = {};
  for (const t of txs) {
    const bId = t.product?.ballId;
    if (!bId) continue;
    const val = t.totalPrice || t.qty * t.unitPrice;
    omzetByBall[bId] = (omzetByBall[bId] || 0) + val;
  }
  const modalVsOmzet = balls.map((b) => ({
    ballId: b.id,
    ballCode: b.code,
    modal: b.buyPrice,
    omzet: omzetByBall[b.id] || 0,
    ROI: b.buyPrice ? ((omzetByBall[b.id] || 0) - b.buyPrice) / b.buyPrice : null,
  }));

  // Supplier quality (berdasarkan sort session)
  const quality: Record<string, { A: number; B: number; R: number; total: number }> = {};
  for (const s of sortSessions) {
    const ball = balls.find((b) => b.id === s.ballId);
    const supplier = ball?.supplier || "UNKNOWN";
    const q = (quality[supplier] ||= { A: 0, B: 0, R: 0, total: 0 });
    q.A += s.gradeA;
    q.B += s.gradeB;
    q.R += s.reject;
    q.total += s.gradeA + s.gradeB + s.reject;
  }
  const supplierQuality = Object.entries(quality).map(([supplier, q]) => ({
    supplier,
    pctA: q.total ? q.A / q.total : 0,
    pctB: q.total ? q.B / q.total : 0,
    pctReject: q.total ? q.R / q.total : 0,
  }));

  // Total PCS dibuka & per-ball
  const totalPcsOpenedAgg = balls.reduce((sum, b) => sum + (b.totalPcsOpened || 0), 0);
  const ballsOpened = balls.map((b) => ({ ballCode: b.code, totalPcsOpened: b.totalPcsOpened || 0 }));

  // Proporsi sumber stok
  const stockFromSort = sortSessions.reduce((sum, s) => sum + s.gradeA + s.gradeB + s.reject, 0);
  const stockFromProc = procurements.reduce((sum, p) => sum + p.items.reduce((s, i) => s + i.qtyOrKg, 0), 0);
  const stockSource = { fromSortBall: stockFromSort, fromProcurement: stockFromProc };

  return res.json({
    totalBall,
    totalProductByGrade,
    salesByChannel,
    modalVsOmzet,
    gradeDistribution: Object.entries(totalProductByGrade).map(([grade, count]) => ({ grade, count })),
    supplierQuality,
    totalPcsOpenedAgg,
    ballsOpened,
    stockSource,
  });
});
