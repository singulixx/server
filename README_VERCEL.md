Deployment notes for Vercel / production:

- Run (locally or in CI) before deploy:
  npm ci
  npm run build

- Build outputs to dist/; ensure Vercel Build Command is `npm run build` and Root Directory is `server`.
- Patched imports: relative imports now include .js extensions to be compatible with Node ESM after build.
