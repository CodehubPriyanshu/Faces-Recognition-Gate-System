# Folder restructure ? 3 October 2026

## Step-by-step moves

1. Moved frontend source, configuration, scripts, tests and lockfiles together into frontend/.
2. Moved Python entry point, requirements and Docker inputs into backend/.
3. Moved backend/*.py into backend/app/*.py, keeping each relative import intact.
4. Split private environment settings and examples; retained original contents in ignored local backups.
5. Updated only imports, working directories, build/runtime configuration and documentation.

## Complete source/config file map

| Previous path | Current path |
| --- | --- |
| `package.json` | `frontend/package.json` |
| `package-lock.json` | `frontend/package-lock.json` |
| `bun.lock` | `frontend/bun.lock` |
| `bunfig.toml` | `frontend/bunfig.toml` |
| `vite.config.js` | `frontend/vite.config.js` |
| `jsconfig.json` | `frontend/jsconfig.json` |
| `eslint.config.js` | `frontend/eslint.config.js` |
| `components.json` | `frontend/components.json` |
| `.prettierrc` | `frontend/.prettierrc` |
| `.prettierignore` | `frontend/.prettierignore` |
| `src/router.jsx` | `frontend/src/router.jsx` |
| `src/routeTree.gen.js` | `frontend/src/routeTree.gen.js` |
| `src/server.js` | `frontend/src/server.js` |
| `src/start.js` | `frontend/src/start.js` |
| `src/styles.css` | `frontend/src/styles.css` |
| `src/asstes/logo.png` | `frontend/src/asstes/logo.png` |
| `src/components/AppHeader.jsx` | `frontend/src/components/AppHeader.jsx` |
| `src/components/AppSidebar.jsx` | `frontend/src/components/AppSidebar.jsx` |
| `src/components/PassDetailsModal.jsx` | `frontend/src/components/PassDetailsModal.jsx` |
| `src/components/UpdatePasswordModal.jsx` | `frontend/src/components/UpdatePasswordModal.jsx` |
| `src/hooks/use-auth.js` | `frontend/src/hooks/use-auth.js` |
| `src/hooks/use-mobile.jsx` | `frontend/src/hooks/use-mobile.jsx` |
| `src/lib/api-proxy.server.js` | `frontend/src/lib/api-proxy.server.js` |
| `src/lib/api.js` | `frontend/src/lib/api.js` |
| `src/lib/error-capture.js` | `frontend/src/lib/error-capture.js` |
| `src/lib/error-page.js` | `frontend/src/lib/error-page.js` |
| `src/lib/image.js` | `frontend/src/lib/image.js` |
| `src/lib/pdf.js` | `frontend/src/lib/pdf.js` |
| `src/lib/users.functions.js` | `frontend/src/lib/users.functions.js` |
| `src/lib/utils.js` | `frontend/src/lib/utils.js` |
| `src/routes/index.jsx` | `frontend/src/routes/index.jsx` |
| `src/routes/login.jsx` | `frontend/src/routes/login.jsx` |
| `src/routes/_authenticated.jsx` | `frontend/src/routes/_authenticated.jsx` |
| `src/routes/__root.jsx` | `frontend/src/routes/__root.jsx` |
| `src/components/ui/accordion.jsx` | `frontend/src/components/ui/accordion.jsx` |
| `src/components/ui/alert-dialog.jsx` | `frontend/src/components/ui/alert-dialog.jsx` |
| `src/components/ui/alert.jsx` | `frontend/src/components/ui/alert.jsx` |
| `src/components/ui/aspect-ratio.jsx` | `frontend/src/components/ui/aspect-ratio.jsx` |
| `src/components/ui/avatar.jsx` | `frontend/src/components/ui/avatar.jsx` |
| `src/components/ui/badge.jsx` | `frontend/src/components/ui/badge.jsx` |
| `src/components/ui/breadcrumb.jsx` | `frontend/src/components/ui/breadcrumb.jsx` |
| `src/components/ui/button.jsx` | `frontend/src/components/ui/button.jsx` |
| `src/components/ui/calendar.jsx` | `frontend/src/components/ui/calendar.jsx` |
| `src/components/ui/card.jsx` | `frontend/src/components/ui/card.jsx` |
| `src/components/ui/carousel.jsx` | `frontend/src/components/ui/carousel.jsx` |
| `src/components/ui/chart.jsx` | `frontend/src/components/ui/chart.jsx` |
| `src/components/ui/checkbox.jsx` | `frontend/src/components/ui/checkbox.jsx` |
| `src/components/ui/collapsible.jsx` | `frontend/src/components/ui/collapsible.jsx` |
| `src/components/ui/command.jsx` | `frontend/src/components/ui/command.jsx` |
| `src/components/ui/context-menu.jsx` | `frontend/src/components/ui/context-menu.jsx` |
| `src/components/ui/dialog.jsx` | `frontend/src/components/ui/dialog.jsx` |
| `src/components/ui/drawer.jsx` | `frontend/src/components/ui/drawer.jsx` |
| `src/components/ui/dropdown-menu.jsx` | `frontend/src/components/ui/dropdown-menu.jsx` |
| `src/components/ui/form.jsx` | `frontend/src/components/ui/form.jsx` |
| `src/components/ui/hover-card.jsx` | `frontend/src/components/ui/hover-card.jsx` |
| `src/components/ui/input-otp.jsx` | `frontend/src/components/ui/input-otp.jsx` |
| `src/components/ui/input.jsx` | `frontend/src/components/ui/input.jsx` |
| `src/components/ui/label.jsx` | `frontend/src/components/ui/label.jsx` |
| `src/components/ui/menubar.jsx` | `frontend/src/components/ui/menubar.jsx` |
| `src/components/ui/navigation-menu.jsx` | `frontend/src/components/ui/navigation-menu.jsx` |
| `src/components/ui/pagination.jsx` | `frontend/src/components/ui/pagination.jsx` |
| `src/components/ui/popover.jsx` | `frontend/src/components/ui/popover.jsx` |
| `src/components/ui/progress.jsx` | `frontend/src/components/ui/progress.jsx` |
| `src/components/ui/radio-group.jsx` | `frontend/src/components/ui/radio-group.jsx` |
| `src/components/ui/resizable.jsx` | `frontend/src/components/ui/resizable.jsx` |
| `src/components/ui/scroll-area.jsx` | `frontend/src/components/ui/scroll-area.jsx` |
| `src/components/ui/select.jsx` | `frontend/src/components/ui/select.jsx` |
| `src/components/ui/separator.jsx` | `frontend/src/components/ui/separator.jsx` |
| `src/components/ui/sheet.jsx` | `frontend/src/components/ui/sheet.jsx` |
| `src/components/ui/sidebar.jsx` | `frontend/src/components/ui/sidebar.jsx` |
| `src/components/ui/skeleton.jsx` | `frontend/src/components/ui/skeleton.jsx` |
| `src/components/ui/slider.jsx` | `frontend/src/components/ui/slider.jsx` |
| `src/components/ui/sonner.jsx` | `frontend/src/components/ui/sonner.jsx` |
| `src/components/ui/switch.jsx` | `frontend/src/components/ui/switch.jsx` |
| `src/components/ui/table.jsx` | `frontend/src/components/ui/table.jsx` |
| `src/components/ui/tabs.jsx` | `frontend/src/components/ui/tabs.jsx` |
| `src/components/ui/textarea.jsx` | `frontend/src/components/ui/textarea.jsx` |
| `src/components/ui/toggle-group.jsx` | `frontend/src/components/ui/toggle-group.jsx` |
| `src/components/ui/toggle.jsx` | `frontend/src/components/ui/toggle.jsx` |
| `src/components/ui/tooltip.jsx` | `frontend/src/components/ui/tooltip.jsx` |
| `src/routes/api/$.js` | `frontend/src/routes/api/$.js` |
| `src/routes/_authenticated/audit.jsx` | `frontend/src/routes/_authenticated/audit.jsx` |
| `src/routes/_authenticated/dashboard.jsx` | `frontend/src/routes/_authenticated/dashboard.jsx` |
| `src/routes/_authenticated/entry.jsx` | `frontend/src/routes/_authenticated/entry.jsx` |
| `src/routes/_authenticated/exit.jsx` | `frontend/src/routes/_authenticated/exit.jsx` |
| `src/routes/_authenticated/history.jsx` | `frontend/src/routes/_authenticated/history.jsx` |
| `src/routes/_authenticated/users.jsx` | `frontend/src/routes/_authenticated/users.jsx` |
| `scripts/python-server.mjs` | `frontend/scripts/python-server.mjs` |
| `scripts/smoke-ssr.mjs` | `frontend/scripts/smoke-ssr.mjs` |
| `tests/api.test.mjs` | `frontend/tests/api.test.mjs` |
| `tests/helpers.mjs` | `frontend/tests/helpers.mjs` |
| `tests/polling.test.mjs` | `frontend/tests/polling.test.mjs` |
| `netlify.toml` | `frontend/netlify.toml` |
| `vercel.json` | `frontend/vercel.json` |
| `wrangler.jsonc` | `frontend/wrangler.jsonc` |
| `backend/api.py` | `backend/app/api.py` |
| `backend/database.py` | `backend/app/database.py` |
| `backend/schemas.py` | `backend/app/schemas.py` |
| `backend/security.py` | `backend/app/security.py` |
| `backend/__init__.py` | `backend/app/__init__.py` |

Additional moves: main.py, requirements.txt, Dockerfile, .dockerignore,
deployment.env and .env.migration.local moved to backend/. Generated directories
node_modules, dist, .netlify, .tanstack, .wrangler and .cache moved to frontend/.
Original root .env moved to backend/.env.before-split.local and split into the two
private .env files; root .env.example was split into the two examples and retained
as backend/.env.combined-example.local. README.md was preserved as README.before-split.md.

## Updated configurations

- backend/main.py: imports app.* instead of backend.*.
- backend/Dockerfile and .dockerignore: COPY/include app/; build context backend/.
- frontend/package.json: retained database scripts with ../backend working directory.
- frontend/scripts/python-server.mjs: launch Uvicorn from backend/.
- frontend/tests/api.test.mjs and helpers.mjs: backend working directory and app.security import.
- frontend/netlify.toml: build/publish/Node settings retained; production VITE_API_URL empty.
- frontend/.env.production: VITE_API_URL empty, overrides local .env for production builds.
- frontend/.nvmrc: 22.12.0; backend/.python-version: 3.12.
- .gitignore: keep the non-secret production env file tracked; retain nested private-file ignores.
- Vite alias, generated route tree paths, components.json, jsconfig.json,
  src/server.js and API proxy code retain their existing relative paths and code.

## Current verification

| Check | Result |
| --- | --- |
| Python runtime | Python 3.12.13, workspace-local backend/.venv |
| npm run lint | Pass on Node 22.12.0; 0 errors, 6 existing Fast Refresh warnings |
| npm test | 7/7 pass on Node 22.12.0 against isolated real MongoDB and Uvicorn |
| npm run build | Client + SSR build pass; NETLIFY=true adapter build also passes on Node 22.12.0 |
| python main.py --check-db from backend | Pass using the preserved private MongoDB settings; indexes and ping ready |
| npm run test:ssr | Pass: built /login SSR, /api/auth/session and rejected POST Origin |
| Generated Netlify function | Pass on Node 22.12.0: /login SSR, API GET, rejected POST Origin, generated function routing config |
| Fixed localhost ports | Frontend 8080 and backend 8000 started together; HTTP login/direct API/proxy, visitor entry/list/exit, photo/signature bytes, cookie flags, credentialed CORS, rejected Origin and logout pass |
| Production API URL | No http://localhost:8000 in generated client JavaScript; VITE_API_URL empty |
| Source preservation | 100 pre-move files checked; 94 byte-identical, no missing files; six changed files listed below |

Changes among the 100 hash-checked files are package.json, netlify.toml, the Python
test launcher, the two API test/helper files, and regenerated src/routeTree.gen.js.
All React feature source, frontend proxy/server code and the five Python app modules
are byte-identical to their pre-move versions. main.py only changes package imports;
Docker files only change moved paths. No business logic or feature was added or removed.

The fixed-port verification used a disposable MongoDB database and test account;
it did not create visitors/users in the configured application database. The
configured application database was checked only for connection and existing
application indexes using the existing --check-db command. Temporary local
services were stopped after verification.

No live deployment was performed. Browser interaction, physical camera/face
recognition hardware and Docker runtime execution were not tested in this
restructure. The previous MIGRATION_VERIFICATION.md describes an earlier migration.

