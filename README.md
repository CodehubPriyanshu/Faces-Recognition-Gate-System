# Faces-Recognition-Gate-System

React 19, TanStack Start, Vite 7 and Tailwind 4 frontend; Python 3.12,
FastAPI, Uvicorn and PyMongo backend; MongoDB persistence.

## Folder structure

```text
vigil-guardian-pass/
  frontend/
    package.json, package-lock.json, bun.lock, bunfig.toml
    vite.config.js, jsconfig.json, eslint.config.js, components.json
    .prettierrc, .prettierignore, .nvmrc
    .env.example, .env.production, .env (private)
    netlify.toml, vercel.json, wrangler.jsonc
    src/ (router, routes, components, hooks, lib, server.js, assets, styles)
    scripts/, tests/
  backend/
    main.py
    app/ (__init__.py, api.py, database.py, schemas.py, security.py)
    requirements.txt, Dockerfile, .dockerignore, .python-version
    .env.example, .env (private)
    deployment.env (private legacy deployment settings; do not import as-is)
  .gitignore
  README.md
  README.before-split.md (previous documentation, retained)
  MIGRATION_VERIFICATION.md (previous migration results)
  FOLDER_RESTRUCTURE.md (file moves and current verification results)
```

All existing application code was moved. The frontend retains TanStack SSR and
its HTTP API proxy. Backend business modules live in backend/app; their relative
imports are unchanged. main.py imports app.api/app.database/app.schemas/app.security.
The frontend @ alias still resolves to frontend/src. No public/ existed at the
start of this move. The existing asset directory spelling src/asstes is retained.

## Local setup

Use Node 22.12.0 and Python 3.12. Existing private settings were split into the two
.env files. For a fresh checkout, copy each .env.example to its own .env first.

Backend terminal, starting at the repository root (PowerShell):

```powershell
cd backend
python -m venv .venv
# Activate if your PowerShell execution policy allows it:
.\.venv\Scripts\Activate.ps1
# Or use .venv\Scripts\python.exe directly for Python commands.
python -m pip install -r requirements.txt
python main.py --check-db
# Only when creating the first administrator; existing accounts are unchanged:
python main.py --seed-admin
uvicorn main:app --host localhost --port 8000 --ws none
```

With activation unavailable, start with
`.\.venv\Scripts\python.exe -m uvicorn main:app --host localhost --port 8000 --ws none`.
On macOS/Linux use `source .venv/bin/activate`.

Backend .env:

```dotenv
MONGODB_URI=<your MongoDB connection URI>
MONGODB_DB_NAME=<your existing database name>
APP_URL=http://localhost:8080
AUTH_SECRET=<your existing stable secret of at least 32 characters>
SESSION_TTL_HOURS=12
ADMIN_EMAIL=<initial administrator email>
ADMIN_NAME=<initial administrator name>
ADMIN_PASSWORD=<initial administrator password>
```

Frontend terminal, starting at the repository root:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

On shells without PowerShell's script restriction, `npm` and `npm.cmd` are equivalent.
The preserved node_modules can already be used locally; npm ci is for a fresh install.

Frontend .env:

```dotenv
VITE_API_URL=http://localhost:8000
API_PROXY_URL=http://localhost:8000
VITE_DEMO_EMAIL=<optional public demo email>
VITE_DEMO_PASSCODE=<optional public demo passcode>
```

frontend/.env.example contains only VITE_* settings. Add API_PROXY_URL to the
private frontend/.env as shown above. This is a server-only setting and must never
have a VITE_ prefix. APP_URL belongs exclusively in backend/.env. Restart both
services after environment changes. Open http://localhost:8080 and use localhost
for both services so the cookie host stays consistent.

Direct API calls include credentials. Existing image/PDF/face-recognition URLs
remain relative /api URLs and pass through the frontend proxy. Both direct and
proxy requests preserve Origin checks. CORS allows precisely APP_URL with
credentials. The vigil_session cookie remains HttpOnly, SameSite=Lax, Path=/,
and Secure for an HTTPS APP_URL. Password/session formats and all feature code
are unchanged. Keep AUTH_SECRET and MONGODB_DB_NAME consistent with existing data.

## Netlify frontend settings

| Setting | Exact value |
| --- | --- |
| Repository | This repository |
| Base directory | frontend |
| Package directory | Leave blank (same location as base) |
| Config file | frontend/netlify.toml (discovered from base) |
| Build command | npm run build |
| Publish directory | dist/client (relative to frontend) |
| Node version | 22.12.0 |
| VITE_API_URL | Empty string, Builds scope, Production context |
| API_PROXY_URL | https://<render-service>.onrender.com, Functions scope, Production context; no /api suffix |
| VITE_DEMO_EMAIL / VITE_DEMO_PASSCODE | Optional public demo values, Builds scope |

