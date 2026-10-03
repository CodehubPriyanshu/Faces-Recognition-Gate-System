import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MongoMemoryServer } from "mongodb-memory-server";
import { closeDatabase, getDatabase, sessionCookie, digest } from "./helpers.mjs";
import { handleApi } from "../src/lib/api-proxy.server.js";
import { startPythonServer } from "../scripts/python-server.mjs";
import { randomBytes, scryptSync } from "node:crypto";

const run = promisify(execFile);
let mongo;
let db;
let cookie;
let python;
const base = "https://test.netlify.app";
async function request(path, { method = "GET", body, auth = cookie, origin = base } = {}) {
  const headers = {};
  if (auth) headers.cookie = auth;
  if (method === "POST") {
    headers.origin = origin;
    headers["content-type"] = "application/json";
  }
  return handleApi(
    new Request(`${base}/api/${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function login(email, password) {
  const response = await request("auth/login", {
    method: "POST",
    auth: null,
    body: { email, password },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /; Secure/);
  return response.headers.get("set-cookie").split(";")[0];
}
before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { downloadDir: fileURLToPath(new URL("../.cache/mongodb-binaries", import.meta.url)) },
  });
  Object.assign(process.env, {
    MONGODB_URI: mongo.getUri(),
    MONGODB_DB_NAME: "vigil_test",
    APP_URL: base,
    AUTH_SECRET: "test-secret-with-at-least-32-characters",
    ADMIN_EMAIL: "admin@example.com",
    ADMIN_NAME: "Test Admin",
    ADMIN_PASSWORD: "AdminTest123!",
  });
  const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
  const pythonOptions = { cwd: fileURLToPath(new URL("../../backend/", import.meta.url)) };
  await run(pythonExecutable, ["main.py", "--check-db"], pythonOptions);
  await run(pythonExecutable, ["main.py", "--seed-admin"], pythonOptions);
  const repeated = await run(pythonExecutable, ["main.py", "--seed-admin"], pythonOptions);
  assert.match(repeated.stdout, /already exists/);
  db = await getDatabase();
  python = await startPythonServer();
  process.env.API_PROXY_URL = python.url;
});
after(async () => {
  await python?.stop();
  await closeDatabase();
  await mongo?.stop();
});

test("MongoDB API feature smoke test and session security", async () => {
  assert.equal((await (await request("auth/session", { auth: null })).json()).user, null);
  assert.equal((await request("visitors", { auth: null })).status, 401);
  assert.equal(
    (
      await request("auth/login", {
        method: "POST",
        auth: null,
        origin: "https://evil.example",
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("auth/login", {
        method: "POST",
        auth: null,
        body: { email: "admin@example.com", password: "wrong" },
      })
    ).status,
    401,
  );
  cookie = await login("admin@example.com", "AdminTest123!");
  const session = await (await request("auth/session")).json();
  assert.equal(session.user.role, "admin");
  assert.equal(session.user.password_hash, undefined);
  assert.ok((await db.collection("users").indexes()).some((i) => i.unique && i.key.email === 1));
  const stored = await db.collection("sessions").findOne();
  assert.equal(stored._id, digest(cookie.split("=")[1]));

  const user = {
    email: "Guard@Example.com",
    full_name: "Guard",
    role: "security_guard",
    password: "GuardTest123!",
  };
  const created = await request("users", { method: "POST", body: user });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await request("users", { method: "POST", body: user })).status, 409);
  const users = await (await request("users")).json();
  assert.equal(users.length, 2);
  assert.equal(users.find((u) => u.id === id).email, "guard@example.com");
  assert.equal(users.find((u) => u.id === id).password_hash, undefined);
  const guardCookie = await login("guard@example.com", user.password);
  assert.equal((await request("users", { auth: guardCookie })).status, 403);
  assert.equal((await request("audit", { auth: guardCookie })).status, 403);

  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const image = `data:image/png;base64,${png.toString("base64")}`;
  const entry = await request("visitors", {
    method: "POST",
    auth: guardCookie,
    body: {
      full_name: "Visitor",
      mobile: "1234567890",
      id_type: "Passport",
      purpose: "Meeting",
      visitor_count: 1,
      photo: image,
      signature: image,
    },
  });
  assert.equal(entry.status, 201);
  const visitor = await entry.json();
  assert.equal(visitor.photo, undefined);
  assert.equal((await (await request(`visitors/${visitor.id}`)).json()).id, visitor.id);
  for (const kind of ["photo", "signature"]) {
    assert.equal((await request(`visitors/${visitor.id}/${kind}`, { auth: null })).status, 401);
    const response = await request(`visitors/${visitor.id}/${kind}`);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  }
  assert.equal((await (await request("visitors?active=true&limit=500")).json()).length, 1);
  assert.equal((await request("visitors?limit=10001")).status, 400);
  assert.equal(
    (await request(`visitors/${visitor.id}/exit`, { method: "POST", body: { confidence: 2 } }))
      .status,
    400,
  );
  const exited = await request(`visitors/${visitor.id}/exit`, {
    method: "POST",
    body: { confidence: 0.95 },
  });
  assert.equal(exited.status, 200);
  assert.equal((await exited.json()).status, "exited");
  assert.equal(
    (await request(`visitors/${visitor.id}/exit`, { method: "POST", body: { confidence: 0.95 } }))
      .status,
    409,
  );
  assert.equal((await (await request("visitors?active=true")).json()).length, 0);
  assert.equal((await (await request("visitors?limit=500")).json()).length, 1);

  assert.equal(
    (await request(`users/${id}/password`, { method: "POST", body: { password: "NewGuard123!" } }))
      .status,
    200,
  );
  assert.equal((await (await request("auth/session", { auth: guardCookie })).json()).user, null);
  const newGuardCookie = await login("guard@example.com", "NewGuard123!");
  assert.equal(
    (await request(`users/${session.user.id}/delete`, { method: "POST", body: {} })).status,
    400,
  );
  assert.equal((await request(`users/${id}/delete`, { method: "POST", body: {} })).status, 200);
  assert.equal((await (await request("auth/session", { auth: newGuardCookie })).json()).user, null);
  const logs = await (await request("audit")).json();
  for (const action of [
    "USER.CREATE",
    "USER.PASSWORD_UPDATE",
    "USER.DELETE",
    "visitor.entry",
    "visitor.exit",
  ]) {
    assert.ok(
      logs.some((log) => log.action === action),
      action,
    );
  }
  assert.equal((await request("auth/logout", { method: "POST", body: {} })).status, 200);
  assert.equal((await (await request("auth/session")).json()).user, null);
  assert.equal(await db.collection("sessions").countDocuments(), 0);
});

test("HTTP local and HTTPS Netlify cookie flags", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldUrl = process.env.APP_URL;
  try {
    process.env.NODE_ENV = "development";
    process.env.APP_URL = "http://localhost:8080";
    assert.doesNotMatch(sessionCookie("token", 3600), /; Secure/);
    process.env.NODE_ENV = "production";
    assert.doesNotMatch(sessionCookie("token", 3600), /; Secure/);
    process.env.APP_URL = base;
    assert.match(sessionCookie("", 0), /Max-Age=0; Secure/);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    process.env.APP_URL = oldUrl;
  }
});

test("Node password, existing session and BSON image compatibility", async () => {
  const password = "LegacyTest123!";
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  const id = "legacy-node-user";
  await db.collection("users").insertOne({
    _id: id,
    email: "legacy@example.com",
    full_name: "Legacy",
    role: "gate_operator",
    password_hash: `scrypt:${salt}:${hash}`,
    created_at: new Date().toISOString(),
  });
  const legacyCookie = await login("legacy@example.com", password);
  const oldToken = randomBytes(32).toString("hex");
  const oldCookie = `vigil_session=${oldToken}`;
  await db.collection("sessions").insertOne({
    _id: digest(oldToken),
    user_id: id,
    auth_version: 0,
    expires_at: new Date(Date.now() + 60000),
  });
  assert.equal((await (await request("auth/session", { auth: oldCookie })).json()).user.id, id);
  const image = Buffer.from([255, 216, 255]);
  await db.collection("visitors").insertOne({
    _id: "legacy-node-visitor",
    pass_no: "BSF-LEGACY",
    photo: { data: image, contentType: "image/jpeg" },
  });
  const photo = await request("visitors/legacy-node-visitor/photo", { auth: legacyCookie });
  assert.equal(photo.status, 200);
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), image);
  const admin = await db.collection("users").findOne({ email: "admin@example.com" });
  const [, pythonSalt, pythonHash] = admin.password_hash.split(":");
  assert.equal(scryptSync("AdminTest123!", pythonSalt, 64).toString("hex"), pythonHash);
  await db.collection("users").updateOne({ _id: id }, { $inc: { auth_version: 1 } });
  assert.equal((await (await request("auth/session", { auth: oldCookie })).json()).user, null);
  await db.collection("users").deleteOne({ _id: id });
  await db.collection("sessions").deleteMany({ user_id: id });
  await db.collection("visitors").deleteOne({ _id: "legacy-node-visitor" });
});

test("rate limit, bounded JSON, validation, role and endpoint statuses", async () => {
  const call = (body, headers = {}) =>
    handleApi(
      new Request(`${base}/api/auth/login`, {
        method: "POST",
        headers: { origin: base, "content-type": "application/json", ...headers },
        body,
      }),
    );
  assert.equal((await call("{}", { "content-type": "text/plain" })).status, 415);
  assert.equal((await call("{")).status, 400);
  assert.equal((await call("{}")).status, 400);
  assert.equal(
    (await call(JSON.stringify({ email: "admin@example.com", password: "x", extra: true }))).status,
    400,
  );
  assert.equal((await call("x".repeat(4097))).status, 413);
  assert.equal((await call("{}", { "sec-fetch-site": "cross-site" })).status, 403);
  const email = "ratelimit@example.com";
  for (let i = 0; i < 11; i++) {
    const response = await request("auth/login", {
      method: "POST",
      auth: null,
      body: { email, password: "wrong" },
    });
    assert.equal(response.status, i < 10 ? 401 : 429);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const attempt = await db.collection("login_attempts").findOne({
    _id: digest(`login:${email}:${Math.floor(Date.now() / 900000)}`),
  });
  assert.equal(attempt.count, 11);
  assert.ok(attempt.expires_at > new Date(Date.now() + 29 * 60000));
  const adminCookie = await login("admin@example.com", "AdminTest123!");
  assert.equal((await request("unknown", { auth: adminCookie })).status, 404);
  assert.equal((await request("visitors/missing", { auth: adminCookie })).status, 404);
  assert.equal(
    (
      await request("users/missing/password", {
        method: "POST",
        auth: adminCookie,
        body: { password: "ValidTest123" },
      })
    ).status,
    404,
  );
  for (const [collection, count] of [
    ["users", 2],
    ["sessions", 3],
    ["login_attempts", 2],
    ["visitors", 4],
    ["audit_logs", 2],
  ]) {
    assert.equal((await db.collection(collection).indexes()).length, count);
  }
  await request("auth/logout", { method: "POST", auth: adminCookie, body: {} });
});

test("credentialed CORS allows exactly APP_URL", async () => {
  const allowed = await fetch(`${python.url}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin: base,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), base);
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  assert.equal(allowed.headers.get("cache-control"), "no-store");
  const denied = await fetch(`${python.url}/api/auth/login`, {
    method: "OPTIONS",
    headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
  });
  assert.equal(denied.status, 400);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});

test("anonymous sessions bypass unavailable DB; failures stay sanitized", async () => {
  const unavailable = await startPythonServer({ MONGODB_URI: "invalid-test-uri" });
  try {
    const anonymous = await fetch(`${unavailable.url}/api/auth/session`);
    assert.equal(anonymous.status, 200);
    assert.deepEqual(await anonymous.json(), { user: null });
    const failure = await fetch(`${unavailable.url}/api/auth/login`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "wrong" }),
    });
    assert.equal(failure.status, 503);
    assert.deepEqual(await failure.json(), {
      error: "Database request failed. Check the MongoDB connection and server configuration.",
    });
  } finally {
    await unavailable.stop();
  }
  const badSecret = await startPythonServer({ AUTH_SECRET: "" });
  try {
    const failure = await fetch(`${badSecret.url}/api/auth/login`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "wrong" }),
    });
    assert.equal(failure.status, 503);
    assert.equal((await failure.json()).error.includes("AUTH_SECRET"), false);
  } finally {
    await badSecret.stop();
  }
});
