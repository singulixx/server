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

  // ✅ 1) Try compiled entry (Vercel runtime)
  try {
    // @ts-ignore: only exists after build
    const mod = await import("../dist/index.js");
    cachedApp = mod.default ?? mod;
    return cachedApp;
  } catch (err) {
    console.warn("⚠️ Cannot load ../dist/index.js:", err);
  }

  // ✅ 2) Try dev source (local dev)
  try {
    const mod = await import("../src/index.js");
    cachedApp = mod.default ?? mod;
    return cachedApp;
  } catch (err) {
    console.error("❌ Failed to load ../src/index.js:", err);
  }

  return null;
}

export default async function handler(req: any, res: any) {
  const app = await loadApp();
  if (!app) {
    res.statusCode = 500;
    res.end(
      "Server entry not found. Checked ../dist/index.js and ../src/index.js"
    );
    return;
  }

  if (typeof app === "function") return app(req, res);
  if (app && typeof app.handle === "function") return app.handle(req, res);

  res.statusCode = 500;
  res.end("Invalid app export: expected function or Express app");
}
