import "dotenv/config";
import express from "express";
import cors from "cors";
// import helmet safely for both ESM/CJS
import * as helmetNS from "helmet";
const helmetFactory = helmetNS.default ?? helmetNS;
import compression from "compression";
// Routes
import authRouter from "./routes/auth.js";
import accountRouter from "./routes/account.js";
import auditRouter from "./routes/audit.js";
import ballsRouter from "./routes/balls.js";
import channelsRouter from "./routes/channels.js";
import passwordRouter from "./routes/password.js";
import procurementsRouter from "./routes/procurements.js";
import product_mediaRouter from "./routes/product_media.js";
import productsRouter from "./routes/products.js";
import report_with_storeRouter from "./routes/report_with_store.js";
import reportsRouter from "./routes/reports.js";
import sortRouter from "./routes/sort.js";
import storesRouter from "./routes/stores.js";
import transactionsRouter from "./routes/transactions.js";
import uploadRouter from "./routes/upload.js";
import usersRouter from "./routes/users.js";
const app = express();
// Startup env checks
if (!process.env.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL not set — if you are testing locally you can use DEV_DB=sqlite or set DATABASE_URL to Neon/Supabase.');
}

/** ✅ CORS allowlist */
const allowlist = (process.env.CORS_ORIGIN ?? "https://web-mocha-eight-45.vercel.app,http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({
    origin(origin, cb) {
        // Allow SSR/curl requests
        if (!origin)
            return cb(null, true);
        if (allowlist.includes(origin)) {
            return cb(null, true);
        }
        console.warn("❌ Blocked by CORS:", origin);
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
}));
// handle preflight globally
app.options("*", cors());
// Security + compression
app.use(helmetFactory());
app.use(compression());
app.use(express.json({ limit: "4mb" }));
// Health route
app.get("/api/health", (_req, res) => res.json({ ok: true }));
// Register auth router
app.use("/api/auth", authRouter);
app.use("/api/account", accountRouter);
app.use("/api/audit", auditRouter);
app.use("/api/auth", authRouter);
app.use("/api/balls", ballsRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/password", passwordRouter);
app.use("/api/procurements", procurementsRouter);
app.use("/api/product_media", product_mediaRouter);
app.use("/api/products", productsRouter);
app.use("/api/report_with_store", report_with_storeRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/sort", sortRouter);
app.use("/api/stores", storesRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/users", usersRouter);

/* Log mounted endpoints for debugging */
console.log('Mounted API routers:');
console.log(["/api/account", "/api/audit", "/api/auth", "/api/balls", "/api/channels", "/api/password", "/api/procurements", "/api/product_media", "/api/products", "/api/report_with_store", "/api/reports", "/api/sort", "/api/stores", "/api/transactions", "/api/upload", "/api/users"].join(', '));
// AUTO-MOUNT-ROUTERS-END
// Global error handler
app.use((err, _req, res, _next) => {
    console.error("UNCAUGHT_ERROR:", err);
    const msg = typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof err.message === "string"
        ? err.message
        : "Internal Server Error";
    res.status(500).json({ error: msg });
});
export default app;
