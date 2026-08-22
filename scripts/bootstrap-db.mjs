// One-time (idempotent) schema bootstrap for Supabase Postgres.
// Usage: npm run db:bootstrap  (reads DATABASE_URL from .env.local or env)
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL yok — .env.local doldurulmalı.");
  process.exit(1);
}

// Timestamps are Date.now() ms as BIGINT. username is CITEXT so uniqueness
// and login stay case-insensitive (SQLite had COLLATE NOCASE).
const DDL = `
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username CITEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS world_members (
  world_id TEXT NOT NULL REFERENCES worlds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (world_id, user_id)
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  name TEXT NOT NULL,
  description TEXT,
  dm_user_id TEXT NOT NULL REFERENCES users(id),
  join_code TEXT NOT NULL UNIQUE,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  character_name TEXT,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (campaign_id, user_id)
);
CREATE TABLE IF NOT EXISTS codex_entries (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'everyone',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_codex_world ON codex_entries(world_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_world ON campaigns(world_id);
-- world item library (2026-08-19): the DM's homebrew gear for one world.
-- stat_bonuses is a JSON object of flat integers ({"ac":1,"str":2}) that
-- equipment (phase 3) will fold into a statblock; slot records what the piece
-- could fill, NULL meaning "carried, not worn". Declared here, before
-- character_items, so that table can reference it inline.
CREATE TABLE IF NOT EXISTS world_items (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'gear',
  slot TEXT,
  stat_bonuses TEXT,
  visibility TEXT NOT NULL DEFAULT 'everyone',
  image_file TEXT,
  image_mime TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_world_items_world ON world_items(world_id);
-- One name per world, spelled the way a person would recognise it: "Sunblade"
-- and "sunblade" are the same entry, and the second insert loses with
-- SQLSTATE 23505 for the action to report.
CREATE UNIQUE INDEX IF NOT EXISTS world_items_name_unique ON world_items (world_id, lower(name));
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'live',
  round INTEGER NOT NULL DEFAULT 1,
  turn_index INTEGER NOT NULL DEFAULT 0,
  recap TEXT,
  started_at BIGINT NOT NULL,
  ended_at BIGINT
);
CREATE TABLE IF NOT EXISTS combatants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  initiative INTEGER NOT NULL,
  max_hp INTEGER,
  hp INTEGER,
  temp_hp INTEGER NOT NULL DEFAULT 0,
  death_successes INTEGER NOT NULL DEFAULT 0,
  death_failures INTEGER NOT NULL DEFAULT 0,
  conditions TEXT,
  user_id TEXT REFERENCES users(id),
  -- character_id is added by the guarded ALTER at the bottom: characters is
  -- created after this table, so the reference cannot be declared inline.
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  klass TEXT,
  race TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  max_hp INTEGER,
  armor_class INTEGER,
  str INTEGER,
  dex INTEGER,
  con INTEGER,
  intel INTEGER,
  wis INTEGER,
  cha INTEGER,
  prof_skills TEXT,
  prof_saves TEXT,
  status TEXT NOT NULL DEFAULT 'alive',
  approval TEXT NOT NULL DEFAULT 'approved',
  notes TEXT,
  image_file TEXT,
  image_mime TEXT,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS character_items (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  world_item_id TEXT REFERENCES world_items(id),
  srd_index TEXT,
  slot TEXT,
  equipped INTEGER NOT NULL DEFAULT 0,
  stat_bonuses TEXT,
  ac_base INTEGER,
  ac_dex TEXT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS character_abilities (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'ability',
  notes TEXT,
  uses_max INTEGER,
  uses_left INTEGER,
  srd_index TEXT,
  created_at BIGINT NOT NULL
);
-- spell slots (2026-08-20): the 5e resource a per-line "uses" counter cannot
-- express — a slot belongs to the caster, not to a spell. One row per spell
-- level (1..9) the character actually has slots in; a level with none has no
-- row. total is what a long rest restores to, used is how many are spent.
CREATE TABLE IF NOT EXISTS character_spell_slots (
  character_id TEXT NOT NULL REFERENCES characters(id),
  level INTEGER NOT NULL,
  total INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, level)
);
CREATE TABLE IF NOT EXISTS story_chapters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chapters_campaign ON story_chapters(campaign_id);
CREATE TABLE IF NOT EXISTS story_beats (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  chapter_id TEXT REFERENCES story_chapters(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'scene',
  narrative TEXT,
  roll_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  position INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_campaign ON characters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_items_character ON character_items(character_id);
CREATE INDEX IF NOT EXISTS idx_abilities_character ON character_abilities(character_id);
CREATE INDEX IF NOT EXISTS idx_beats_campaign ON story_beats(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_combatants_session ON combatants(session_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS party_ledger (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS party_items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS encounter_monsters (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id),
  name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  max_hp INTEGER,
  dex_mod INTEGER NOT NULL DEFAULT 0,
  srd_index TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quests_campaign ON quests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ledger_campaign ON party_ledger(campaign_id);
CREATE INDEX IF NOT EXISTS idx_party_items_campaign ON party_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_encounters_campaign ON encounters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_enc_monsters ON encounter_monsters(encounter_id);
CREATE TABLE IF NOT EXISTS campaign_maps (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'everyone',
  is_active INTEGER NOT NULL DEFAULT 0,
  grid_size INTEGER,
  grid_offset_x INTEGER NOT NULL DEFAULT 0,
  grid_offset_y INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maps_campaign ON campaign_maps(campaign_id);
-- DM change-log feed (2026-08-18): append-only record of player-side changes.
-- message is JSON {k, p} rendered through the dictionary at display time.
CREATE TABLE IF NOT EXISTS campaign_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  actor_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_events ON campaign_events(campaign_id, created_at);
-- Fixed-window attempt counters shared by every instance (see lib/rate-limit.ts).
-- reset_at is the ms epoch the window ends; a lapsed row restarts in place.
CREATE TABLE IF NOT EXISTS auth_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at BIGINT NOT NULL
);
-- Mailed one-shot links (2026-08-19): 'verify' confirms an address, 'reset'
-- sets a new password. token_hash is the sha256 of the token that went out —
-- the raw value exists only in the message, so this table cannot be redeemed.
CREATE TABLE IF NOT EXISTS email_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, kind);

-- Guarded migrations for databases created before these changes:
-- multi-character support (2026-08-18) drops the one-per-user constraint
-- and adds DM approval for extra characters.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS approval TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_campaign_id_user_id_key;
-- map grid overlay (2026-08-18): cell size in pixels of the original image,
-- NULL = grid off; offsets align the lines with the map's own squares.
ALTER TABLE campaign_maps ADD COLUMN IF NOT EXISTS grid_size INTEGER;
ALTER TABLE campaign_maps ADD COLUMN IF NOT EXISTS grid_offset_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_maps ADD COLUMN IF NOT EXISTS grid_offset_y INTEGER NOT NULL DEFAULT 0;
-- story book (2026-08-18): beats group into chapters (NULL = unfiled) and a
-- beat is either an ordinary scene or a plot point.
ALTER TABLE story_beats ADD COLUMN IF NOT EXISTS chapter_id TEXT REFERENCES story_chapters(id);
ALTER TABLE story_beats ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'scene';
-- explicit combat phase (2026-08-18): a live session is not automatically a
-- fight; rounds only advance between start and end of combat.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS combat_active INTEGER NOT NULL DEFAULT 0;
-- duplicate-click protection (2026-08-18): the DB is the arbiter, not the UI.
-- A player holds at most one combatant row per session, and a campaign has at
-- most one live session; the racing insert loses with SQLSTATE 23505 and the
-- action swallows it. NOTE: if either index fails to create, existing rows
-- already violate it — close the older duplicate live sessions (or delete the
-- duplicate combatant rows) before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_combatant_player ON combatants(session_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_session ON sessions(campaign_id) WHERE status = 'live';
-- character portraits (2026-08-18): the upload's storage key + MIME type, and
-- the sheet an initiative row was rolled from so the live screen can show it.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS image_file TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS image_mime TEXT;
ALTER TABLE combatants ADD COLUMN IF NOT EXISTS character_id TEXT REFERENCES characters(id);
-- session revocation (2026-08-18): raising this retires every cookie already
-- handed out for the account. Existing rows start at 1, which is also what a
-- cookie minted before this column shipped is read as.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
-- one-at-a-time guarantees (2026-08-19): a campaign has at most one map on the
-- table and at most one current story beat. The application already writes both
-- halves in a transaction; these indexes make the database the arbiter, and the
-- racing writer loses with SQLSTATE 23505, which the action swallows.
--
-- Older databases may already hold duplicates from before the transactions, so
-- the tidy-up runs first and keeps the newest row of each group: without it the
-- CREATE INDEX below would fail and leave the rest of the bootstrap undone.
UPDATE campaign_maps m SET is_active = 0
WHERE m.is_active = 1 AND EXISTS (
  SELECT 1 FROM campaign_maps o
  WHERE o.campaign_id = m.campaign_id AND o.is_active = 1
    AND (o.created_at, o.id) > (m.created_at, m.id)
);
UPDATE story_beats b SET status = 'done'
WHERE b.status = 'current' AND EXISTS (
  SELECT 1 FROM story_beats o
  WHERE o.campaign_id = b.campaign_id AND o.status = 'current'
    AND (o.created_at, o.id) > (b.created_at, b.id)
);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_maps_one_active ON campaign_maps (campaign_id) WHERE is_active = 1;
CREATE UNIQUE INDEX IF NOT EXISTS story_beats_one_current ON story_beats (campaign_id) WHERE status = 'current';
-- account email (2026-08-19): CITEXT like username, so the address is matched
-- the way people actually retype it. Every account created before this column
-- has none, hence NULL — and uniqueness has to be a partial index, because a
-- plain UNIQUE would be satisfied by any number of NULLs but would still have
-- to be added to a table that already holds them. email_verified_at is the ms
-- epoch the owner followed the link; it returns to NULL whenever the address
-- changes.
-- item provenance (2026-08-19): an inventory line can name the world library
-- entry or the SRD index it was stamped from. Both stay NULL for hand-typed
-- lines, and world_item_id returns to NULL when the library entry is deleted —
-- the sheet keeps the item, it just loses its source.
ALTER TABLE character_items ADD COLUMN IF NOT EXISTS world_item_id TEXT REFERENCES world_items(id);
ALTER TABLE character_items ADD COLUMN IF NOT EXISTS srd_index TEXT;
-- equipment (2026-08-19, design-economy.md phase 3): where a copy is worn,
-- whether it is worn right now, and a snapshot of the source's bonuses so
-- retuning a library entry does not restat every copy already in play. slot is
-- plain TEXT on purpose — the allowed values are WORLD_ITEM_SLOTS in
-- lib/db/schema.ts, and widening that list must not need a migration.
--
-- One equipped item per slot, with the database as the arbiter rather than the
-- UI: the racing equip loses with SQLSTATE 23505, which the action swallows.
-- No tidy-up runs first because the columns are new — every existing row lands
-- on equipped = 0 and is outside the index.
ALTER TABLE character_items ADD COLUMN IF NOT EXISTS slot TEXT;
ALTER TABLE character_items ADD COLUMN IF NOT EXISTS equipped INTEGER NOT NULL DEFAULT 0;
ALTER TABLE character_items ADD COLUMN IF NOT EXISTS stat_bonuses TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS character_items_one_per_slot ON character_items (character_id, slot) WHERE equipped = 1;
-- hand-written armour on a line (2026-08-21): the SRD's magic armour states
-- its class in prose ("as adamantine plate"), so nothing machine-readable
-- reaches the sheet and wearing it changed no number. ac_base is that number,
-- typed by the player — the base a wearer's class starts from on a line worn
-- in the armor slot, the bonus it adds on one worn in hands — and ac_dex
-- ('full'|'capped2'|'none', NULL reading as 'none') is how DEX joins it.
-- Plain TEXT like slot: the allowed values are AC_DEX_RULES in
-- lib/db/schema.ts, and the validated writer is what keeps the column honest.
-- Both NULL on every existing row, which is exactly "nobody has said
-- anything, keep reading the SRD".
ALTER TABLE character_items ADD COLUMN IF NOT EXISTS ac_base INTEGER;
ALTER TABLE character_items ADD COLUMN IF NOT EXISTS ac_dex TEXT;
-- spell provenance (2026-08-19): the SRD index a sheet line was stamped from,
-- so the sheet links back to the compendium text. NULL for hand-typed lines.
ALTER TABLE character_abilities ADD COLUMN IF NOT EXISTS srd_index TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email CITEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email) WHERE email IS NOT NULL;
-- persistent hit points (2026-08-21): a character's HP used to exist only
-- inside the session it was spent in. current_hp carries it between sessions;
-- NULL means "nobody has touched it", which reads as max_hp everywhere, so
-- every sheet written before this column is at full health rather than at 0.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS current_hp INTEGER;
-- monster HP privacy (2026-08-21): at this table the DM describes a monster's
-- state instead of reading its hit points out. 0 (the default) shows players a
-- condition word in place of the number; the DM sees the numbers regardless.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS show_monster_hp INTEGER NOT NULL DEFAULT 0;
-- item library privacy (2026-08-21): the same two answers a map has. Every
-- entry written before this column is 'everyone' — the library was public to
-- the world by construction, so the default preserves what people already saw.
ALTER TABLE world_items ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'everyone';
-- roster characters (2026-08-22): a sheet no longer has to belong to a table.
-- campaign_id NULL is a character its player owns outright; bringing it to a
-- campaign stamps a copy that carries origin_character_id back to the master,
-- so the roster sheet is never moved, never emptied, and never deleted with
-- the table it visited. The user index is what the roster page reads by —
-- every character of one player, campaign or no campaign.
--
-- ON DELETE SET NULL because descent is a memory rather than a dependency: a
-- player striking a master off their roster must not take a character somebody
-- is mid-campaign with, so the copy survives and simply forgets where it came
-- from.
--
-- One copy of a master per table, with the database as the arbiter: the second
-- of two presses that arrive together loses with SQLSTATE 23505 and is read as
-- the idempotent case it is. Partial, because origin_character_id is NULL on
-- every master and on every sheet created straight into a campaign, and a
-- plain UNIQUE would be satisfied by any number of those but still has to be
-- added to a table already full of them. The same hero at two different tables
-- is deliberately outside it — that is two rows with two campaign ids.
ALTER TABLE characters ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS origin_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS characters_one_copy_per_campaign ON characters (campaign_id, origin_character_id) WHERE origin_character_id IS NOT NULL;
`;

const sql = postgres(url, { prepare: false, connect_timeout: 15 });
try {
  await sql.unsafe(DDL);
  // Row-level security as a lockout, not a policy set. The app reaches this
  // database over its own server-side connection as the table owner, which
  // RLS does not bind; Supabase's Data API roles (anon/authenticated) hold no
  // policies here, so with RLS enabled that whole surface reads and writes
  // nothing. Runs over pg_tables so tables added above are always covered.
  const bare = await sql`
    select tablename from pg_tables
    where schemaname = 'public' and rowsecurity = false`;
  for (const { tablename } of bare) {
    await sql.unsafe(`ALTER TABLE "${tablename}" ENABLE ROW LEVEL SECURITY`);
  }
  if (bare.length > 0) console.log(`RLS açıldı: ${bare.length} tablo.`);
  const tables = await sql`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'public'`;
  console.log(`Bootstrap OK — public şemada ${tables[0].n} tablo.`);
} finally {
  await sql.end({ timeout: 3 });
}
