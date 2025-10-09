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

  const tryImport = async (path: string) => {
    try {
      const mod = await import(path);
      const app = mod.default || mod;
      if (app) return app;
    } catch (err) {}
    return null;
  };

  // Sesuai hasil build kamu, urutan path yang benar:
  const paths = [
    "../dist/src/app.js",  // ✅ yang kamu punya
    "../dist/src/index.js",
    "../dist/app.js",
    "../dist/index.js",
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
      "❌ Server entry not found. Checked ../dist/src/app.js, ../dist/src/index.js, ../dist/app.js, ../dist/index.js"
    );
    return;
  }

  // Express or function handler
  if (typeof app === "function") return app(req, res);
  if (app && typeof app.handle === "function") return app.handle(req, res);

  res.statusCode = 500;
  res.end("❌ Invalid server export: expected function or Express app.");
}
