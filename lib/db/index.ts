import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS world_members (
  world_id TEXT NOT NULL REFERENCES worlds(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, user_id)
);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id),
  name TEXT NOT NULL,
  description TEXT,
  dm_user_id TEXT NOT NULL REFERENCES users(id),
  join_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  character_name TEXT,
  joined_at INTEGER NOT NULL,
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
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
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS combatants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  initiative INTEGER NOT NULL,
  max_hp INTEGER,
  hp INTEGER,
  conditions TEXT,
  user_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
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
  notes TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (campaign_id, user_id)
);
CREATE TABLE IF NOT EXISTS character_items (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS character_abilities (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'ability',
  notes TEXT,
  uses_max INTEGER,
  uses_left INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS story_beats (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  title TEXT NOT NULL,
  narrative TEXT,
  roll_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL
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
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS party_ledger (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS party_items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS encounter_monsters (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES encounters(id),
  name TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  max_hp INTEGER,
  dex_mod INTEGER NOT NULL DEFAULT 0,
  srd_index TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_maps (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'everyone',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_maps_campaign ON campaign_maps(campaign_id);
CREATE INDEX IF NOT EXISTS idx_quests_campaign ON quests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ledger_campaign ON party_ledger(campaign_id);
CREATE INDEX IF NOT EXISTS idx_party_items_campaign ON party_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_encounters_campaign ON encounters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_enc_monsters ON encounter_monsters(encounter_id);
`;

// Columns added after a table first shipped: CREATE TABLE IF NOT EXISTS won't
// add them to existing databases, so patch them in with guarded ALTERs.
const COLUMN_MIGRATIONS: Array<[table: string, column: string, ddl: string]> = [
  ["characters", "str", "str INTEGER"],
  ["characters", "dex", "dex INTEGER"],
  ["characters", "con", "con INTEGER"],
  ["characters", "intel", "intel INTEGER"],
  ["characters", "wis", "wis INTEGER"],
  ["characters", "cha", "cha INTEGER"],
  ["characters", "prof_skills", "prof_skills TEXT"],
  ["characters", "prof_saves", "prof_saves TEXT"],
  ["characters", "status", "status TEXT NOT NULL DEFAULT 'alive'"],
  ["combatants", "temp_hp", "temp_hp INTEGER NOT NULL DEFAULT 0"],
  ["combatants", "death_successes", "death_successes INTEGER NOT NULL DEFAULT 0"],
  ["combatants", "death_failures", "death_failures INTEGER NOT NULL DEFAULT 0"],
];

function createDb() {
  const dataDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "dnd-hub.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(BOOTSTRAP_SQL);
  for (const [table, column, ddl] of COLUMN_MIGRATIONS) {
    const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
  return drizzle(sqlite, { schema });
}

// Cache on globalThis so Next.js dev-mode HMR doesn't open a new
// connection on every reload.
const globalForDb = globalThis as unknown as {
  __dndDb?: BetterSQLite3Database<typeof schema>;
};

export const db = globalForDb.__dndDb ?? createDb();
globalForDb.__dndDb = db;

export * from "./schema";
