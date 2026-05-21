# BSF STC Gate Entry Face Recognition System

A military-style secure gate management system with face recognition, role-based access, visitor management, and PDF passes. Built on TanStack Start + Lovable Cloud (Supabase).

## Scope

Production-ready app matching the uploaded screenshots: dark grid background, gold/amber accents, neon-green status indicators, monospace UI chrome, JetBrains-style typography.

## Pages

1. **`/login`** — Operator Authorization (gold "Authenticate" button, demo account autofill panel)
2. **`/dashboard`** — Gate Command Center (4 stat cards, 7-day bar chart, purpose donut chart, live activity feed)
3. **`/entry`** — Visitor Gate Entry (face capture, full form, signature pad, issue gate pass → PDF)
4. **`/exit`** — Visitor Exit Verification (live camera scan + manual lookup of in-campus visitors)
5. **`/history`** — Visitor History (search, status/purpose filters, CSV export, photo thumbnails)
6. **`/audit`** — System Audit Logs (admin only)
7. **`/users`** — User Management (admin only, add/delete users with roles)

All authenticated pages share the sidebar layout shown in the screenshots.

## Roles

- `admin` — full access
- `security_guard` — dashboard, entry, exit, history
- `gate_operator` — dashboard, entry, exit, history

Role visibility controls sidebar items and route guards.

## Database Schema (Lovable Cloud / Supabase)

```text
profiles            (id PK→auth.users, full_name, email, created_at)
app_role enum      (admin | security_guard | gate_operator)
user_roles          (id, user_id→auth.users, role app_role, UNIQUE(user_id,role))
visitors            (id, pass_no UNIQUE, full_name, mobile, id_type, id_number,
                     purpose, whom_to_meet, vehicle_number, visitor_count, remarks,
                     in_charge_name, photo_url, signature_url, status [in_campus|exited],
                     entry_time, exit_time, entry_by→auth.users, exit_by, exit_method)
audit_logs          (id, ts, action, actor_id, actor_email, actor_role,
                     target, metadata jsonb)
```

Security:
- RLS enabled on all tables
- `has_role(uid, role)` SECURITY DEFINER function (no recursive RLS)
- Storage buckets: `visitor-photos`, `visitor-signatures` (public read, authenticated write)
- Trigger to auto-create `profiles` row on signup
- Trigger to log visitor entry/exit into `audit_logs`

## Authentication

- Email/password via Supabase Auth (auto-confirm enabled for demo)
- Login page seeds the 3 demo accounts (admin / guard / operator) on first attempt via a server function so the credentials shown in the screenshot always work
- `_authenticated` layout route gates protected pages
- `onAuthStateChange` listener invalidates router + query cache at root

## Face Recognition

Browser-side using **face-api.js** (tiny face detector + face landmark + face recognition models loaded from CDN). On exit:
1. Camera stream → detect face every ~600ms
2. Compute descriptor, compare against descriptors of all `in_campus` visitor photos (precomputed once per fetch)
3. On match (distance < 0.5), auto-fill verified visitor panel and confirm exit
4. Manual search fallback by name/mobile/pass/vehicle

Entry capture stores a still JPEG to `visitor-photos` bucket; descriptor is computed on demand at exit (not stored separately to keep schema simple).

## PDF Gate Pass

`jspdf` + `qrcode` — dark gold military layout with BSF · STC header, visitor photo, pass no, QR encoding pass number, entry timestamp, in-charge signature line. Triggered on successful entry submission and re-downloadable from history.

## Realtime

Subscribe to `visitors` and `audit_logs` channels on dashboard, history, exit, and audit pages → `queryClient.invalidateQueries` on change.

## Design System

- Background `oklch(0.13 0.01 80)` near-black with subtle dotted grid overlay
- Primary gold `oklch(0.78 0.16 75)` (amber-500-ish)
- Accent green `oklch(0.78 0.18 155)` for "SECURE LINK" / status indicators
- Destructive red `oklch(0.65 0.22 25)`
- Fonts: **Space Grotesk** display + **JetBrains Mono** body/UI (matches the screenshots' monospace chrome)
- Custom button variants: `gold` (solid amber), `outline-mono` (bordered monospace)
- Card surface `oklch(0.17 0.01 80)` with `border oklch(0.22 0.01 80)`
- Section eyebrows in uppercase amber mono (e.g. `ACCESS / PERSONNEL`)

## Technical Notes

- Framework: TanStack Start (file-based routes under `src/routes/`)
- Data: `createServerFn` with `requireSupabaseAuth` for all writes; admin operations use `supabaseAdmin` server-side
- Storage uploads from browser via authenticated supabase client; images compressed to ≤1280px JPEG before upload
- Charts: `recharts` (already shadcn-compatible)
- Signature: `react-signature-canvas`
- Routing: `/dashboard`, `/entry`, `/exit`, `/history`, `/audit`, `/users` all under `_authenticated` layout; `/audit` and `/users` additionally guarded by admin role check
- Sitemap + robots.txt for SEO

## Out of Scope / Notes

- True server-side face matching (would require Python service) — client-side face-api.js is the realistic edge-runtime option
- SMS notifications, hardware barrier integration
- Multi-gate routing (single virtual gate for now)
