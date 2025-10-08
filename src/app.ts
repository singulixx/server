import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmetPkg from "helmet";
import compression from "compression";

// Import semua router
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import reportsRouter from "./routes/reports.js";
import reportWithStoreRouter from "./routes/report_with_store.js";
import productsRouter from "./routes/products.js";
import transactionsRouter from "./routes/transactions.js";
import storesRouter from "./routes/stores.js";
import productMediaRouter from "./routes/product_media.js";
import procurementsRouter from "./routes/procurements.js";
import auditRouter from "./routes/audit.js";
import accountRouter from "./routes/account.js";
import channelsRouter from "./routes/channels.js";
import passwordRouter from "./routes/password.js";
import sortRouter from "./routes/sort.js";
import uploadRouter from "./routes/upload.js";
import ballsRouter from "./routes/balls.js";

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
      if (!origin) return cb(null, true);
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

app.options("*", cors());
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

// ✅ Register semua routes di sini
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/report_with_store", reportWithStoreRouter);
app.use("/api/products", productsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/stores", storesRouter);
app.use("/api/product_media", productMediaRouter);
app.use("/api/procurements", procurementsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/account", accountRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/password", passwordRouter);
app.use("/api/sort", sortRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/balls", ballsRouter);

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("UNCAUGHT_ERROR:", err);
  const msg =
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as any).message === "string"
      ? (err as any).message
      : "Internal Server Error";
  res.status(500).json({ error: msg });
});

export default app;
