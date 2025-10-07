import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type Secret } from "jsonwebtoken";
import prisma from "../utils/prisma.js";

function secondsUntilNextJakartaMidnight(): number {
  const nowSec = Math.floor(Date.now() / 1000);
  const offset = 7 * 3600;
  const localDayStart = Math.floor((nowSec + offset) / 86400) * 86400 - offset;
  return Math.max(60, localDayStart + 86400 - nowSec);
}

const r = Router();
const secret = (process.env.JWT_SECRET || "devsecret") as Secret;

r.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, email, identifier, password } = (req.body || {}) as {
      username?: string;
      email?: string;
      identifier?: string;
      password?: string;
    };
    const loginId = (username ?? email ?? identifier ?? "").trim();
    if (!loginId || !password) {
      return res.status(400).json({ error: "Username & password required" });
    }

    const user = await prisma.user.findUnique({ where: { username: loginId } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      secret,
      { expiresIn: secondsUntilNextJakartaMidnight() }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default r;
