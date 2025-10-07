import { Router } from "express";
// @ts-ignore - optional auth middleware in your codebase
// import { authRequired } from "../utils/auth.js";
import { put } from "@vercel/blob";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });
const r = Router();
// r.use(authRequired);

r.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const filename = `${Date.now()}-${(req.file.originalname ?? "upload.bin").replace(/\s+/g, "_")}`;
  const blob = await put(filename, req.file.buffer, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  res.json({ url: blob.url });
});

export default r;