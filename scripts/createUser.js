// scripts/createUser.js
import "dotenv/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const secret = process.env.JWT_SECRET || "devsecret";

function secondsUntilNextJakartaMidnight() {
  const nowSec = Math.floor(Date.now() / 1000);
  const offset = 7 * 3600; // Asia/Jakarta UTC+7
  const localDayStart = Math.floor((nowSec + offset) / 86400) * 86400 - offset;
  const nextMidnight = localDayStart + 86400;
  return Math.max(60, nextMidnight - nowSec);
}

function parseArgs() {
  const [username, password, name, role] = process.argv.slice(2);
  if (!username || !password) {
    console.error(
      'Usage:\n  node scripts/createUser.js <username> <password> "<name?>" <OWNER|STAFF?>'
    );
    process.exit(1);
  }
  const normalizedRole = role === "OWNER" ? "OWNER" : "STAFF";
  return { username, password, name: name || "User", role: normalizedRole };
}

async function main() {
  const { username, password, name, role } = parseArgs();

  // pastikan schema Prisma cocok dengan DB (ada kolom username)
  // prisma.validate tidak tersedia sebagai API, jadi kita langsung proceed

  // hash password
  const hashed = await bcrypt.hash(password, 10);

  // buat user
  const user = await prisma.user.create({
    data: { username, password: hashed, name, role },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });

  // buat JWT yang expired di tengah malam WIB
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: secondsUntilNextJakartaMidnight() }
  );

  console.log("✅ User created:");
  console.log(JSON.stringify({ user, token }, null, 2));
}

main()
  .catch((e) => {
    console.error("❌ Failed to create user:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
