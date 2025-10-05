import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

const app = express();

/** CORS allowlist (comma-separated) */
const allowlist = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowlist.length === 0 || allowlist.includes(origin))
        return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Accept",
      "X-Requested-With",
    ],
    exposedHeaders: ["Content-Disposition"],
  })
);
app.options("*", cors());

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "4mb" }));

// --- Health ---
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// --- Optional route auto-mount (akan dilewati jika file tidak ada) ---
async function mountOptional(modulePath: string, base: string) {
  try {
    const mod = await import(modulePath);
    const router = (mod?.default ?? mod) as any;
    if (router) app.use(base, router);
    // console.log("mounted", base, "=>", modulePath);
  } catch {
    // module tidak ditemukan → lewati
  }
}

// Sesuaikan daftar ini dengan file di src/routes/**
(async () => {
  await mountOptional("./routes/auth", "/api/auth");
  await mountOptional("./routes/password", "/api/password");
  await mountOptional("./routes/audit", "/api/audit");
  await mountOptional("./routes/balls", "/api/balls");
  await mountOptional("./routes/sort", "/api/sort");
  await mountOptional("./routes/products", "/api/products");
  await mountOptional("./routes/procurements", "/api/procurements");
  await mountOptional("./routes/product_media", "/api/product_media");
  await mountOptional("./routes/transactions", "/api/transactions");
  await mountOptional("./routes/channels", "/api/channels");
  await mountOptional("./routes/reports", "/api/reports");
  await mountOptional("./routes/stores", "/api/stores");
  await mountOptional("./routes/report_with_store", "/api/report-with-store");
  await mountOptional("./routes/upload", "/api/upload");
  await mountOptional("./routes/users", "/api/users");
})();

export default app;
