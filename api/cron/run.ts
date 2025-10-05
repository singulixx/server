export const config = {
  runtime: "nodejs",
  maxDuration: 60,
  memory: 1024,
};

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  const given =
    req?.headers?.["x-cron-secret"] ??
    (req?.query ? (req.query as any).secret : undefined);

  if (secret && given !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // TODO: letakkan pekerjaan terjadwal kamu di sini
  // contoh:
  // await syncAllChannels();
  // await generateDailyReport();

  return res.json({ ok: true });
}
