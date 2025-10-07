import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import cors from "cors";

// import router kamu
import app from "../src/app";

const server = express();
server.use(cors());
server.use(express.json());
server.use("/api", app);

export default function handler(req: VercelRequest, res: VercelResponse) {
  return server(req as any, res as any);
}
