import "dotenv/config";
import express from "express";
import cors from "cors";
// import helmet safely for both ESM/CJS
import * as helmetNS from "helmet";
const helmetFactory = helmetNS.default ?? helmetNS;
import compression from "compression";
// Routes
import authRouter from "./routes/auth.js";
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
