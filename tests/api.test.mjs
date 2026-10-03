import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MongoMemoryServer } from "mongodb-memory-server";
import { closeDatabase, getDatabase } from "../src/server/database.js";
import { handleApi } from "../src/server/api.js";
import { sessionCookie, digest } from "../src/server/security.js";

const run = promisify(execFile);
let mongo;
let db;
let cookie;
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
  await run(process.execPath, ["scripts/check-database.mjs"]);
  await run(process.execPath, ["scripts/seed-admin.mjs"]);
  const repeated = await run(process.execPath, ["scripts/seed-admin.mjs"]);
  assert.match(repeated.stdout, /already exists/);
  db = await getDatabase();
});
after(async () => {
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
