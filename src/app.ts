import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

// static import router yang dipakai
import authRouter from "./routes/auth";

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

// Health
app.get("/api/health", (_req: Request, res: Response) =>
  res.json({ ok: true })
);

// Routes
app.use("/api/auth", authRouter);

// Error handler global (TYPED)
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
