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

## Upload size on Vercel — solved for maps

Vercel's serverless request-body limit is ~4.5 MB, below the app's 10 MB map
cap. Maps now bypass it entirely (2026-08-19): `requestMapUpload` returns a
Supabase *signed upload URL*, the browser PUTs the file straight to Storage,
and `finalizeMapUpload` records the row after asking Storage what actually
landed under that key. Nothing but the key crosses a server action.

Portraits (4 MB cap) still post their bytes through an action, which fits
under the limit; `next.config.ts` sets `bodySizeLimit: "5mb"` for them.

Worth setting on the bucket: Storage → `maps` → a **file size limit** of
10 MB. A signed URL carries no size cap of its own, so that setting is what
stops an oversized object from ever being written — the server-side check
only refuses to record it afterwards.
