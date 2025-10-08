import app from "./app.js";

const PORT = process.env.PORT || 4000;

/**
 * Vercel will import & call the exported app; do not call app.listen() there.
 * Only run a local listener when NOT on Vercel.
 */
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 API running locally on http://localhost:${PORT}`);
  });
}

export default app;
