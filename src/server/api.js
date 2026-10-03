import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "./database.js";
import {
  ApiError,
  assertRole,
  checkOrigin,
  currentUser,
  decodeImage,
  digest,
  hashPassword,
  passwordSchema,
  publicUser,
  readJson,
  readToken,
  sessionCookie,
  userSchema,
  verifyPassword,
} from "./security.js";

const optionalText = z.string().trim().max(500).nullable().optional();
const visitorSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120),
    mobile: z.string().trim().min(5).max(30),
    id_type: z.string().trim().min(1).max(50),
    id_number: optionalText,
    purpose: z.string().trim().min(1).max(100),
    whom_to_meet: optionalText,
    vehicle_number: optionalText,
    visitor_count: z.coerce.number().int().min(1).max(1000),
    in_charge_name: optionalText,
    remarks: optionalText,
    photo: z.string().max(3 * 1024 * 1024),
    signature: z.string().max(3 * 1024 * 1024),
  })
  .strict();

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
}

export async function audit(db, user, action, target, metadata = null) {
  await db.collection("audit_logs").insertOne({
    _id: randomUUID(),
    action,
    actor_id: user._id,
    actor_email: user.email,
    actor_role: user.role,
    target,
    metadata,
    ts: new Date().toISOString(),
  });
}

function visitorJson(visitor) {
  const { _id, photo, signature, ...fields } = visitor;
  return { ...fields, id: _id };
}

