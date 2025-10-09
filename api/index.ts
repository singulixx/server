// api/index.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false,
  },
  runtime: 'nodejs',
  maxDuration: 60,
  memory: 1024,
};

let cachedApp: any | null = null;

async function loadApp() {
  if (cachedApp) return cachedApp;

  try {
    // Explicit extension needed when using "NodeNext"
    const mod = await import('../src/app.js');
    cachedApp = mod.default || mod;
    console.log('✅ Loaded app from src/app.ts');
    return cachedApp;
  } catch (err) {
    console.error('❌ Failed to load app:', err);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await loadApp();

  if (!app) {
    res.statusCode = 500;
    res.end('❌ Server entry not found (expected src/app.ts)');
    return;
  }

  if (typeof app === 'function') return app(req, res);
  if (app && typeof app.handle === 'function') return app.handle(req, res);

  res.statusCode = 500;
  res.end('❌ Invalid server export: expected function or Express app.');
}
