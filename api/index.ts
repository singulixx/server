// api/index.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export const config = {
  api: {
    bodyParser: false,
  },
  runtime: 'nodejs',
  maxDuration: 60,
  memory: 1024,
};

// Untuk dapatkan __dirname versi ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedApp: any | null = null;

async function loadApp() {
  if (cachedApp) return cachedApp;

  const candidates = [
    '../dist/src/app.js',
    '../dist/app.js',
    '../src/app.js',
    '../app.js',
  ];

  for (const candidate of candidates) {
    const fullPath = path.resolve(__dirname, candidate);
    console.log('🔍 Checking', fullPath);
    try {
      const mod = await import(pathToFileURL(fullPath).href);
      cachedApp = mod.default || mod;
      console.log('✅ Loaded app from', candidate);
      return cachedApp;
    } catch (err) {
      // lanjut ke kandidat berikut
    }
  }

  console.error('❌ No valid app found in any candidate paths');
  return null;
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
