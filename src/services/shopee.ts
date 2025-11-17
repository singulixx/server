import crypto from "crypto";
import axios from "axios";

const SHOPEE_PARTNER_ID = Number(process.env.SHOPEE_PARTNER_ID);
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY as string;
const SHOPEE_REDIRECT_URL = process.env.SHOPEE_REDIRECT_URL as string;

const SHOPEE_HOST =
  process.env.SHOPEE_ENV === "production"
    ? "https://partner.shopeemobile.com"
    : "https://partner.test-stable.shopeemobile.com";

export class ShopeeService {
  static generateSignature(path: string, timestamp: number, partnerId: number) {
    const baseString = `${partnerId}${path}${timestamp}`;

    return crypto
      .createHmac("sha256", SHOPEE_PARTNER_KEY)
      .update(baseString)
      .digest("hex");
  }

  static generateAuthUrl() {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = "/api/v2/shop/auth_partner";

    const sign = ShopeeService.generateSignature(
      path,
      timestamp,
      SHOPEE_PARTNER_ID
    );

    const redirect = encodeURIComponent(SHOPEE_REDIRECT_URL);

    return `${SHOPEE_HOST}${path}?partner_id=${SHOPEE_PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&redirect=${redirect}`;
  }

  static async getAccessToken(code: string, shopId: number) {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = "/api/v2/auth/token/get";

    const baseString = `${SHOPEE_PARTNER_ID}${path}${timestamp}${code}${shopId}`;

    const sign = crypto
      .createHmac("sha256", SHOPEE_PARTNER_KEY)
      .update(baseString)
      .digest("hex");

    const response = await axios.post(`${SHOPEE_HOST}${path}`, {
      partner_id: SHOPEE_PARTNER_ID,
      code,
      shop_id: shopId,
      timestamp,
      sign,
    });

    return response.data;
  }
}
