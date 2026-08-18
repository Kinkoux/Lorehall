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
  created_at BIGINT NOT NULL
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
`;

const sql = postgres(url, { prepare: false, connect_timeout: 15 });
try {
  await sql.unsafe(DDL);
  const tables = await sql`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'public'`;
  console.log(`Bootstrap OK — public şemada ${tables[0].n} tablo.`);
} finally {
  await sql.end({ timeout: 3 });
}
