# Vigil Guardian Pass

React 19, TanStack Start SSR, Vite 7 and Tailwind 4 frontend with a Python 3.12
FastAPI + uvicorn + PyMongo + Pydantic v2 API. MongoDB remains the single source
of truth for users, sessions, visitors, images and audit logs.

## Run locally

Use Python 3.12, Node >=22.12 and a local MongoDB instance or Atlas cluster.
Keep your existing database, AUTH_SECRET and users when migrating. No data export
or password reset is required.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
npm install
# For a fresh checkout only; preserve an existing private .env.
Copy-Item .env.example .env
```

Fill in private `.env` values, particularly the real MongoDB URI and a stable
AUTH_SECRET of at least 32 characters. Local settings:

```dotenv
MONGODB_URI=<LOCAL_OR_ATLAS_URI>
MONGODB_DB_NAME=vigil_guardian_pass
APP_URL=http://localhost:8080
AUTH_SECRET=<STABLE_RANDOM_SECRET_AT_LEAST_32_CHARACTERS>
SESSION_TTL_HOURS=12
API_PROXY_URL=http://localhost:8000
VITE_API_URL=http://localhost:8000
```

Never put secrets in a VITE\_ variable. VITE_DEMO_EMAIL and VITE_DEMO_PASSCODE
are public login defaults, only for a separate disposable demo account.
ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD are used only for administrator
seeding. Seed passwords require 8–128 characters, an uppercase letter and a number.

```powershell
npm run db:check
# Only when creating the first admin; existing admins are left unchanged.
npm run db:seed
python -m uvicorn main:app --host localhost --port 8000 --reload --ws none
```

In a second terminal, run `npm run dev` and open `http://localhost:8080`.
Use the hostname localhost consistently for both services; 127.0.0.1 and localhost
are different cookie hosts. VITE_API_URL is the API origin, without an /api suffix.
Leave it empty to send all requests through the local TanStack proxy instead.
Restart Vite after changing environment values.

The npm database commands launch Python. Alternatively use
`python main.py --check-db` and `python main.py --seed-admin`.
Activate the Python virtualenv before running the npm database commands.
Tests also accept PYTHON_EXECUTABLE pointing to the virtualenv interpreter.
The database check verifies all eight indexes and pings the database. Seeding
never resets an existing password or promotes a non-admin user.

## Compatibility

All business endpoints live in `backend/api.py`. JSON API requests, response
shapes, role checks and status codes are retained, including strict 400 validation
instead of FastAPI's default 422, JSON content/body limits, 401/403/404/409/429,
and sanitized 503 errors. JSON responses use Cache-Control: no-store;
authenticated image responses use private, no-store.

Passwords remain `scrypt:<16-byte-hex-salt>:<64-byte-hex-key>`. Python uses
N=16384, r=8, p=1, dklen=64 and the hex salt as UTF-8 text, matching Node defaults.
Session identifiers remain HMAC-SHA256 hashes of 32-byte random hex tokens.
Existing BSON dates, binary images, auth_version and string UUID identifiers
remain readable. Keep AUTH_SECRET unchanged to retain valid sessions.

The existing fixed 15-minute login bucket is retained: the 11th attempt returns
429; records expire after 30 minutes and successful login deletes its bucket.
Session duration defaults to 12 hours and is clamped to 1–168 hours.
The original pass format uses SIX random bytes, i.e. twelve hex characters:
BSF-YYYY-XXXXXXXXXXXX.

The original Node API, database/security modules and database-script wrappers
have been removed. Python owns authentication, database access and business logic.
`src/lib/api-proxy.server.js` forwards HTTP requests for TanStack SSR/Netlify.
Node's MongoDB driver is a development dependency for test fixtures only.
React JSX routes, login
navigation, demo prefill, visitor polling and UI workflows are unchanged.

## CORS, origin checks and images

Python CORS permits the configured APP_URL origin with credentials and GET/POST.
POST Origin must equal APP_URL's origin; Sec-Fetch-Site: cross-site is rejected.
Do not add a wildcard credentialed origin or weaken this check.

Cookies remain vigil_session, HttpOnly, SameSite=Lax, Path=/, with Secure when
APP_URL uses HTTPS. Local direct requests between localhost:8080 and
localhost:8000 are cross-origin but same-site. The shared API helper includes
credentials. Image URLs stay relative /api URLs and go through the frontend
proxy, preserving cookies for existing image, PDF and face-recognition callers.

A separate backend domain cannot support the existing cross-site rejection and
SameSite=Lax cookies with direct browser requests. Production therefore uses
the same-origin Netlify /api proxy. See
[FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/).

## Deploy React on Netlify and Python separately

