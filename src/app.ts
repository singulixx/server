import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

// ⬇️ STATIC IMPORT untuk route yang pasti ada
import authRouter from "./routes/auth"; // <-- tanpa ekstensi, biar dibundle

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
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ⬇️ PASANG ROUTER YANG DIPAKAI WEB
app.use("/api/auth", authRouter);

// --- (opsional) Tambahkan lain kalau memang ada file-nya ---
// import usersRouter from "./routes/users";
// app.use("/api/users", usersRouter);
// import productsRouter from "./routes/products";
// app.use("/api/products", productsRouter);
// ... dst

export default app;
