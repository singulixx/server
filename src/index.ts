import "dotenv/config";
import app from "./app";
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {"use strict";
  console.log(`API listening on http://localhost:${PORT}`);
});

// Optional: start local cron jobs ONLY in dev
if (process.env.NODE_ENV !== "production") {
  try {
    // const { scheduleJobs } = await import("./jobs/scheduler");
    // scheduleJobs();
  } catch (e) {
    // ignore if not present
  }
}

export default server;