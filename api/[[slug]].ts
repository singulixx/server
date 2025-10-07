import app from "../src/app.js";

export const config = { runtime: "nodejs", maxDuration: 60, memory: 1024 };

export default function handler(req: any, res: any) {
  return (app as any)(req, res);
}
