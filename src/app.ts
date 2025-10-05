import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
// Import your middlewares & routes (adjust paths if needed)
// Example imports; keep or remove as per your project
// import responseEnvelope from "./middleware/responseEnvelope";
// import { auditMiddleware } from "./middleware/audit";

const app = express();

// CORS allowlist
const allowlist = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowlist.length === 0 || allowlist.includes(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET","HEAD","PUT","PATCH","POST","DELETE","OPTIONS"],
    allowedHeaders: ["Authorization","Content-Type","Accept","X-Requested-With"],
    exposedHeaders: ["Content-Disposition"],
  })
);
app.options("*", cors());

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "4mb" }));
// app.use(responseEnvelope);
// app.use(auditMiddleware);

// TODO: mount your real routers here (adjust import paths)
// app.use("/api/auth", authRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

export default app;