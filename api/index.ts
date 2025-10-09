// api/index.ts
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

  // 1️⃣ Try runtime source (dev mode)
  try {
    const mod = await import("../src/app.js"); // local run (ts-node)
    cachedApp = mod.default || mod;
    if (cachedApp) return cachedApp;
  } catch (err) {
    // ignore
  }

  // 2️⃣ Try compiled app (most common)
  try {
    const mod = await import("../dist/app.js"); // ⬅️ FIXED PATH
    cachedApp = mod.default || mod;
    if (cachedApp) return cachedApp;
  } catch (err) {
    // ignore
  }

  // 3️⃣ Try compiled index (alternative)
  try {
    const mod = await import("../dist/index.js");
    cachedApp = mod.default || mod;
    if (cachedApp) return cachedApp;
  } catch (err) {
    // ignore
  }

  return null;
}

export default async function handler(req: any, res: any) {
  const app = await loadApp();

  if (!app) {
    res.statusCode = 500;
    res.end(
      "❌ Server entry not found. Checked ../src/app.js, ../dist/app.js, ../dist/index.js."
    );
    return;
  }

  // Express or function handler
  if (typeof app === "function") return app(req, res);
  if (app && typeof app.handle === "function") return app.handle(req, res);

  res.statusCode = 500;
  res.end("❌ Invalid server export: expected function or Express app.");
}
