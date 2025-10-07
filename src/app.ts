import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import compression from "compression";

// Routes
import authRouter from "./routes/auth.js";

const app = express();

/** ✅ CORS Allowlist */
const allowlist = (
  process.env.CORS_ORIGIN ??
  "https://web-mocha-eight-45.vercel.app,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = origin && allowlist.includes(origin);

  // ❗ gunakan hanya satu nilai origin, jangan gabungan
  res.setHeader(
    "Access-Control-Allow-Origin",
    allowed ? origin! : allowlist[0]
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,Accept,X-Requested-With"
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  next();
});

// Security + compression
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "4mb" }));

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// Auth routes
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
