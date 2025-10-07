import app from "../src/app.js";

export const config = {
  api: {
    bodyParser: false, // Express handles this
  },
  runtime: "nodejs",
  maxDuration: 60,
  memory: 1024,
};

// ✅ Wrap express app in Vercel-compatible handler
export default function handler(req: any, res: any) {
  return app(req, res);
}
