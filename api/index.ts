// api/index.ts
import path from "path";
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

  const tryImport = async (p: string) => {
    try {
      const filePath = path.join(process.cwd(), p);
      const fileUrl = pathToFileURL(filePath).href;
      const mod = await import(fileUrl);
      const app = mod.default || mod;
      if (app) return app;
    } catch (err) {}
    return null;
  };

  const paths = [
    "dist/src/app.js",   // ✅ hasil build utama kamu
    "dist/src/index.js",
    "dist/app.js",
    "dist/index.js",
  ];

  for (const p of paths) {
    const app = await tryImport(p);
    if (app) {
      console.log(`[✅] Loaded Express app from ${p}`);
      cachedApp = app;
      return cachedApp;
    }
  }

  return null;
}

export default async function handler(req: any, res: any) {
  const app = await loadApp();

  if (!app) {
    res.statusCode = 500;
    res.end(
      "❌ Server entry not found. Tried dist/src/app.js, dist/src/index.js, dist/app.js, dist/index.js"
    );
    return;
  }

  // Express or function handler
  if (typeof app === "function") return app(req, res);
  if (app && typeof app.handle === "function") return app.handle(req, res);

  res.statusCode = 500;
  res.end("❌ Invalid server export: expected function or Express app.");
}
