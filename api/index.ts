export const config = {
  api: {
    bodyParser: false,
  },
  runtime: "nodejs",
  maxDuration: 60,
  memory: 1024,
};

// Cache the app instance so it's only initialized once per Vercel function cold start
let cachedApp: any | null = null;

async function loadApp() {
  if (cachedApp) return cachedApp;

  const isProd = process.env.NODE_ENV === "production";

  try {
    // 🟢 Saat development: import langsung dari src/
    // 🟢 Saat production (Vercel): import dari dist/
    const path = isProd ? "../dist/app.js" : "../src/app.ts";
    const mod = await import(path);
    cachedApp = mod.default ?? mod;
    return cachedApp;
  } catch (err) {
    console.error("[loadApp] Failed to import app:", err);
  }

  return null;
}

export default async function handler(req: any, res: any) {
  const app = await loadApp();

  if (!app) {
    res.statusCode = 500;
    res.end(
      "❌ Server entry not found.\nChecked: src/app.ts and dist/app.js\n" +
        "Make sure your build outputs dist/app.js or that src/app.ts exists."
    );
    return;
  }

  // Support both express-style exports and direct handler
  if (typeof app === "function") return app(req, res);
  if (app && typeof app.handle === "function") return app.handle(req, res);

  res.statusCode = 500;
  res.end("❌ Invalid server export — expected function or Express app.");
}
