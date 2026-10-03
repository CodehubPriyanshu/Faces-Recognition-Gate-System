import assert from "node:assert/strict";
import { startPythonServer } from "./python-server.mjs";

// Run after the matching build; no application database is touched.
const netlify = process.argv.includes("--netlify");
const python = await startPythonServer({ APP_URL: "https://smoke.netlify.app" });
process.env.API_PROXY_URL = python.url;
try {
  const entry = netlify
    ? await import("../.netlify/v1/functions/server.mjs")
    : await import("../dist/server/server.js");
  const fetchHandler = netlify ? entry.default : (request) => entry.default.fetch(request);
  const base = "https://smoke.netlify.app";
  let response = await fetchHandler(new Request(`${base}/login`));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  response = await fetchHandler(new Request(`${base}/api/auth/session`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: null });
  response = await fetchHandler(
    new Request(`${base}/api/auth/login`, {
      method: "POST",
      headers: { origin: "https://untrusted.example", "content-type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(response.status, 403);
  if (netlify) {
    assert.equal(entry.config.path, "/*");
    assert.equal(entry.config.preferStatic, true);
  }
  console.log(
    `${netlify ? "Netlify Function" : "Local SSR"}: login SSR, API GET, and POST origin checks passed.`,
  );
} finally {
  await python.stop();
}
