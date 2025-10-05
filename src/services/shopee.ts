
import crypto from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { prisma } from '../db.js';

type ShopeeCreds = {
  partnerId: string;
  partnerKey: string;
  redirectUrl: string;
  isMerchant?: boolean;
  baseUrl?: string; // default https://partner.shopeemobile.com
  accessToken?: string;
  refreshToken?: string;
  expireAt?: number;
  shopId?: number;
  merchantId?: number;
  region?: string;
};

function baseUrl() {
  return process.env.SHOPEE_BASE_URL || 'https://partner.shopeemobile.com';
}

function ts() { return Math.floor(Date.now()/1000); }

function sign(partnerKey: string, path: string, partnerId: string, timestamp: number, accessToken?: string, shopOrMerchantId?: string|number) {
  const base = partnerId + path + timestamp + (accessToken || '') + (shopOrMerchantId?.toString() || '');
  return crypto.createHmac('sha256', partnerKey).update(base).digest('hex');
}

export function shopeeAuthUrl() {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const redirect = process.env.SHOPEE_REDIRECT_URL!;
  const useMerchant = (process.env.SHOPEE_USE_MERCHANT||'false').toLowerCase()==='true';
  const path = useMerchant ? '/api/v2/merchant/auth_partner' : '/api/v2/shop/auth_partner';
  const t = ts();
  const s = sign(process.env.SHOPEE_PARTNER_KEY!, path, partnerId, t);
  const u = new URL(baseUrl()+path);
  u.searchParams.set('partner_id', partnerId);
  u.searchParams.set('timestamp', String(t));
  u.searchParams.set('sign', s);
  u.searchParams.set('redirect', redirect);
  return u.toString();
}

async function getAccountOrThrow(id: number) {
  const ch = await prisma.channelAccount.findUnique({ where: { id } });
  if (!ch) throw new Error('ChannelAccount not found');
  if (ch.platform !== 'SHOPEE') throw new Error('Not a Shopee account');
  return ch;
}

function credsFromAccount(ch: any): ShopeeCreds {
  const c = (ch.credentials||{}) as any;
  return {
    partnerId: process.env.SHOPEE_PARTNER_ID!,
    partnerKey: process.env.SHOPEE_PARTNER_KEY!,
    redirectUrl: process.env.SHOPEE_REDIRECT_URL!,
    isMerchant: (process.env.SHOPEE_USE_MERCHANT||'false').toLowerCase()==='true',
    baseUrl: process.env.SHOPEE_BASE_URL || 'https://partner.shopeemobile.com',
    accessToken: c.access_token,
    refreshToken: c.refresh_token,
    expireAt: c.expire_at,
    shopId: c.shop_id,
    merchantId: c.merchant_id,
    region: c.region,
  };
}

async function saveCreds(chId: number, patch: any) {
  const ch = await prisma.channelAccount.findUnique({ where: { id: chId } });
  const merged = { ...(ch?.credentials||{}), ...patch };
  await prisma.channelAccount.update({ where: { id: chId }, data: { credentials: merged } });
  return merged;
}

async function fetchJson(path: string, query: Record<string,string|number|undefined>, method: 'GET'|'POST'='GET', body?: any) {
  const url = new URL(baseUrl()+path);
  for (const [k,v] of Object.entries(query)) {
    if (v!==undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method==='POST' ? JSON.stringify(body||{}) : undefined
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Shopee ${path} ${res.status}: ${txt}`);
  }
  return res.json();
}

export async function shopeeExchangeToken(code: string, shop_id?: number, merchant_id?: number) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const p = process.env.SHOPEE_USE_MERCHANT?.toLowerCase()==='true';
  const path = '/api/v2/auth/token/get';
  const t = ts();
  const s = sign(partnerKey, path, partnerId, t);
  const query: any = { partner_id: partnerId, timestamp: t, sign: s };
  const body: any = { code };
  if (p) body.merchant_id = merchant_id;
  else body.shop_id = shop_id;

  const url = baseUrl()+path+'?'+new URLSearchParams(query).toString();
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if ((data as any).error || (data as any).message==='error') {
    throw new Error('Failed to get token: '+JSON.stringify(data));
  }
  return data;
}

export async function shopeeRefreshToken(chId: number) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  const path = '/api/v2/auth/access_token/get';
  const t = ts();
  const s = sign(c.partnerKey, path, c.partnerId, t);
  const query: any = { partner_id: c.partnerId, timestamp: t, sign: s };
  const body: any = { refresh_token: c.refreshToken, shop_id: c.shopId, merchant_id: c.merchantId };
  const url = c.baseUrl+path+'?'+new URLSearchParams(query).toString();
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if ((data as any).error) throw new Error('refresh failed '+JSON.stringify(data));
  await saveCreds(chId, {
    access_token: data.access_token,
    refresh_token: data.refresh_token || c.refreshToken,
    expire_at: Math.floor(Date.now()/1000) + Number(data.expire_in || 14300)
  });
  return data;
}

async function ensureValidToken(chId: number) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  if (!c.accessToken || !c.expireAt || c.expireAt < Math.floor(Date.now()/1000)+300) {
    return shopeeRefreshToken(chId);
  }
  return { access_token: c.accessToken };
}

export async function shopeeGetOrders(chId: number, days=3) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  await ensureValidToken(chId);
  const t = ts();
  const path = '/api/v2/order/get_order_list';
  const useMerchant = !!c.merchantId;
  const shopOrMerchant = useMerchant ? c.merchantId : c.shopId;
  const s = sign(c.partnerKey, path, c.partnerId, t, c.accessToken, shopOrMerchant!);
  const now = Math.floor(Date.now()/1000);
  const from = now - days*24*3600;

  const query: any = {
    partner_id: c.partnerId,
    timestamp: t,
    sign: s,
    access_token: c.accessToken,
    time_range_field: 'create_time',
    time_from: from,
    time_to: now,
  };
  if (useMerchant) query.merchant_id = c.merchantId;
  else query.shop_id = c.shopId;

  const url = c.baseUrl + path + '?' + new URLSearchParams(query).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error('get_order_list failed '+res.status);
  return res.json();
}

export async function shopeeUpdateStock(chId: number, items: Array<{item_id: string, stock: number}>) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  await ensureValidToken(chId);
  const t = ts();
  const path = '/api/v2/product/stock/update';
  const useMerchant = !!c.merchantId;
  const shopOrMerchant = useMerchant ? c.merchantId : c.shopId;
  const s = sign(c.partnerKey, path, c.partnerId, t, c.accessToken, shopOrMerchant!);

  const query: any = {
    partner_id: c.partnerId, timestamp: t, sign: s,
    access_token: c.accessToken,
  };
  if (useMerchant) query.merchant_id = c.merchantId;
  else query.shop_id = c.shopId;
  const url = c.baseUrl + path + '?' + new URLSearchParams(query).toString();
  const body = { stock_list: items.map(i => ({ item_id: i.item_id, stock: i.stock })) };
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)});
  const data = await res.json();
  if ((data as any).error) throw new Error('update stock error '+JSON.stringify(data));
  return data;
}
