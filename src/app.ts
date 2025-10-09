import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmetPkg from "helmet";
import compression from "compression";
import authRouter from "./routes/auth.js";
import procurementsRouter from "./routes/procurements.js";

// normalize helmet export for ESM/CJS compatibility
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

// Root route — make / useful (redirect to health or return info)
app.get("/", (_req: Request, res: Response) => {
  res.redirect("/api/health");
  // alternatively: res.json({ ok: true, message: "API running" });
});

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Register routes
app.use("/api/auth", authRouter);
app.use("/api/procurements", procurementsRouter);

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
