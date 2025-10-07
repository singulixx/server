import app from "../src/app.js";
import { createServer } from "http";

export const config = {
  api: {
    bodyParser: false, // penting untuk Express
  },
  runtime: "nodejs",
  maxDuration: 60,
  memory: 1024,
};

// ✅ Adapter agar Vercel bisa menjalankan Express langsung
export default function handler(req: any, res: any) {
  const server = createServer(app);
  server.emit("request", req, res);
}
