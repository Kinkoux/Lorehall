import { pgTable, text, integer, bigint, primaryKey } from "drizzle-orm/pg-core";

// Timestamps are Date.now() ms kept as BIGINT (mode: number) so no call
// site changed in the SQLite -> Postgres port.
const ms = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // Column is CITEXT in the database (see scripts/bootstrap-db.mjs) so
  // username uniqueness + lookups stay case-insensitive like SQLite NOCASE.
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  passwordHash: text("password_hash").notNull(),
  createdAt: ms("created_at").notNull(),
});

export const worlds = pgTable("worlds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  createdAt: ms("created_at").notNull(),
});

export const worldMembers = pgTable(
  "world_members",
  {
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    joinedAt: ms("joined_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.userId] })]
);

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  worldId: text("world_id")
    .notNull()
    .references(() => worlds.id),
  name: text("name").notNull(),
  description: text("description"),
  dmUserId: text("dm_user_id")
    .notNull()
    .references(() => users.id),
  joinCode: text("join_code").notNull().unique(),
  createdAt: ms("created_at").notNull(),
});

export const campaignMembers = pgTable(
  "campaign_members",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    characterName: text("character_name"),
    joinedAt: ms("joined_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.userId] })]
);

export const CODEX_TYPES = ["npc", "location", "faction", "item", "lore"] as const;
export type CodexType = (typeof CODEX_TYPES)[number];

export const codexEntries = pgTable("codex_entries", {
  id: text("id").primaryKey(),
  worldId: text("world_id")
    .notNull()
    .references(() => worlds.id),
  type: text("type", { enum: CODEX_TYPES }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  visibility: text("visibility", { enum: ["everyone", "dm"] })
    .notNull()
    .default("everyone"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
});

export const gameSessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  title: text("title").notNull(),
  status: text("status", { enum: ["live", "ended"] })
    .notNull()
    .default("live"),
  round: integer("round").notNull().default(1),
  turnIndex: integer("turn_index").notNull().default(0),
  recap: text("recap"),
  startedAt: ms("started_at").notNull(),
  endedAt: ms("ended_at"),
});

export const combatants = pgTable("combatants", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => gameSessions.id),
  name: text("name").notNull(),
  initiative: integer("initiative").notNull(),
  maxHp: integer("max_hp"),
  hp: integer("hp"),
  tempHp: integer("temp_hp").notNull().default(0),
  deathSuccesses: integer("death_successes").notNull().default(0),
  deathFailures: integer("death_failures").notNull().default(0),
  conditions: text("conditions"),
  userId: text("user_id").references(() => users.id),
  createdAt: ms("created_at").notNull(),
});

export const sessionEvents = pgTable("session_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => gameSessions.id),
  userId: text("user_id").references(() => users.id),
  kind: text("kind", { enum: ["roll", "join", "system", "note"] }).notNull(),
  message: text("message").notNull(),
  createdAt: ms("created_at").notNull(),
});

export const characters = pgTable("characters", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  klass: text("klass"),
  race: text("race"),
  level: integer("level").notNull().default(1),
  maxHp: integer("max_hp"),
  armorClass: integer("armor_class"),
  str: integer("str"),
  dex: integer("dex"),
  con: integer("con"),
  intel: integer("intel"),
  wis: integer("wis"),
  cha: integer("cha"),
  profSkills: text("prof_skills"),
  profSaves: text("prof_saves"),
  status: text("status", { enum: ["alive", "dead"] })
    .notNull()
    .default("alive"),
  notes: text("notes"),
  updatedAt: ms("updated_at").notNull(),
});

export const characterItems = pgTable("character_items", {
  id: text("id").primaryKey(),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id),
  name: text("name").notNull(),
  qty: integer("qty").notNull().default(1),
  notes: text("notes"),
  createdAt: ms("created_at").notNull(),
});

export const characterAbilities = pgTable("character_abilities", {
  id: text("id").primaryKey(),
  characterId: text("character_id")
    .notNull()
    .references(() => characters.id),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["spell", "ability", "trait"] })
    .notNull()
    .default("ability"),
  notes: text("notes"),
  usesMax: integer("uses_max"),
  usesLeft: integer("uses_left"),
  createdAt: ms("created_at").notNull(),
});

export const storyBeats = pgTable("story_beats", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  title: text("title").notNull(),
  narrative: text("narrative"),
  rollNote: text("roll_note"),
  status: text("status", { enum: ["pending", "current", "done"] })
    .notNull()
    .default("pending"),
  position: integer("position").notNull(),
  createdAt: ms("created_at").notNull(),
});

export const quests = pgTable("quests", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["active", "done", "failed"] })
    .notNull()
    .default("active"),
  createdAt: ms("created_at").notNull(),
});

export const partyLedger = pgTable("party_ledger", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  userId: text("user_id").references(() => users.id),
  createdAt: ms("created_at").notNull(),
});

export const partyItems = pgTable("party_items", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  name: text("name").notNull(),
  qty: integer("qty").notNull().default(1),
  notes: text("notes"),
  createdAt: ms("created_at").notNull(),
});

export const encounters = pgTable("encounters", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  name: text("name").notNull(),
  createdAt: ms("created_at").notNull(),
});

export const encounterMonsters = pgTable("encounter_monsters", {
  id: text("id").primaryKey(),
  encounterId: text("encounter_id")
    .notNull()
    .references(() => encounters.id),
  name: text("name").notNull(),
  count: integer("count").notNull().default(1),
  maxHp: integer("max_hp"),
  dexMod: integer("dex_mod").notNull().default(0),
  srdIndex: text("srd_index"),
  createdAt: ms("created_at").notNull(),
});

export const campaignMaps = pgTable("campaign_maps", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  visibility: text("visibility", { enum: ["everyone", "dm"] })
    .notNull()
    .default("everyone"),
  isActive: integer("is_active").notNull().default(0),
  createdAt: ms("created_at").notNull(),
});

export type User = typeof users.$inferSelect;
export type World = typeof worlds.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CodexEntry = typeof codexEntries.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type Combatant = typeof combatants.$inferSelect;
export type SessionEvent = typeof sessionEvents.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type CharacterItem = typeof characterItems.$inferSelect;
export type CharacterAbility = typeof characterAbilities.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type Encounter = typeof encounters.$inferSelect;
export type EncounterMonster = typeof encounterMonsters.$inferSelect;
export type CampaignMap = typeof campaignMaps.$inferSelect;
