# Python backend migration verification

Verified on 3 October 2026. No live site deployment was performed.

## Changes

Created:

- `main.py`, `requirements.txt`
- `backend/__init__.py`, `backend/api.py`, `backend/database.py`,
  `backend/security.py`, `backend/schemas.py`
- `Dockerfile`, `.dockerignore`
- `scripts/python-server.mjs`, `tests/helpers.mjs`
- `src/lib/api-proxy.server.js`: HTTP forwarding only, preserving cookies,
  origin headers, status codes and binary responses.
- `MIGRATION_VERIFICATION.md`

Updated:

- `src/routes/api/$.js`: uses the frontend HTTP forwarding layer.
- `src/lib/api.js`: public VITE_API_URL and credentialed requests; image URLs
  remain on the frontend proxy so existing React/image/PDF callers work.
- `package.json`, `package-lock.json`: database commands run Python directly;
  Node MongoDB driver is only a test dependency.
- `scripts/smoke-ssr.mjs`, `tests/api.test.mjs`: verify real FastAPI HTTP behavior.
- `vite.config.js`: strip generated TypeScript footer in memory and dependency
  scans, fixing development reload loops without editing React routes.
- `eslint.config.js`: exclude generated test cache and Python virtualenv.
- `.env.example`, `.gitignore`, `netlify.toml`, `README.md`

`.env` was removed from the Git index and kept on disk. It and deployment.env
are ignored. No React JSX routes changed.

Removed: `src/server/api.js`, `src/server/database.js`, `src/server/security.js`,
`scripts/check-database.mjs`, `scripts/seed-admin.mjs`. Node remains necessary
for React/TanStack rendering and development/test tooling; all backend business
logic and persistence run in Python.

## Results

| Check                    | Result                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Python runtime           | Isolated CPython 3.12.13; backend compilation passes                                                                                     |
| Dependencies             | All 21 installed packages compatible                                                                                                     |
| Integration suite        | 7/7 pass on Python 3.12 against temporary real MongoDB and uvicorn                                                                       |
| Password migration       | Node-created scrypt hash accepted by Python; Python-created hash matches Node verification                                               |
| Existing sessions/images | Node HMAC identifiers, BSON dates and binary images remain usable; auth_version revocation verified                                      |
| Login/security           | Cookies, origin/role checks, 11th-attempt 429, 400 validation, 413/415, 401/403/404/409 and sanitized 503 verified                       |
| Application flow         | Login, user management, visitor entry/image retrieval/exit, repeated-exit conflict, audit, password revocation, deletion and logout pass |
| CORS                     | Configured origin accepted with credentials; other origins denied                                                                        |
| Atlas                    | Python 3.12 database check successfully verified indexes and ping on vigil_guardian_pass using the existing private URI                  |
| Builds                   | React client/SSR and generated Netlify function build pass                                                                               |
| SSR/proxy                | Local and generated Netlify SSR login, anonymous session and POST origin checks pass against Python 3.12                                 |
| Lint                     | No errors; six existing component Fast Refresh warnings                                                                                  |
| Browser                  | Login redirects to dashboard; visitor history/photo and entry/exit audit records render; logout returns to login                         |
| Secrets                  | Current MONGODB_URI, AUTH_SECRET and ADMIN_PASSWORD have zero matches in built client assets; private env files are untracked/ignored    |

The Atlas connection succeeded, but earlier checks intermittently returned
ConfigurationError. Network/DNS reliability must also be verified from the
chosen Python host; local success does not prove hosted reachability.

## Production diagnosis checklist

| Test | Command / where | Expected vs actual | Fix |
| --- | --- | --- | --- |
| MongoDB configuration | Python host runtime environment; private .env locally | Valid MongoDB URI, exact database; supplied deployment.env had an invalid URI scheme | Use Atlas driver URI as MONGODB_URI and MONGODB_DB_NAME=vigil_guardian_pass; never expose values |
| Atlas connectivity | `python main.py --check-db` with the same private Atlas URI | Indexes and ping pass locally on Python 3.12; hosted reachability unverified | Check active cluster, SRV/TXT DNS, credentials, readWrite/index permissions and Python host egress access |
| Authentication config | Python host AUTH_SECRET, SESSION_TTL_HOURS, APP_URL | Secret >=32 characters, TTL 1–168/default 12, exact frontend origin; private local checks completed | Preserve the existing secret for session compatibility; production APP_URL=https://celadon-scone-f6a656.netlify.app |
| Frontend forwarding | Netlify Production Functions environment | API_PROXY_URL must reach hosted Python; no hosted URL supplied | Set API_PROXY_URL=https://<PYTHON_SERVICE_HOST>, leave build VITE_API_URL empty, clear cache and deploy |
| Error classification | Python logs and Netlify Functions > server logs | `API operation failed: <class>` identifies backend failures; `API proxy failed: <name>` identifies forwarding failures | DNS/selection errors: networking/cluster; code 18: credentials; code 13: permissions; RuntimeError: server configuration |
| Cookies and origin | Browser Network / Application cookies | Local and HTTPS flag tests pass; production browser cutover pending | Exact APP_URL origin, HttpOnly/SameSite=Lax, Secure for HTTPS; production requests use same-origin /api |

The strongest confirmed configuration defect was the invalid URI in the supplied
deployment.env. The original production 503 cannot be attributed conclusively
without its runtime environment and logs. Correct that URI before using the file;
then verify the Python service connection and Netlify forwarding configuration.

## Production cutover still required

Deploy the Python Docker service, configure its existing MongoDB/auth settings
with APP_URL=https://celadon-scone-f6a656.netlify.app, and allow its egress in Atlas.
Set Netlify Functions API_PROXY_URL=https://<PYTHON_SERVICE_HOST>, leave the
Netlify build's VITE_API_URL empty, and redeploy. The frontend remains on Netlify
and uses its same-origin /api proxy to preserve SameSite=Lax cookies and strict
cross-site POST rejection.

No hosting URL/account was supplied, so live Python deployment and production
cookie/login checks are pending. Camera hardware/face recognition was not
manually tested. Docker execution was not tested here; Python 3.12 itself was.
Removing .env from tracking does not remove old Git history; rotate any
previously committed production credentials.

See README.md for commands, environment setup and manual production checks.
