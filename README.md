# Vigil Guardian Pass

Gate entry and exit management using React 19, TanStack Start SSR, MongoDB,
Tailwind CSS 4, and Radix UI. MongoDB is the single source of truth for users,
sessions, visitors, images, and audit logs. Supabase is no longer used.

## Local development

Use Node >=22.12.0 and npm. Start MongoDB locally or supply an Atlas connection.

1. Run `npm install`.
2. Copy `.env.example` to `.env` and fill in all eight variables below.
3. Generate AUTH_SECRET with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.
4. Run `npm run db:check`, then `npm run db:seed` to create the initial admin.
5. Run `npm run dev` and open `http://localhost:8080`.

The seed script validates the admin using the same password and user rules as
API-created accounts. It creates the unique email index and never resets an
existing admin's password or promotes an existing non-admin account.

## Environment variables

The eight backend values below are server-only. Keep `.env` and any credential backups out of git.
Never prefix credentials with `VITE_`. In particular,
`SUPABASE_SERVICE_ROLE_KEY` must never have a `VITE_` prefix, even in legacy setups.

| Variable          | Value / purpose                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| MONGODB_URI       | Local MongoDB URI or Atlas `mongodb+srv://...` connection string                                                     |
| MONGODB_DB_NAME   | `vigil_guardian_pass` (use the same database for seeding and runtime)                                                |
| APP_URL           | `http://localhost:8080` locally; exact `https://your-site.netlify.app` URL or configured custom domain in production |
| AUTH_SECRET       | Random secret, at least 32 characters; changing it invalidates sessions                                              |
| SESSION_TTL_HOURS | `12`; API clamps sessions to 1-168 hours                                                                             |
| ADMIN_EMAIL       | Initial administrator email                                                                                          |
| ADMIN_NAME        | Initial administrator name                                                                                           |
| ADMIN_PASSWORD    | Initial password: 8-128 characters, uppercase letter and number                                                      |

APP_URL must equal the deployed site URL so `checkOrigin()` accepts login and
other POST requests. Use that domain consistently; deploy previews require their
own APP_URL and should use a separate database. HTTPS production cookies have
`Secure`, `HttpOnly`, and `SameSite=Lax` flags.

## Demo login defaults

`/login` pre-fills editable inputs using `VITE_DEMO_EMAIL` (fallback:
`admin@bsf.gov.in`) and `VITE_DEMO_PASSCODE` (fallback: empty). Set both in
`.env` locally and in Netlify build environment variables for demo deployment.
Restart Vite after changing them; production changes require a rebuild.

Every `VITE_` variable is public in the browser build. Never expose the real
admin password: `ADMIN_PASSWORD` stays server-only and must never receive a
`VITE_` prefix or be copied into `VITE_DEMO_PASSCODE`. Use a separate, disposable
`gate_operator` demo account with a different password. Public demo credentials
grant real operator access, so use a demo database for a publicly accessible demo.

MongoDB emails are unique. Use `demo.operator@bsf.gov.in` for the public demo
and keep `admin@bsf.gov.in` for the server-only admin account. Create
the admin with `npm run db:seed`, then sign in as admin and create the demo
account under User Management with role Gate Operator and credentials matching
`VITE_DEMO_EMAIL` / `VITE_DEMO_PASSCODE`. The admin seed script creates only the
admin; it does not create or downgrade the demo account.

Authentication always goes through `POST /api/auth/login`, then directly to
`/dashboard`. Existing sessions redirect to the dashboard automatically.

## Netlify deployment

`netlify.toml` is the primary deployment configuration:

- Build command: `npm run build`
- Publish directory: `dist/client`
- Node version: `22.12.0`
- SSR/API: `@netlify/vite-plugin-tanstack-start`, activated only with `NETLIFY=true`

This matches the [official Netlify TanStack Start setup](https://docs.netlify.com/build/frameworks/framework-setup-guides/tanstack-start/).
Do not deploy the client output alone: the generated Netlify Functions are
required for SSR and `/api/$` GET/POST requests.

1. Import the repository in Netlify and retain the `netlify.toml` build settings.
2. Add all eight variables in the table under **Project configuration > Environment variables**.
   Ensure they are available to Functions and builds. Do not store secrets in netlify.toml.
3. In MongoDB Atlas, create a database user with read/write access to the app database.
   Under **Network Access**, add `0.0.0.0/0` for Netlify's dynamic function egress
   (or use a configured fixed-egress arrangement). Restrict database access with
   strong credentials and database-scoped permissions.
4. Seed the same Atlas database once from a trusted local shell: configure that URI
   and database in `.env`, run `npm run db:check`, then `npm run db:seed`.
   Seeding is deliberately not part of the deploy build.
5. Deploy, then verify login, visitor entry/images/exit, users/passwords, and audit logs.

If `db:check` reports `ECONNREFUSED` during `querySrv`, the DNS resolver cannot
resolve the Atlas SRV record. Verify the Atlas hostname and use a DNS resolver
that supports SRV/TXT lookups, or use the standard connection string provided by
Atlas. An IP access-list change alone does not fix DNS resolution.

Supabase Auth redirect URLs are not required. `vercel.json` and `wrangler.jsonc`
are deprecated historical files; Vercel static and Cloudflare deployments are
unsupported for this MongoDB/Netlify setup.

## Verification and scripts

- `npm run lint` checks JavaScript and JSX.
- `npm test` runs isolated MongoDB API integration and polling tests. The first run
  may download a MongoDB test binary; tests never use the database in `.env`.
- `npm run build` builds local SSR and client assets.
- `npm run preview` previews the local SSR production build.
- After a local build, `npm run test:ssr` verifies login SSR and API GET/POST dispatch.
  After a Netlify build, `npm run test:ssr -- --netlify` verifies the generated Function.
- To verify the adapter locally in PowerShell, set `$env:NETLIFY = "true"`, run
  `npm run build`, then `Remove-Item Env:NETLIFY`.
- `npm run db:check` connects, pings MongoDB, and prepares application indexes.
- `npm run db:seed` creates an initial admin without overwriting an existing one.
- `npm run format` formats the project.

Visitor lists refresh every five seconds and on focus or entry/exit events.
Passwords use scrypt; session tokens are stored only as HMAC digests and MongoDB
TTL indexes remove expired sessions. API tests cover authentication, permissions,
users, session revocation, visitors and images, exit conflicts, and audit records.

## Structure

- `src/server/{api,database,security}.js`: MongoDB API and authentication
- `src/routes/api/$.js`: TanStack Start GET/POST server handlers
- `src/routes/`: existing pages and routing
- `src/components/`: existing Tailwind/Radix interface
- `scripts/`: database check and admin bootstrap
- `tests/`: integration and polling smoke tests
