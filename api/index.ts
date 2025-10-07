import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../src/app";

export const config = {
  api: {
    bodyParser: false, // biar Express handle sendiri
  },
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  return (app as any)(req, res);
}
