// api/index.ts
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";

export const config = {
  api: {
    bodyParser: false,
  },
  runtime: "nodejs",
  maxDuration: 60,
  memory: 1024,
};

let cachedApp: any | null = null;

async function loadApp() {
  if (cachedApp) return cachedApp;

  const base = process.cwd();
  console.log("🧭 Working directory:", base);

  // urutan kandidat baru (tanpa dist/)
  const candidates = [
    "src/app.js",
    "src/index.js",
    "app.js",
    "index.js",
    "dist/src/app.js",
    "dist/src/index.js",
    "dist/app.js",
    "dist/index.js",
  ];

  for (const rel of candidates) {
    const abs = path.join(base, rel);
    if (!fs.existsSync(abs)) continue;

    try {
      const mod = await import(pathToFileURL(abs).href);
      const app = mod.default || mod;
      if (app) {
        console.log(`✅ Loaded app from ${rel}`);
        cachedApp = app;
        return cachedApp;
      }
    } catch (err) {
      console.error(`⚠️ Failed to import ${rel}:`, err);
    }
  }

  return null;
}

export default async function handler(req: any, res: any) {
  const app = await loadApp();

  if (!app) {
    res.statusCode = 500;
    res.end("❌ Server entry not found. Tried src/app.js, src/index.js, app.js, index.js, dist/src/app.js, dist/app.js, dist/index.js");
    return;
  }

  if (typeof app === "function") return app(req, res);
  if (app && typeof app.handle === "function") return app.handle(req, res);

  res.statusCode = 500;
  res.end("❌ Invalid server export: expected function or Express app.");
}
