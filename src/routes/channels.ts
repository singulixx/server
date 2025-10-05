
import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired, requireRole } from '../utils/auth.js';
import { audit } from '../utils/audit.js';
import { pushNewProductMock, importTransactionsMock, syncStockMock } from '../services/marketplace-mock.js';
import { shopeeAuthUrl, shopeeExchangeToken, shopeeGetOrders, shopeeUpdateStock, shopeeRefreshToken } from '../services/shopee.js';
import { tiktokAuthUrl, tiktokExchangeToken, tiktokSearchOrders, tiktokUpdateInventory, tiktokRefreshToken } from '../services/tiktok.js';

const r = Router();
r.use(authRequired);

// List channel accounts
r.get('/', async (_req, res) => {
  const list = await prisma.channelAccount.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(list);
});

// Create channel account (Owner)
r.post('/', requireRole('OWNER'), async (req, res) => {
  const { platform, label } = req.body || {};
  const created = await prisma.channelAccount.create({ data: { platform, label, credentials: {} } });
  await audit(req, 'channel.create', { id: created.id, platform, label });
  res.json(created);
});

// Init connect flow (returns URL)
r.post('/:id/connect/init', requireRole('OWNER'), async (req, res) => {
  const id = Number(req.params.id);
  const acc = await prisma.channelAccount.findUnique({ where: { id } });
  if (!acc) return res.status(404).json({ error: 'Channel not found' });
  let url: string | null = null;
  if (acc.platform === 'SHOPEE') url = shopeeAuthUrl();
  else if (acc.platform === 'TIKTOK') url = tiktokAuthUrl(String(id));
  else return res.status(400).json({ error: 'Unsupported platform' });
  res.json({ url });
});

// OAuth callback (Shopee)
r.get('/oauth/shopee/callback', async (req, res) => {
  try {
    const { code, shop_id, merchant_id, channel_id } = (req.query as any);
    if (!code) return res.status(400).send('Missing code');
    // We expect a ChannelAccount already created; choose by channel_id or create one.
    let chId = channel_id ? Number(channel_id) : undefined;
    if (!chId) {
      const created = await prisma.channelAccount.create({ data: { platform: 'SHOPEE', label: 'Shopee '+(shop_id||merchant_id), credentials: {} } });
      chId = created.id;
    }
    const token = await shopeeExchangeToken(String(code), shop_id?Number(shop_id):undefined, merchant_id?Number(merchant_id):undefined);
    await prisma.channelAccount.update({ where: { id: chId }, data: { credentials: {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expire_at: Math.floor(Date.now()/1000) + Number(token.expire_in||14400),
      shop_id: shop_id?Number(shop_id):undefined,
      merchant_id: merchant_id?Number(merchant_id):undefined
    } } });
    return res.redirect((process.env.WEB_BASE_URL||'http://localhost:3000')+'/channel?connected=shopee');
  } catch (e:any) {
    console.error(e);
    return res.status(500).send(e?.message || 'Failed');
  }
});

// OAuth callback (TikTok)
r.get('/oauth/tiktok/callback', async (req, res) => {
  try {
    const { code, state } = (req.query as any);
    if (!code) return res.status(400).send('Missing code');
    // state holds channel id if provided
    let chId = state ? Number(state) : undefined;
    if (!chId) {
      const created = await prisma.channelAccount.create({ data: { platform: 'TIKTOK', label: 'TikTok '+Date.now(), credentials: {} } });
      chId = created.id;
    }
    const token = await tiktokExchangeToken(String(code));
    await prisma.channelAccount.update({ where: { id: chId }, data: { credentials: {
      access_token: token.data?.access_token,
      refresh_token: token.data?.refresh_token,
      expire_at: Math.floor(Date.now()/1000) + Number(token.data?.expires_in || 14400),
      shop_id: token.data?.shop_id,
      seller_id: token.data?.seller_id
    } } });
    return res.redirect((process.env.WEB_BASE_URL||'http://localhost:3000')+'/channel?connected=tiktok');
  } catch (e:any) {
    console.error(e);
    return res.status(500).send(e?.message || 'Failed');
  }
});

// Force refresh token
r.post('/:id/refresh', requireRole('OWNER'), async (req, res) => {
  const id = Number(req.params.id);
  const acc = await prisma.channelAccount.findUnique({ where: { id } });
  if (!acc) return res.status(404).json({ error: 'Channel not found' });
  if (acc.platform === 'SHOPEE') {
    const data = await shopeeRefreshToken(id);
    return res.json({ ok: true, data });
  } else if (acc.platform === 'TIKTOK') {
    const data = await tiktokRefreshToken(id);
    return res.json({ ok: true, data });
  }
  return res.status(400).json({ error: 'Unsupported platform' });
});

// Import orders (real if MARKETPLACE_MODE=live)
r.post('/:id/import', requireRole('OWNER'), async (req, res) => {
  const id = Number(req.params.id);
  const days = Number(req.body?.days || 3);
  const acc = await prisma.channelAccount.findUnique({ where: { id } });
  if (!acc) return res.status(404).json({ error: 'Channel not found' });

  if ((process.env.MARKETPLACE_MODE||'mock')==='mock') {
    const result = await importTransactionsMock(id, days);
    return res.json({ ok: true, mode: 'mock', result });
  }
  if (acc.platform === 'SHOPEE') {
    const result = await shopeeGetOrders(id, days);
    return res.json({ ok: true, mode: 'live', result });
  } else if (acc.platform === 'TIKTOK') {
    const result = await tiktokSearchOrders(id, days);
    return res.json({ ok: true, mode: 'live', result });
  }
  return res.status(400).json({ error: 'Unsupported platform' });
});

// Sync stock (real if live)
r.post('/:id/sync-stock', requireRole('OWNER'), async (req, res) => {
  const id = Number(req.params.id);
  const items = req.body?.items || []; // map SKU to stock; for demo we just forward
  const acc = await prisma.channelAccount.findUnique({ where: { id } });
  if (!acc) return res.status(404).json({ error: 'Channel not found' });

  if ((process.env.MARKETPLACE_MODE||'mock')==='mock') {
    const result = await syncStockMock(id);
    return res.json({ ok: true, mode: 'mock', result });
  }
  if (acc.platform === 'SHOPEE') {
    const result = await shopeeUpdateStock(id, items);
    return res.json({ ok: true, mode: 'live', result });
  } else if (acc.platform === 'TIKTOK') {
    const result = await tiktokUpdateInventory(id, items);
    return res.json({ ok: true, mode: 'live', result });
  }
  return res.status(400).json({ error: 'Unsupported platform' });
});

export default r;