Netlify sets NETLIFY=true automatically; this enables the existing TanStack Start
Vite adapter and generates the SSR function. Keep its generated routing; no SPA
catch-all redirect is needed. Set API_PROXY_URL in the Netlify UI/CLI/API: values
in netlify.toml are unavailable to function runtime. Database and authentication
settings are supplied to Render. frontend/.env.production and netlify.toml both
set VITE_API_URL empty, so local development configuration is not baked into
production browser API URLs. Do not override this with a nonempty hosted value.
Redeploy after updating build or function environment settings.

References: [Netlify monorepo configuration](https://docs.netlify.com/build/configure-builds/monorepos/),
[Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/).

## Render backend settings

Create a **Web Service** using the **Python native runtime**.

| Setting | Exact value |
| --- | --- |
| Root directory | backend |
| Language/runtime | Python 3.12 |
| Python version file | backend/.python-version = 3.12 (latest released 3.12 patch) |
| Build command | pip install -r requirements.txt |
| Start command | uvicorn main:app --host 0.0.0.0 --port $PORT --ws none |
| Health check path | /api/auth/session (anonymous returns 200 without accessing MongoDB) |
| MONGODB_URI | Your existing MongoDB URI, secret |
| MONGODB_DB_NAME | Your existing application database name |
| APP_URL | https://<netlify-site>.netlify.app or your exact frontend custom origin |
| AUTH_SECRET | Your existing stable secret, at least 32 characters |
| SESSION_TTL_HOURS | 12 or your existing value |
| ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD | Only needed when running the one-time administrator seed |

Render supplies PORT. If setting PYTHON_VERSION in Render's environment instead
of relying on .python-version, supply a fully qualified released 3.12.x version;
that variable takes precedence over the file. Allow the Render service's outbound
IPs in MongoDB Atlas and retain the existing database and auth secret.

Deploy Render first, then set its origin as Netlify Functions API_PROXY_URL and
redeploy Netlify. Production browser requests go to the Netlify same-origin /api
proxy, which forwards cookies/Origin and returns Set-Cookie and binary images.
Use APP_URL with the frontend HTTPS origin to retain strict Origin checks and
Secure SameSite=Lax cookies. Preview deploys need a backend configured with their
own exact APP_URL if authenticated preview use is required.

References: [Render monorepo roots](https://render.com/docs/monorepo-support),
[Python versions](https://render.com/docs/python-version),
[Build/start commands](https://render.com/docs/deploys).

Docker alternative (run from backend):

```sh
docker build -t vigil-api .
docker run --rm --env-file .env -p 8000:8000 vigil-api
```

The Docker context is backend. COPY paths are requirements.txt, main.py and app/;
.dockerignore includes only those inputs and Dockerfile. The image uses Python
3.12, runs as a non-root user and defaults PORT to 8000. Docker runtime was not
part of this verification.

vercel.json and wrangler.jsonc were moved intact for preservation. Their existing
alternative-host configurations are not the Netlify/Render deployment path and
were not validated for deployment.

## Verification commands

Backend (Python 3.12 environment active):

```sh
cd backend
python main.py --check-db
```

Frontend (Python 3.12 available to the test helpers):

```powershell
cd frontend
$env:PYTHON_EXECUTABLE = (Resolve-Path ../backend/.venv/Scripts/python.exe).Path
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run test:ssr
$env:NETLIFY = "true"
npm.cmd run build
node scripts/smoke-ssr.mjs --netlify
Remove-Item Env:NETLIFY
```

On macOS/Linux set PYTHON_EXECUTABLE to the absolute backend/.venv/bin/python path.
Existing npm run db:check/db:seed remain available from frontend and run Python
from ../backend. Those wrappers use the active `python` command.

Tests use isolated temporary MongoDB databases and real Uvicorn processes. The
first run may download MongoDB into frontend/.cache/mongodb-binaries. They verify
login/logout, roles/users, visitor entry/exit, photo/signature retrieval, audit,
password/session compatibility, CORS, Origin rejection and cookie flags. SSR smoke
checks exercise /login and the /api proxy. Current results are in FOLDER_RESTRUCTURE.md.

Private .env files, deployment.env, backup local env files, virtualenvs and caches
remain ignored. Original private env contents were retained in
backend/.env.before-split.local; the old combined sample is retained as
backend/.env.combined-example.local. The legacy deployment.env was moved intact
and contains mixed old settings: use the per-host tables above instead of importing it.
The previous README is retained in README.before-split.md for historical reference.
