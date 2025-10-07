import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
// import helmet safely for both ESM/CJS
import helmet from "helmet";
import compression from "compression";

// Routes
import authRouter from "./routes/auth.js";

const app = express();

/** ✅ CORS allowlist */
const allowlist = (
  process.env.CORS_ORIGIN ??
  "https://web-mocha-eight-45.vercel.app,http://localhost:5432"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Allow SSR/curl requests
      if (!origin) return cb(null, true);

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
  })
);

// handle preflight globally
app.options("*", cors());

// Security + compression
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "4mb" }));

// Health route
app.get("/api/health", (_req: Request, res: Response) =>
  res.json({ ok: true })
);

// Register auth router
app.use("/api/auth", authRouter);

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
