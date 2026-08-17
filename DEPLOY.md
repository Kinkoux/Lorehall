# Deploying Lorehall — Vercel + Supabase

Target: GitHub → Vercel (Next.js), Supabase for Postgres + Storage.

## Status

- [x] Map images go through `lib/storage.ts`: local disk fallback, Supabase
      Storage automatically once `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
      are set. The bucket stays **private**; every read is proxied through
      `app/files/maps/[mapId]/route.ts`, which enforces campaign permissions.
- [x] Repo on GitHub, `.env.example` documents all env vars.
- [x] **Database ported to Supabase Postgres** (2026-08-17): pg-core schema,
      postgres-js driver with `prepare: false` (transaction pooler),
      timestamps stay ms-integers (BIGINT), username is CITEXT (preserves
      SQLite's case-insensitive uniqueness). Schema DDL:
      `npm run db:bootstrap`. Local SQLite data + map files migrated with
      `npm run db:migrate-local` (better-sqlite3 now a devDependency, kept
      only for that script). Verified live: reads, writes, and Storage-served
      map images all work through the pooler.
- [ ] Vercel project.

## 1. Supabase project (owner does this once)

1. Create a project at supabase.com → note down:
   - `DATABASE_URL` — use the **Transaction pooler** URI (port 6543) for
     serverless; the direct URI (5432) works for local dev.
   - `SUPABASE_URL` (Project Settings → API → Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API Keys →
     **secret key** (`sb_secret_…`; older projects call it `service_role`).
     `lib/storage.ts` accepts either format.
2. Storage → create bucket `maps`, **private** (do not enable public access).
3. Put the values into `.env.local` (locally) and Vercel env vars (deploy).

## 2. Database port (planned change list)

- `lib/db/schema.ts`: `drizzle-orm/sqlite-core` → `drizzle-orm/pg-core`.
  Keep timestamps as ms-integer `bigint({ mode: "number" })` so no call site
  (`Date.now()`, `new Date(x)`) changes. `is_active` stays integer 0/1.
- `lib/db/index.ts`: `better-sqlite3` driver → `postgres` (postgres-js),
  `drizzle-orm/postgres-js`. The `BOOTSTRAP_SQL` block becomes a one-time
  migration run in the Supabase SQL editor (or `drizzle-kit push`).
- Deps: `npm i postgres` · `npm rm better-sqlite3 @types/better-sqlite3`.
- One-time data migration if existing local campaigns matter: dump SQLite
  rows → insert into Postgres (small script, tables are 1:1).

## 3. Vercel

1. Import the GitHub repo (framework auto-detected: Next.js).
2. Env vars: `AUTH_SECRET`, `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`.
3. Deploy. `/reference` and `/compendium` are public; the rest needs sign-in.

## Known constraint: upload size on Vercel

Vercel's serverless request-body limit is ~4.5 MB, below the app's 10 MB map
cap (`next.config.ts` raises the server-action limit to 12 MB, which only
helps self-hosted). On Vercel, either:

- accept smaller maps (drop the cap to 4 MB), or
- **better**: switch the upload path to a Supabase Storage *signed upload
  URL* — server action creates the signed URL, the browser uploads the file
  straight to Supabase (bypassing Vercel), then a second action records the
  DB row. Small change, only touches `lib/map-actions.ts` +
  `components/MapUploadForm.tsx`.