export async function handleApi(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
    const method = request.method;
    if (!["GET", "POST"].includes(method)) return json({ error: "Method not allowed" }, 405);
    if (method === "POST") checkOrigin(request);
    // Anonymous session checks don't need a database connection.
    if (path === "auth/session" && method === "GET" && !readToken(request))
      return json({ user: null });
    const db = await getDatabase();
    if (path === "auth/login" && method === "POST") {
      const input = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(255)
            .transform((s) => s.toLowerCase()),
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(await readJson(request, 4096));
      const attemptId = digest(`login:${input.email}:${Math.floor(Date.now() / 900000)}`);
      const attempts = await db
        .collection("login_attempts")
        .findOneAndUpdate(
          { _id: attemptId },
          { $inc: { count: 1 }, $setOnInsert: { expires_at: new Date(Date.now() + 1800000) } },
          { upsert: true, returnDocument: "after" },
        );
      if (attempts.count > 10)
        throw new ApiError(429, "Too many login attempts. Try again in 15 minutes.");
      const user = await db.collection("users").findOne({ email: input.email });
      // Perform the same expensive password operation for unknown accounts.
      const encoded = user?.password_hash || `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;
      if (!(await verifyPassword(input.password, encoded)) || !user)
        throw new ApiError(401, "Invalid email or password");
      assertRole(user);
      const token = randomBytes(32).toString("hex");
      const hours = Number(process.env.SESSION_TTL_HOURS || 12);
      const maxAge = Math.max(1, Math.min(Number.isFinite(hours) ? hours : 12, 168)) * 3600;
      const oldToken = readToken(request);
      if (oldToken) await db.collection("sessions").deleteOne({ _id: digest(oldToken) });
      await db.collection("sessions").insertOne({
        _id: digest(token),
        user_id: user._id,
        auth_version: user.auth_version || 0,
        expires_at: new Date(Date.now() + maxAge * 1000),
      });
      await db.collection("login_attempts").deleteOne({ _id: attemptId });
      return json({ user: publicUser(user) }, 200, { "Set-Cookie": sessionCookie(token, maxAge) });
    }
    if (path === "auth/logout" && method === "POST") {
      const token = readToken(request);
      if (token) await db.collection("sessions").deleteOne({ _id: digest(token) });
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    const user = await currentUser(db, request);
    if (path === "auth/session" && method === "GET")
      return json({ user: user ? publicUser(user) : null });
    if (!user) throw new ApiError(401, "Please sign in");
    assertRole(user);

    if (path === "users" && method === "GET") {
      assertRole(user, ["admin"]);
      const users = await db
        .collection("users")
        .find({}, { projection: { password_hash: 0 } })
        .sort({ created_at: 1 })
        .toArray();
      return json(users.map(publicUser));
    }
    if (path === "users" && method === "POST") {
      assertRole(user, ["admin"]);
      const input = userSchema.parse(await readJson(request, 8192));
      const created = {
        _id: randomUUID(),
        email: input.email,
        full_name: input.full_name,
        role: input.role,
        password_hash: await hashPassword(input.password),
        created_at: new Date().toISOString(),
      };
      await db.collection("users").insertOne(created);
      await audit(db, user, "USER.CREATE", created.email, { role: created.role });
      return json({ ok: true, id: created._id }, 201);
    }
    const userAction = /^users\/([^/]+)\/(delete|password)$/.exec(path);
    if (userAction && method === "POST") {
      const [, id, action] = userAction;
      if (action === "delete" || id !== user._id) assertRole(user, ["admin"]);
      if (action === "delete" && id === user._id)
        throw new ApiError(400, "Cannot delete your own account");
      const target = await db.collection("users").findOne({ _id: id });
      if (!target) throw new ApiError(404, "User not found");
      if (action === "delete") {
        await db.collection("users").deleteOne({ _id: id });
      } else {
        const { password } = z
          .object({ password: passwordSchema })
          .strict()
          .parse(await readJson(request, 4096));
        await db.collection("users").updateOne(
          { _id: id },
          {
            $set: {
              password_hash: await hashPassword(password),
              updated_at: new Date().toISOString(),
            },
            $inc: { auth_version: 1 },
          },
        );
      }
      await db.collection("sessions").deleteMany({ user_id: id });
      await audit(
        db,
        user,
        action === "delete" ? "USER.DELETE" : "USER.PASSWORD_UPDATE",
        target.email,
      );
      return json({ ok: true });
    }
    if (path === "audit" && method === "GET") {
      assertRole(user, ["admin"]);
      const records = await db
        .collection("audit_logs")
        .find()
        .sort({ ts: -1 })
        .limit(500)
        .toArray();
      return json(records.map(({ _id, ...record }) => ({ id: _id, ...record })));
    }
    if (path === "visitors" && method === "GET") {
      const active = url.searchParams.get("active") === "true";
      const requestedLimit = Number(url.searchParams.get("limit") || 1000);
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 10000)
        throw new ApiError(400, "Invalid limit");
      const records = await db
        .collection("visitors")
        .find(active ? { status: "in_campus", exit_time: null } : {}, {
          projection: { photo: 0, signature: 0 },
        })
        .sort({ entry_time: -1 })
        .limit(requestedLimit)
        .toArray();
      return json(records.map(visitorJson));
    }
    if (path === "visitors" && method === "POST") {
      const { photo, signature, ...input } = visitorSchema.parse(await readJson(request));
      const id = randomUUID();
      const now = new Date().toISOString();
      const visitor = {
        ...input,
        _id: id,
        pass_no: `BSF-${new Date().getFullYear()}-${randomBytes(6).toString("hex").toUpperCase()}`,
        entry_by: user._id,
        entry_time: now,
        created_at: now,
        status: "in_campus",
        exit_time: null,
        exit_by: null,
        exit_method: null,
        exit_confidence: null,
        photo: decodeImage(photo),
        signature: decodeImage(signature),
        photo_url: `/api/visitors/${id}/photo`,
        signature_url: `/api/visitors/${id}/signature`,
      };
      await db.collection("visitors").insertOne(visitor);
      await audit(db, user, "visitor.entry", visitor.pass_no, {
        full_name: visitor.full_name,
        visitor_id: id,
      });
      return json(visitorJson(visitor), 201);
    }
    const visitorAction = /^visitors\/([^/]+)(?:\/(photo|signature|exit))?$/.exec(path);
    if (visitorAction) {
      const [, id, action] = visitorAction;
      if (action === "exit" && method === "POST") {
        const input = z
          .object({ confidence: z.number().min(0).max(1) })
          .strict()
          .parse(await readJson(request, 4096));
        const visitor = await db.collection("visitors").findOneAndUpdate(
          { _id: id, status: "in_campus", exit_time: null },
          {
            $set: {
              status: "exited",
              exit_time: new Date().toISOString(),
              exit_by: user._id,
              exit_method: "ai_face",
              exit_confidence: input.confidence,
            },
          },
          { returnDocument: "after", projection: { photo: 0, signature: 0 } },
        );
        if (!visitor) throw new ApiError(409, "Visitor has already exited or no longer exists");
        await audit(db, user, "visitor.exit", visitor.pass_no, {
          visitor_id: id,
          confidence: input.confidence,
          method: "ai_face",
        });
        return json(visitorJson(visitor));
      }
      if (method === "GET" && action !== "exit") {
        const visitor = await db
          .collection("visitors")
          .findOne(
            { _id: id },
            { projection: action ? { [action]: 1 } : { photo: 0, signature: 0 } },
          );
        if (!visitor) throw new ApiError(404, "Visitor not found");
        if (!action) return json(visitorJson(visitor));
        const image = visitor[action];
        if (!image?.data) throw new ApiError(404, "Image not found");
        return new Response(Buffer.isBuffer(image.data) ? image.data : image.data.buffer, {
          headers: {
            "Content-Type": image.contentType,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    throw new ApiError(404, "Endpoint not found");
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json({ error: error.issues.map((issue) => issue.message).join("; ") }, 400);
    if (error.code === 11000)
      return json({ error: "That email or pass number already exists" }, 409);
    // Avoid returning connection strings or database details to the browser.
    console.error("API operation failed:", error.name);
    return json(
      { error: "Database request failed. Check the MongoDB connection and server configuration." },
      503,
    );
  }
}
