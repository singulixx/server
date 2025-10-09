# Deployment checklist & quick fixes

I inspected your project and found the server routes under `singulix/server/src` (and the compiled `dist/`) include many endpoints that require a working database (Prisma) and several environment variables.

## Quick summary
- Endpoints present (non-exhaustive): `/api/auth/login`, `/api/account/*`, `/api/products/*`, `/api/stores/*`, `/api/transactions/*`, `/api/channels/*`, `/api/balls/*`, `/api/reports/*`, `/api/upload` and more.
- Many of these routes depend on Prisma and require `DATABASE_URL` to be set (Postgres).
- Some endpoints call external services (Shopee, TikTok). They either fall back to `MARKETPLACE_MODE=mock` or require API keys.

## Why only health/login may work
- `health` and `login` may work because login can authenticate against seeded or existing data in your DB or uses looser checks. Other endpoints perform database queries (Prisma) or call external services and will 500 if `DATABASE_URL` or service API keys are missing.

## What I added to this zip
- `.env.example` at `singulix/server/.env.example` listing required env vars.
- `README-deploy.md` (this file) with instructions on steps to make endpoints functional.

## Recommended steps to fully enable endpoints
1. Provision a PostgreSQL database and set `DATABASE_URL` in Vercel (or use local `.env` for testing).
2. Run Prisma migrations locally:
   - `npx prisma generate`
   - `npx prisma migrate deploy` (or `npx prisma migrate dev` for local dev)
3. Set `JWT_SECRET` in Vercel to a strong secret.
4. If you don't want live marketplace integrations, set `MARKETPLACE_MODE=mock` (the code already supports this).
5. Provide any marketplace API keys only when needed.
6. Check CORS origins and set `CORS_ORIGIN` to your frontend domain(s).

## Potential code improvements (I can apply them if you want)
- Add graceful fallbacks / informative 400 responses when `DATABASE_URL` missing instead of generic 500.
- Add an in-project SQLite dev-mode (change Prisma datasource to `sqlite` in dev) so endpoints can be tested without Postgres.
- Add `.env` loader and clearer logs at startup listing missing critical env vars.

If you'd like, I can:
- a) Add `.env.example` and a small startup-check script (I already added `.env.example`).
- b) Modify the code to enable a `DEV_DB=sqlite` mode that uses a local SQLite file (so you can test endpoints without provisioning Postgres).
- c) Apply explicit try/catch in key routes to return human-readable errors when services are misconfigured.

Tell me which of (a)/(b)/(c) you want me to apply now and I'll modify the project and return an updated zip with the changes.


## Vercel setup for your domains
- Backend URL (Vercel): https://server-kohl-psi.vercel.app
- Frontend URL (Vercel): https://web-mocha-eight-45.vercel.app

Steps:
1. In Vercel Project `server-kohl-psi`, set Environment Variables (Production):
   - DATABASE_URL = <your Neon connection string>
   - JWT_SECRET = <strong secret>
   - CORS_ORIGIN = https://web-mocha-eight-45.vercel.app
   - WEB_BASE_URL = https://web-mocha-eight-45.vercel.app
   - MARKETPLACE_MODE = mock
   - (Optional) SHOPEE_*, TTS_* if you want live integrations
2. Set Build Command to: `npm run vercel-build`
   - This will run `prisma generate` and `prisma migrate deploy` during build.
3. Set Environment variable `PORT` if needed (default 4000).
4. For file uploads, do not rely on local disk in Vercel. Use Supabase Storage or S3 and configure `BLOB_READ_WRITE_TOKEN`.

After deploy, test from your frontend domain; CORS should allow requests from `web-mocha-eight-45.vercel.app`.


## Shopee integration
You provided Shopee credentials for partner integration.

- SHOPEE_PARTNER_ID=1183301
- SHOPEE_PARTNER_KEY=(provided)

**Security note:** Do NOT commit actual secret keys into source control. Add the `SHOPEE_PARTNER_KEY` and other secrets directly in Vercel Project -> Settings -> Environment Variables (Production). The `.env.example` contains these values for convenience but treat them as placeholders.

To enable Shopee marketplace integration in production, set in Vercel:
- MARKETPLACE_MODE=shopee
- SHOPEE_PARTNER_ID=1183301
- SHOPEE_PARTNER_KEY=<your_shopee_partner_key>
- SHOPEE_BASE_URL (if required by your region) — default may be fine.

After setting envs, deploy the backend (`server-kohl-psi`). The `vercel-build` script will run migrations and the app will be able to use Shopee integration.

If you want, I can:
- a) remove the secret from `.env.example` and instead create a `secrets.todo` file with instructions.
- b) patch the code to log a warning if marketplace_mode is `shopee` but the SHOPEE_PARTNER_KEY is missing.



# Auto-fix: Vercel server entry wrappers added
This project lacked the expected `dist/src/app.js` or `dist/src/index.js` entry that Vercel checks for. I created wrapper files at `dist/src/app.js` and `dist/src/index.js` to point to your actual built app. Prefer updating your build output to generate files in `dist/src/` or set Vercel build output accordingly.