Netlify keeps TanStack SSR with the existing Vite plugin and build configuration.
Run Python on a host supporting Python containers; the repository includes a
Python 3.12 Dockerfile. Netlify's Node SSR function forwards /api requests to it.
Do not attempt to run uvicorn inside the Netlify function.

```sh
docker build -t vigil-api .
docker run --rm --env-file .env -p 8000:8000 vigil-api
```

The container runs as a non-root user and excludes local env files. Supply runtime
secrets through your Python host. The service listens on PORT, default 8000.
Use HTTPS for the hosted service and leave its /api route path intact.

1. Deploy the Python container with MONGODB_URI, MONGODB_DB_NAME,
   APP_URL=https://celadon-scone-f6a656.netlify.app, AUTH_SECRET and SESSION_TTL_HOURS.
   Supply the existing secret and exact application database. ADMIN_* is needed
   only if seeding from that host.
2. In Atlas, verify an active cluster, correct driver URI and database user with
   readWrite permission on vigil_guardian_pass, including index creation.
   Allow the PYTHON HOST'S egress IP. For temporary diagnostics use 0.0.0.0/0;
   prefer host-specific ranges or private networking for production.
3. On Netlify, set API_PROXY_URL=https://<PYTHON_SERVICE_HOST> in Functions scope,
   Production context. This is an origin, without /api. Leave VITE_API_URL empty
   in Builds scope and set optional VITE_DEMO_* values there.
   Database and authentication secrets belong on the Python host.
4. Retain npm run build, dist/client and the TanStack Netlify plugin.
   Trigger a new deploy after environment changes; use clear cache and deploy
   when validating the migration. Build success alone does not test Python/Atlas.
5. Verify anonymous GET /api/auth/session returns {user:null}. Then log in with
   a seeded account and confirm the Secure cookie on the Netlify domain.
   Create a guard/operator and visitor, load images, exit once (second exit 409),
   verify audit actions as admin, change a password and verify old sessions fail,
   then log out. Check browser Network requests remain on the Netlify origin.

[Netlify Functions environment](https://docs.netlify.com/build/functions/environment-variables/)
explains Functions scope and the need for a new deploy.

## Diagnose database and proxy failures

Use the SAME Atlas URI and database for the local check and Python host.
The supplied local deployment.env was found to have an invalid MongoDB URI;
do not import it without correcting that value.

- InvalidURI / ConfigurationError: invalid URI scheme/options or SRV configuration.
- ServerSelectionTimeoutError / AutoReconnect: DNS, access list, unavailable
  cluster, TLS or unreachable MongoDB servers; selection timeout is 5 seconds.
- querySrv / DNS refusal: verify Atlas hostname and SRV/TXT-capable DNS.
  `Resolve-DnsName -Type SRV "_mongodb._tcp.<CLUSTER_HOST>"` checks SRV locally.
  Use Atlas's complete standard URI if DNS cannot support SRV.
- OperationFailure code 18: database credentials/authSource/percent-encoding.
- OperationFailure code 13: database or index-creation permissions.
- Index conflicts can fail initialization; inspect indexes before changing them.
  Duplicate key 11000 maps to 409.
- Missing/short AUTH_SECRET: sanitized 503, even with a healthy database.
- Valid APP_URL mismatch: 403. Malformed APP_URL: sanitized 503.
- Python logs `API operation failed: <exception class>`.
  Netlify Functions > server logs `API proxy failed: <error name>` for upstream
  reachability, timeout or missing API_PROXY_URL. No URI is logged.

The proxy has a 15-second upstream timeout; hosted Python cold starts must fit
within this and the Netlify function timeout. Confirm any host/proxy upload
limits allow the existing 6 MiB visitor body and 2 MiB decoded images.
[Atlas troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

## Verification

```sh
npm test
npm run lint
npm run build
npm run test:ssr
# PowerShell: verify the generated Netlify server against a local Python service.
$env:NETLIFY="true"
npm run build
node scripts/smoke-ssr.mjs --netlify
```

Integration tests launch a temporary real MongoDB and a real uvicorn service,
exercise the API through the Netlify forwarding layer, then clean up.
They never use the application database; the first run may download a MongoDB
binary to ignored .cache/. Python requirements must be installed first.
Tests include Node/Python hash and existing-session/image compatibility,
role/validation/status checks, rate limiting and credentialed CORS.
SSR smoke checks start Python automatically without needing a database.

.env, deployment.env, virtualenvs and Python caches are ignored. .env has been
removed from Git tracking without deleting the private file. Any credentials
previously committed remain in history and should be rotated; do not reuse those
values for a fresh production deployment. Changing AUTH_SECRET invalidates
sessions, so schedule that rotation if necessary.
