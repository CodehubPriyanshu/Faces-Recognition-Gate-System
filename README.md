# Vigil Guardian Pass

A secure gate entry and exit verification system built with Vite, React, TanStack Start, and Supabase.

## Overview

`Vigil Guardian Pass` is a modern web application designed for BSF STC Bengaluru campus access control. It uses server-side rendering and a Vite-powered React stack to provide a fast, secure, and maintainable gate pass management experience.

## Key Features

- Authentication using Supabase
- Secure gate entry and exit verification
- Face recognition workflow support
- SSR-ready React app via TanStack Start
- Tailwind CSS + Radix UI component-based UI
- Modular route-based UI with `@tanstack/react-router`
- PDF generation and audit logs
- Optimized Vite build for deployment

## Tech Stack

- Vite
- React 19
- TanStack Start
- `@tanstack/react-router`
- Supabase
- Tailwind CSS 4
- Radix UI
- TypeScript

## Project Structure

- `src/` — source code
  - `routes/` — application routes and page components
  - `integrations/supabase/` — Supabase auth and client setup
  - `lib/` — utility modules and server helpers
  - `components/` — reusable UI components
- `vite.config.ts` — Vite configuration
- `package.json` — npm scripts and dependencies
- `vercel.json` — Vercel deployment settings

## Local Development

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the dev server

   ```bash
   npm run dev
   ```

3. Open the app in your browser at the URL shown in the terminal.

## Build Scripts

- `npm run dev` — start Vite development server
- `npm run build` — produce a production build
- `npm run preview` — preview production build locally
- `npm run lint` — run ESLint
- `npm run format` — format code with Prettier
- `npm run vercel-build` — build command configured for Vercel

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values for Supabase and any other secure config.

For Netlify, add these same variables in **Project configuration > Environment variables**:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Do not expose `SUPABASE_SERVICE_ROLE_KEY` with a `VITE_` prefix. It must remain server-only.

## Netlify Deployment

This project is configured for Netlify using the official TanStack Start adapter.

- Build command: `npm run build`
- Publish directory: `dist/client`
- Node version: `22.12.0`

The `netlify.toml` file contains these settings, so Netlify should detect them automatically after you connect the repository.

Deployment checklist:

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Netlify, choose **Add new project > Import an existing project**.
3. Select the repository and branch.
4. Confirm the build settings from `netlify.toml`: `npm run build` and `dist/client`.
5. Add the Supabase environment variables listed above.
6. Deploy the site.
7. In Supabase Auth settings, add your Netlify URL to the allowed site/redirect URLs, for example `https://your-site.netlify.app`.

## Vercel Deployment

This project is configured for Vercel deployment using Vite and a static build target.

- Build command: `npm run vercel-build`
- Output directory: `dist`

The `vercel.json` file includes:

- `@vercel/static-build` for static asset delivery
- SPA fallback routing to `index.html`

## Notes

- The Vite config disables Cloudflare-specific build output so the project can deploy cleanly to Vercel.
- The repo uses Node `>=18.0.0` in `package.json`.
- Existing Cloudflare worker configuration files such as `wrangler.jsonc` remain in the repo, but Vercel deployment uses the static Vite output instead.

---

If you want, I can also add a short `CONTRIBUTING.md` or deploy checklist for Vercel.
