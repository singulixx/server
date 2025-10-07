// src/services/tiktok.ts
import crypto from "node:crypto";
import { prisma } from "../db.js";

type TikTokCreds = {
  appKey: string;
  appSecret: string;
  redirectUrl: string;
  baseUrl: string;
  accessToken?: string;
  refreshToken?: string;
  expireAt?: number;
  shopId?: string;
  sellerId?: string;
  region?: string;
};

function baseUrl() {
  return process.env.TTS_BASE_URL || "https://open-api.tiktokglobalshop.com";
}
function ts() {
  return Math.floor(Date.now() / 1000);
}

function sign(secret: string, params: Record<string, string | number>) {
  // TikTok Shop sign: sort params by key ascending then HMAC-SHA256 of concatenated "keyvalue" with secret as key.
  const sorted = Object.keys(params)
    .sort()
    .map((k) => k + String(params[k]))
    .join("");
  return crypto.createHmac("sha256", secret).update(sorted).digest("hex").toUpperCase();
}

async function getAccountOrThrow(id: number) {
  const ch = await prisma.channelAccount.findUnique({ where: { id } });
  if (!ch) throw new Error("ChannelAccount not found");
  if (ch.platform !== "TIKTOK") throw new Error("Not a TikTok account");
  return ch;
}

function credsFromAccount(ch: any): TikTokCreds {
  // defensive: credentials may be JsonValue (string/number/object/null)
  const c = (ch.credentials && typeof ch.credentials === "object" && ch.credentials !== null)
    ? (ch.credentials as Record<string, any>)
    : {};

  return {
    appKey: process.env.TTS_APP_KEY!,
    appSecret: process.env.TTS_APP_SECRET!,
    redirectUrl: process.env.TTS_REDIRECT_URL!,
    baseUrl: baseUrl(),
    accessToken: c.access_token,
    refreshToken: c.refresh_token,
    expireAt: c.expire_at,
    shopId: c.shop_id,
    sellerId: c.seller_id,
    region: c.region,
  };
}

async function saveCreds(chId: number, patch: Record<string, any>) {
  const ch = await prisma.channelAccount.findUnique({ where: { id: chId } });
  // defensive: ensure we merge only objects
  const existing = (ch && typeof ch.credentials === "object" && ch.credentials !== null)
    ? (ch.credentials as Record<string, any>)
    : {};

  const merged = { ...existing, ...patch };
  await prisma.channelAccount.update({ where: { id: chId }, data: { credentials: merged } });
  return merged;
}

export function tiktokAuthUrl(state?: string) {
  const u = new URL((process.env.TTS_PARTNER_PORTAL_URL || "https://partners.tiktokshop.com") + "/oauth/authorize");
  u.searchParams.set("app_key", process.env.TTS_APP_KEY!);
  u.searchParams.set("redirect_uri", process.env.TTS_REDIRECT_URL!);
  if (state) u.searchParams.set("state", state);
  // scope is managed in Partner center; can append if required.
  return u.toString();
}

export async function tiktokExchangeToken(auth_code: string) {
  const url = baseUrl() + "/api/token/get";
  const params: any = {
    app_key: process.env.TTS_APP_KEY!,
    auth_code,
    grant_type: "authorized_code",
    timestamp: ts(),
  };
  params.sign = sign(process.env.TTS_APP_SECRET!, params);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  const data = (await res.json()) as any; // cast to any for safe property access
  if (data?.code && data?.code != 0) throw new Error("token get failed " + JSON.stringify(data));
  // return raw data (caller handles shape)
  return data;
}

export async function tiktokRefreshToken(chId: number) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  const url = baseUrl() + "/api/token/refresh";
  const params: any = {
    app_key: process.env.TTS_APP_KEY!,
    refresh_token: c.refreshToken,
    grant_type: "refresh_token",
    timestamp: ts(),
  };
  params.sign = sign(process.env.TTS_APP_SECRET!, params);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
  const data = (await res.json()) as any;
  if (data?.code && data?.code != 0) throw new Error("refresh failed " + JSON.stringify(data));

  const dd = data?.data ?? {};
  const merged = await saveCreds(chId, {
    access_token: dd?.access_token ?? c.accessToken,
    refresh_token: dd?.refresh_token ?? c.refreshToken,
    expire_at: Math.floor(Date.now() / 1000) + Number(dd?.expires_in ?? 14400),
    shop_id: dd?.shop_id ?? c.shopId,
    seller_id: dd?.seller_id ?? c.sellerId,
  });

  return { raw: data, merged };
}

async function ensureValidToken(chId: number) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  // if no token or expiring within 5 minutes, refresh
  if (!c.accessToken || !c.expireAt || c.expireAt < Math.floor(Date.now() / 1000) + 300) {
    const refreshed = await tiktokRefreshToken(chId);
    // return structure similar to { access_token: string }
    const merged = (refreshed && (refreshed as any).merged) ? (refreshed as any).merged : {};
    return { access_token: merged.access_token ?? merged.accessToken ?? null };
  }
  return { access_token: c.accessToken };
}

export async function tiktokSearchOrders(chId: number, days = 3) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  const vt = await ensureValidToken(chId);
  const url = baseUrl() + "/api/orders/search";
  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 24 * 3600;
  const payload: any = {
    app_key: process.env.TTS_APP_KEY!,
    access_token: vt.access_token,
    timestamp: ts(),
    page_size: 50,
    create_time_ge: from,
    create_time_le: now,
  };
  payload.sign = sign(process.env.TTS_APP_SECRET!, payload);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = (await res.json()) as any;
  return data;
}

export async function tiktokUpdateInventory(chId: number, items: Array<{ outer_sku_id: string; available_stock: number }>) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  const vt = await ensureValidToken(chId);
  const url = baseUrl() + "/api/products/stock/update";
  const payload: any = {
    app_key: process.env.TTS_APP_KEY!,
    access_token: vt.access_token,
    timestamp: ts(),
    updates: items.map((i) => ({ outer_sku_id: i.outer_sku_id, available_stock: i.available_stock })),
  };
  payload.sign = sign(process.env.TTS_APP_SECRET!, payload);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = (await res.json()) as any;
  return data;
}
