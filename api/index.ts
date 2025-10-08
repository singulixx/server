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

  // 1) Try runtime source (dev)
  try {
    const mod = await import('../src/app.js');
    cachedApp = mod.default ?? mod;
    if (cachedApp) return cachedApp;
  } catch {}

  // 2) Try compiled entry point dist/index.js
  try {
    const mod = await import('../dist/index.js');
    cachedApp = mod.default ?? mod;
    if (cachedApp) return cachedApp;
  } catch {}

  // 3) Try compiled app module dist/app.js
  try {
    const mod = await import('../dist/app.js');
    cachedApp = mod.default ?? mod;
    if (cachedApp) return cachedApp;
  } catch {}

  return null;
}

export default async function handler(req: any, res: any) {
  const app = await loadApp();
  if (!app) {
    res.statusCode = 500;
    res.end(
      'Server entry not found. Checked ../src/app.js, ../dist/index.js, ../dist/app.js. ' +
      'Ensure your build produces dist/*.js or that src/app.js exists.'
    );
    return;
  }

  if (typeof app === 'function') return app(req, res);
  if (app && typeof app.handle === 'function') return app.handle(req, res);

  res.statusCode = 500;
  res.end('Invalid server export: expected function or Express app');
}
