import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmetPkg from "helmet";
import compression from "compression";

// ✅ Import semua router
import accountRouter from "./routes/account.js";
import auditRouter from "./routes/audit.js";
import authRouter from "./routes/auth.js";
import ballsRouter from "./routes/balls.js";
import channelsRouter from "./routes/channels.js";
import passwordRouter from "./routes/password.js";
import procurementsRouter from "./routes/procurements.js";
import productsRouter from "./routes/products.js";
import productMediaRouter from "./routes/product_media.js";
import reportsRouter from "./routes/reports.js";
import reportWithStoreRouter from "./routes/report_with_store.js";
import sortRouter from "./routes/sort.js";
import storesRouter from "./routes/stores.js";
import transactionsRouter from "./routes/transactions.js";
import uploadRouter from "./routes/upload.js";
import usersRouter from "./routes/users.js";

// Normalize helmet export for ESM/CJS compatibility
const helmet = (helmetPkg as any).default ?? helmetPkg;

const app = express();

/** ✅ Setup CORS allowlist */
const allowlist = (
  process.env.CORS_ORIGIN ??
  "https://web-mocha-eight-45.vercel.app,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // Allow SSR / curl
      if (allowlist.includes(origin)) return cb(null, true);
      console.warn("❌ Blocked by CORS:", origin);
      cb(new Error(`Not allowed by CORS: ${origin}`));
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

// Handle preflight requests
app.options("*", cors());

// Security + compression
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "4mb" }));

// Root route
app.get("/", (_req: Request, res: Response) => {
  res.redirect("/api/health");
});

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});


// Shopee OAuth callback alias (for SHOPEE_REDIRECT_URL pointing to /api/shopee/callback)
// This simply forwards the request (with original query params) to the channels router handler.
app.get("/api/shopee/callback", (req: Request, res: Response) => {
  const qs = new URLSearchParams(req.query as any).toString();
  const target = `/api/channels/oauth/shopee/callback${qs ? "?" + qs : ""}`;
  res.redirect(target);
});

// ✅ Register semua route API
app.use("/api/account", accountRouter);
app.use("/api/audit", auditRouter);
app.use("/api/auth", authRouter);
app.use("/api/balls", ballsRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/password", passwordRouter);
app.use("/api/procurements", procurementsRouter);
app.use("/api/products", productsRouter);
app.use("/api/product-media", productMediaRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/report-with-store", reportWithStoreRouter);
app.use("/api/sort", sortRouter);
app.use("/api/stores", storesRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/users", usersRouter);

// ✅ Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("UNCAUGHT_ERROR:", err);
  const message =
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as any).message === "string"
      ? (err as any).message
      : "Internal Server Error";
  res.status(500).json({ ok: false, error: message });
});

export default app;
