// server/src/services/shopee.ts
import axios from "axios";

export class ShopeeService {
  private static partnerId = Number(process.env.SHOPEE_PARTNER_ID);
  private static partnerKey = process.env.SHOPEE_PARTNER_KEY!;
  private static redirectUrl = process.env.SHOPEE_REDIRECT_URL!;
  private static apiUrl = "https://partner.shopeemobile.com/api/v2";

  // Generate OAuth URL
  static generateAuthUrl(shopId: string | number): string {
    return (
      `https://partner.shopeemobile.com/api/v2/shop/auth_partner` +
      `?partner_id=${this.partnerId}` +
      `&redirect=${encodeURIComponent(this.redirectUrl)}` +
      `&shop_id=${shopId}`
    );
  }

  // Exchange code → Access Token
  static async getAccessToken(code: string, shopId: string) {
    const url = `${this.apiUrl}/auth/token/get`;

    const response = await axios.post(url, {
      code,
      shop_id: Number(shopId),
      partner_id: this.partnerId
    });

    return response.data;
  }

  // Refresh token
  static async refreshToken(refreshToken: string, shopId: string | number) {
    const url = `${this.apiUrl}/auth/token/refresh`;

    const response = await axios.post(url, {
      refresh_token: refreshToken,
      shop_id: Number(shopId),
      partner_id: this.partnerId
    });

    return response.data;
  }

  // Get orders
  static async getOrders(accessToken: string, shopId: string | number) {
    const url = `${this.apiUrl}/order/get_order_list`;

    const response = await axios.get(url, {
      params: {
        shop_id: Number(shopId),
        partner_id: this.partnerId,
        access_token: accessToken
      }
    });

    return response.data;
  }

  // Update stock
  static async updateStock(
    accessToken: string,
    shopId: string | number,
    itemId: number,
    stock: number
  ) {
    const url = `${this.apiUrl}/product/stock/update`;

    const response = await axios.post(url, {
      shop_id: Number(shopId),
      partner_id: this.partnerId,
      access_token: accessToken,
      item_id: itemId,
      stock
    });

    return response.data;
  }
}
