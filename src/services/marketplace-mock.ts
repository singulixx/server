import { prisma } from '../db.js';

function isMock() {
  return (process.env.MARKETPLACE_MODE || 'mock') === 'mock';
}

export async function pushNewProductMock(channelId: number, productId: number) {
  // In live mode, call real APIs.
  await prisma.syncLog.create({ data: { platform: 'SHOPEE', accountId: channelId, type: 'push', status: 'success', message: 'Mock push success' } });
  return { ok: true, mock: isMock(), productId, channelId };
}

export async function importTransactionsMock(channelId: number, days: number) {
  const since = new Date(Date.now() - days*24*3600*1000);
  // Simulate: generate 1-3 random txs on existing products
  const prods = await prisma.product.findMany({ where: { isDeleted: false, stock: { gt: 0 }, ballId: null }, take: 10 });
  if (prods.length === 0) return { ok: true, imported: 0 };
  const ch = await prisma.channelAccount.findUnique({ where: { id: channelId } });
  if (!ch) throw new Error('Channel not found');

  let imported = 0;
  for (const p of prods.slice(0,3)) {
    const qty = Math.min(1 + Math.floor(Math.random()*2), p.stock);
    if (qty <= 0) continue;
    const unit = p.pricePcs || p.priceBulk || p.priceKg || 20000;
    const total = qty * unit;
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: p.id }, data: { stock: { decrement: qty } } });
      await tx.transaction.create({ data: {
        productId: p.id,
        channelAccountId: channelId,
        qty, unitPrice: unit, totalPrice: total,
        occurredAt: new Date(since.getTime() + Math.random()*(Date.now()-since.getTime())),
        // sourceOrderId removed
        // sourceOrderId: `MOCK-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
        status: 'paid', priceType: 'UNIT'
      }});
    });
    imported++;
  }
  await prisma.syncLog.create({ data: { platform: ch.platform, accountId: channelId, type: 'import', status: 'success', message: `Imported ${imported}` } });
  return { ok: true, imported };
}

export async function syncStockMock(channelId: number) {
  // No-op in mock, just logs
  const ch = await prisma.channelAccount.findUnique({ where: { id: channelId } });
  if (!ch) throw new Error('Channel not found');
  await prisma.syncLog.create({ data: { platform: ch.platform, accountId: channelId, type: 'stock', status: 'success', message: 'Synced stock (mock)' } });
  return { ok: true };
}
