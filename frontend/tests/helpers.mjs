import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "node:url";

let client;
export async function getDatabase() {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  return client.db(process.env.MONGODB_DB_NAME);
}
export async function closeDatabase() {
  await client?.close();
}
export function digest(value) {
  return createHmac("sha256", process.env.AUTH_SECRET).update(value).digest("hex");
}
export function sessionCookie(token, maxAge) {
  return execFileSync(
    process.env.PYTHON_EXECUTABLE || "python",
    [
      "-c",
      "import sys; from app.security import session_cookie; print(session_cookie(sys.argv[1], float(sys.argv[2])))",
      token,
      String(maxAge),
    ],
    {
      cwd: fileURLToPath(new URL("../../backend/", import.meta.url)),
      encoding: "utf8",
    },
  ).trim();
}
