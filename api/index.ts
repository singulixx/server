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
    const mod = await import('../src/' + 'app.js'); // concatenation avoids TS static resolution
    cachedApp = mod && mod.default ? mod.default : mod;
    if (cachedApp) return cachedApp;
  } catch (err) {
    // ignore
  }

  // 2) Try compiled entry point dist/src/index.js (tsc with outDir: 'dist' and rootDir: '.')
  try {
    const mod = await import('../dist/src/' + 'index.js');
    cachedApp = mod && mod.default ? mod.default : mod;
    if (cachedApp) return cachedApp;
  } catch (err) {
    // ignore
  }

  // 3) Try compiled app module dist/src/app.js
  try {
    const mod = await import('../dist/src/' + 'app.js');
    cachedApp = mod && mod.default ? mod.default : mod;
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
      'Server entry not found. Checked ../src/app.js, ../dist/src/index.js, ../dist/src/app.js. ' +
      'Ensure your build produces dist/src/*.js or that src/app.js exists.'
    );
    return;
  }

  // If app is a handler function (connect/vercel style)
  if (typeof app === 'function') return app(req, res);

  // If Express app instance
  if (app && typeof app.handle === 'function') return app.handle(req, res);

  res.statusCode = 500;
  res.end('Invalid server export: expected function or Express app');
}
