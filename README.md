# Lorehall (dnd-hub)

A **companion app for a physical table**: the game is played out loud with real
dice; the app keeps the world codex, campaign journal, initiative/HP tracking,
character sheets (inventory + spell uses), the DM's private story-beat script,
and a rules quick-reference. One world, many campaigns, per-campaign roles —
DM in one campaign, player in another. Parchment look.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS v4 (theme tokens in `app/globals.css`)
- Supabase Postgres via postgres-js + Drizzle ORM (`lib/db/`) — schema DDL in
  `scripts/bootstrap-db.mjs` (`npm run db:bootstrap`, idempotent); uploaded
  map images in Supabase Storage (`lib/storage.ts`, private `maps` bucket)
- Own lightweight auth: username/password (bcryptjs) + JWT session cookie (jose).
  Secrets in `.env.local` (gitignored) — copy `.env.example` and fill in.

## Run

```bash
npm run dev -- -p 3456
```

## Domain model

- **users** — global accounts
- **worlds** — owned by a user; `world_members` (owner/member)
- **campaigns** — belong to a world; creator is its DM; unique 6-char `join_code`
- **campaign_members** — players (+ optional character name); joining a campaign
  auto-joins the world
- **codex_entries** — npc / location / faction / item / lore; visibility
  `everyone` or `dm` (DM-only entries visible to the world owner and anyone who
  DMs a campaign in that world — see `lib/perms.ts`)

## Live sessions (Phase 2, done)

- DM starts/ends sessions; ended sessions become journal entries (recap editable).
- Initiative: players type their physical d20 roll (or let the app roll),
  DM adds monsters with HP; damage/heal, conditions, turn/round tracking.
- Table log: server-side dice rolls (optional — real dice stay primary) + pinned notes.
- Story beats: DM-only script per campaign (scene title, narration text, roll
  reminder), with pending/current/done flow, visible on the live screen.
- Character sheets per campaign member: free-text class/race (homebrew-friendly),
  HP/AC, inventory with quantities, spells/abilities with use counters + long rest.
- `/reference`: SRD 5.1-based skills, conditions, combat actions (CC-BY-4.0).
- Live updates via 3s polling (`components/AutoRefresh.tsx`) — paused while the
  user is typing or has a `<details>` open.

## Phase 3 (done)

- **SRD compendium** (`/compendium`, public — no sign-in needed): 319 spells +
  334 monster stat blocks from SRD 5.1 (CC-BY-4.0), fetched once by
  `scripts/fetch-srd.mjs` into `lib/data/*.json`. Spell → "add to my sheet";
  monster → "add to encounter" / "throw into live session".
- **Encounters**: DM preps monster groups on the campaign page (SRD or
  homebrew rows), deploys them to a live session in one click — each creature
  rolls d20 + DEX for initiative; the turn pointer stays on whoever had the turn.
- **Ability scores**: six scores + save/skill proficiency checkboxes on the
  sheet; auto-computed modifiers, saves, skill bonuses, proficiency bonus,
  and passive Perception (shown as a chip in the party list for the DM).
  App-rolled initiative now adds the character's DEX mod.
- **Combat state**: temporary HP (absorbed before real damage) and death-save
  pips (auto-shown for downed player characters; heal resets them; log events
  at 0 HP / stable / dead).
- **Quest log** (DM manages, party reads) and **party treasury** (gold ledger
  with balance + shared loot pool, any member can log entries).
- `/reference` and `/compendium` are public; worlds/campaigns/sessions stay
  behind sign-in.

## Phase 4 (done)

- **Bilingual UI (TR/EN)**: cookie-based locale with a navbar toggle; dictionary
  i18n in `lib/i18n/` (10 namespaces, en+tr mirrored). SRD spell/monster text
  stays English; the hand-written reference content (skills, conditions,
  combat actions) is fully translated in `lib/srd.ts`. `<html lang>` follows
  the locale so CSS uppercasing handles Turkish İ correctly.
- **Design system v2** ("rubricated ledger", less AI-looking): no emoji —
  a hand-drawn monoline SVG icon set (`components/Icons.tsx`) including
  8 spell-school sigils; vermilion small-caps section rubrics with double
  ledger rules; double-hairline card frames; sticky navbar with active-link
  underlines, language toggle, and My characters; redesigned landing page.
- **Monster artwork**: `scripts/fetch-monster-images.mjs` matches monsters to
  Wikipedia lead images and accepts them **only when hosted on Wikimedia
  Commons** (free licenses); 128/334 matched, hotlinked at the API-served
  size with attribution; the rest fall back to a claw glyph.
- **Spell filters v2**: school filter + subclass filter — SRD subclasses
  (Lore, Life, Devotion, Fiend, Land) from data, plus rule-based presets for
  Arcane Trickster and Eldritch Knight (wizard list restricted by school; the
  page shows a note that these are rule-derived, not SRD lists).
- **/characters hub**: create a character by picking name + campaign (lands on
  the full sheet); lists all your characters with HP/AC/PP chips.
- **Alive/dead**: `characters.status`; only the DM can toggle it (sheet page);
  dead characters show a skull badge on the party list, the hub, and a banner
  on the sheet, and can no longer join initiative.

## Phase 5 (in progress)

- **Campaign maps**: DM uploads image maps (PNG/JPG/WebP ≤10 MB) per campaign
  with everyone/dm visibility; players browse them on the campaign page and
  open a pan/zoom/pinch/fullscreen viewer (`components/MapViewer.tsx`). One
  map at a time is "on the table": it appears on the live session screen for
  the whole party (3s polling), with a DM switcher right on that screen.
  Files go through `lib/storage.ts` — local disk in dev, Supabase Storage
  when configured; images are served by `app/files/maps/[mapId]/route.ts`,
  which enforces campaign permissions (everything unauthorized is a 404).

## Roadmap

- [ ] Vercel + Supabase deploy — see `DEPLOY.md` (DB port to Postgres pending)
- [ ] Live-table upgrades from the VTT research — see `docs/roadmap-vtt-ideas.md`
  (table display mode, statblock drawer, condition markers, fog brush…)
- [ ] Markdown + `[[wiki-links]]` in codex bodies
- [ ] Link codex entries from journal recaps ("Ser Alden" → NPC page)
- [ ] Handouts; in-world calendar

## Deploy note

DB and storage both live in **Supabase** (Postgres + Storage) as of 2026-08-17;
the old local SQLite file only matters as the source for the one-time
`npm run db:migrate-local`. Vercel setup steps and the upload-size caveat are
in `DEPLOY.md`.
