import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['x-cron-secret'] !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // TODO: put your real job logic here
  // Example: await someService.runJobs();
  res.json({ ok: true });
}