// src/services/shopee.ts
import crypto from "node:crypto";
import { URLSearchParams } from "node:url";
import { prisma } from "../db.js";

type ShopeeCreds = {
  partnerId: string;
  partnerKey: string;
  redirectUrl: string;
  isMerchant?: boolean;
  baseUrl: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expireAt?: number | null;
  shopId?: number | null;
  merchantId?: number | null;
  region?: string | null;
};

function baseUrl() {
  return process.env.SHOPEE_BASE_URL || "https://partner.shopeemobile.com";
}

function ts() {
  return Math.floor(Date.now() / 1000);
}

function sign(
  partnerKey: string,
  path: string,
  partnerId: string,
  timestamp: number,
  accessToken?: string | null,
  shopOrMerchantId?: string | number | null
) {
  const base =
    partnerId +
    path +
    timestamp +
    (accessToken || "") +
    (shopOrMerchantId != null ? String(shopOrMerchantId) : "");
  return crypto.createHmac("sha256", partnerKey).update(base).digest("hex");
}

export function shopeeAuthUrl() {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const redirect = process.env.SHOPEE_REDIRECT_URL!;
  const useMerchant = (process.env.SHOPEE_USE_MERCHANT || "false").toLowerCase() === "true";
  const path = useMerchant ? "/api/v2/merchant/auth_partner" : "/api/v2/shop/auth_partner";
  const t = ts();
  const s = sign(process.env.SHOPEE_PARTNER_KEY!, path, partnerId, t);
  const u = new URL(baseUrl() + path);
  u.searchParams.set("partner_id", partnerId);
  u.searchParams.set("timestamp", String(t));
  u.searchParams.set("sign", s);
  u.searchParams.set("redirect", redirect);
  return u.toString();
}

async function getAccountOrThrow(id: number) {
  const ch = await prisma.channelAccount.findUnique({ where: { id } });
  if (!ch) throw new Error("ChannelAccount not found");
  if (ch.platform !== "SHOPEE") throw new Error("Not a Shopee account");
  return ch;
}

function credsFromAccount(ch: any): ShopeeCreds {
  // Defensive: credentials may be JsonValue (string/number/object/null). Only treat as object when it's object.
  const c =
    ch && typeof ch.credentials === "object" && ch.credentials !== null
      ? (ch.credentials as Record<string, any>)
      : {};

  return {
    partnerId: process.env.SHOPEE_PARTNER_ID!,
    partnerKey: process.env.SHOPEE_PARTNER_KEY!,
    redirectUrl: process.env.SHOPEE_REDIRECT_URL!,
    isMerchant: (process.env.SHOPEE_USE_MERCHANT || "false").toLowerCase() === "true",
    baseUrl: process.env.SHOPEE_BASE_URL || "https://partner.shopeemobile.com",
    accessToken: c.access_token ?? null,
    refreshToken: c.refresh_token ?? null,
    expireAt: c.expire_at ?? null,
    shopId: typeof c.shop_id === "number" ? c.shop_id : c.shop_id ? Number(c.shop_id) : null,
    merchantId:
      typeof c.merchant_id === "number" ? c.merchant_id : c.merchant_id ? Number(c.merchant_id) : null,
    region: c.region ?? null,
  };
}

