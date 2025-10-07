// Gunakan hasil build dari /dist, bukan /src
import app from "../dist/app.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
  memory: 1024,
};

// Vercel akan menjalankan fungsi ini untuk setiap request
export default function handler(req: any, res: any) {
  return (app as any)(req, res);
}
