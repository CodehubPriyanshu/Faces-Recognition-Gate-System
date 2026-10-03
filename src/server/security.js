import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const scrypt = promisify(scryptCallback);
export const roles = ["admin", "security_guard", "gate_operator"];
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, "Need an uppercase letter")
  .regex(/[0-9]/, "Need a number");
export const userSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((email) => email.toLowerCase()),
    full_name: z.string().trim().min(1).max(120),
    role: z.enum(roles),
    password: passwordSchema,
  })
  .strict();

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password, encoded) {
  const [algorithm, salt, hash] = (encoded || "").split(":");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function digest(value) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    created_at: user.created_at,
  };
}

export function assertRole(user, allowed = roles) {
  if (!user || !allowed.includes(user.role)) throw new ApiError(403, "Forbidden");
}

export const COOKIE_NAME = "vigil_session";
export function readToken(request) {
  const cookie = request.headers.get("cookie") || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
}

export function sessionCookie(token, maxAge) {
  const secure = process.env.APP_URL
    ? new URL(process.env.APP_URL).protocol === "https:"
    : process.env.NODE_ENV === "production";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export async function currentUser(db, request) {
  const token = readToken(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db
    .collection("sessions")
    .findOne({ _id: digest(token), expires_at: { $gt: new Date() } });
  if (!session) return null;
  const user = await db.collection("users").findOne({ _id: session.user_id });
  return user && (user.auth_version || 0) === (session.auth_version || 0) ? user : null;
}

export function checkOrigin(request) {
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (
    request.headers.get("origin") !== expected ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new ApiError(403, "Request origin is not allowed");
  }
}

export async function readJson(request, maxBytes = 6 * 1024 * 1024) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(415, "Expected JSON");
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new ApiError(413, "Request is too large");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Request body is required");
  let size = 0;
  const parts = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, "Request is too large");
    }
    parts.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new ApiError(400, "Invalid JSON");
  }
}

export function decodeImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new ApiError(400, "Images must be JPEG or PNG");
  const data = Buffer.from(match[2], "base64");
  if (!data.length || data.length > 2 * 1024 * 1024)
    throw new ApiError(400, "Each image must be at most 2 MB");
  const valid =
    match[1] === "image/png"
      ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : data[0] === 255 && data[1] === 216 && data[2] === 255;
  if (!valid) throw new ApiError(400, "Invalid image content");
  return { data, contentType: match[1] };
}