async function saveCreds(chId: number, patch: Record<string, any>) {
  const ch = await prisma.channelAccount.findUnique({ where: { id: chId } });
  const existing =
    ch && typeof ch.credentials === "object" && ch.credentials !== null
      ? (ch.credentials as Record<string, any>)
      : {};
  const merged = { ...existing, ...patch };
  await prisma.channelAccount.update({ where: { id: chId }, data: { credentials: merged } });
  return merged;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Fetch ${url} failed ${res.status}: ${txt}`);
  }
  // cast to any to safely access properties later
  const data = (await res.json()) as any;
  return data;
}

export async function shopeeExchangeToken(code: string, shop_id?: number, merchant_id?: number) {
  const partnerId = process.env.SHOPEE_PARTNER_ID!;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  const p = (process.env.SHOPEE_USE_MERCHANT || "false").toLowerCase() === "true";
  const path = "/api/v2/auth/token/get";
  const t = ts();
  const s = sign(partnerKey, path, partnerId, t);
  const query: any = { partner_id: partnerId, timestamp: t, sign: s };
  const body: any = { code };
  if (p) body.merchant_id = merchant_id;
  else body.shop_id = shop_id;

  const url = baseUrl() + path + "?" + new URLSearchParams(query).toString();
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Shopee may return different shapes; be defensive
  if (data == null) throw new Error("Shopee: empty response");
  if ((data as any).error) throw new Error("Failed to get token: " + JSON.stringify(data));
  return data;
}

export async function shopeeRefreshToken(chId: number) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  const path = "/api/v2/auth/access_token/get";
  const t = ts();
  const s = sign(c.partnerKey, path, c.partnerId, t);
  const query: any = { partner_id: c.partnerId, timestamp: t, sign: s };
  const body: any = { refresh_token: c.refreshToken, shop_id: c.shopId, merchant_id: c.merchantId };
  const url = c.baseUrl + path + "?" + new URLSearchParams(query).toString();

  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!data) throw new Error("refresh failed: empty response");
  if ((data as any).error) throw new Error("refresh failed " + JSON.stringify(data));

  const access_token = (data as any).access_token ?? null;
  const refresh_token = (data as any).refresh_token ?? c.refreshToken ?? null;
  const expire_in = (data as any).expire_in ?? (data as any).expires_in ?? null;

  await saveCreds(chId, {
    access_token,
    refresh_token,
    expire_at: Math.floor(Date.now() / 1000) + Number(expire_in ?? 14300),
  });

  return data;
}

async function ensureValidToken(chId: number) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  if (!c.accessToken || !c.expireAt || c.expireAt < Math.floor(Date.now() / 1000) + 300) {
    return shopeeRefreshToken(chId);
  }
  return { access_token: c.accessToken };
}

export async function shopeeGetOrders(chId: number, days = 3) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  await ensureValidToken(chId);
  const t = ts();
  const path = "/api/v2/order/get_order_list";
  const useMerchant = !!c.merchantId;
  const shopOrMerchant = useMerchant ? c.merchantId : c.shopId;
  const s = sign(c.partnerKey, path, c.partnerId, t, c.accessToken, shopOrMerchant ?? undefined);

  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 24 * 3600;

  const query: any = {
    partner_id: c.partnerId,
    timestamp: t,
    sign: s,
    access_token: c.accessToken,
    time_range_field: "create_time",
    time_from: from,
    time_to: now,
  };
  if (useMerchant) query.merchant_id = c.merchantId;
  else query.shop_id = c.shopId;

  const url = c.baseUrl + path + "?" + new URLSearchParams(query).toString();
  const data = await fetchJson(url);
  return data;
}

export async function shopeeUpdateStock(chId: number, items: Array<{ item_id: string; stock: number }>) {
  const ch = await getAccountOrThrow(chId);
  const c = credsFromAccount(ch);
  await ensureValidToken(chId);
  const t = ts();
  const path = "/api/v2/product/stock/update";
  const useMerchant = !!c.merchantId;
  const shopOrMerchant = useMerchant ? c.merchantId : c.shopId;
  const s = sign(c.partnerKey, path, c.partnerId, t, c.accessToken, shopOrMerchant ?? undefined);

  const query: any = {
    partner_id: c.partnerId,
    timestamp: t,
    sign: s,
    access_token: c.accessToken,
  };
  if (useMerchant) query.merchant_id = c.merchantId;
  else query.shop_id = c.shopId;

  const url = c.baseUrl + path + "?" + new URLSearchParams(query).toString();
  const body = { stock_list: items.map((i) => ({ item_id: i.item_id, stock: i.stock })) };

  const data = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if ((data as any).error) throw new Error("update stock error " + JSON.stringify(data));
  return data;
}
