import { pgTable, text, integer, bigint, primaryKey, index } from "drizzle-orm/pg-core";

// Timestamps are Date.now() ms kept as BIGINT (mode: number) so no call
// site changed in the SQLite -> Postgres port.
const ms = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // Column is CITEXT in the database (see scripts/bootstrap-db.mjs) so
  // username uniqueness + lookups stay case-insensitive like SQLite NOCASE.
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  // Also CITEXT, so a link sent to Ada@… belongs to the account that typed
  // ada@…. Nullable because accounts predate the column and because the
  // address is only ever a recovery route, never the identity: uniqueness is
  // a partial index over the non-NULL rows (see scripts/bootstrap-db.mjs).
  email: text("email"),
  // When the owner followed the link we mailed. NULL = unconfirmed.
  emailVerifiedAt: ms("email_verified_at"),
  passwordHash: text("password_hash").notNull(),
  // Bumped to retire every cookie issued so far — a session token carries the
  // version it was signed with and stops verifying once this moves past it.
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: ms("created_at").notNull(),
});

/**
 * Fixed-window attempt counters for sign-in, registration and join codes.
 * Kept in the database rather than process memory so every serverless
 * instance counts against the same window. Rows are self-healing: an elapsed
 * window is restarted in place by the next attempt (see lib/rate-limit.ts).
 */
export const authAttempts = pgTable("auth_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: ms("reset_at").notNull(),
});

export const EMAIL_TOKEN_KINDS = ["verify", "reset"] as const;
export type EmailTokenKind = (typeof EMAIL_TOKEN_KINDS)[number];

/**
 * One-shot links mailed to an address: "confirm this is you" and "set a new
 * password". Only the sha256 of the token is stored, so the message in the
 * inbox is the single copy of the secret — a database dump hands over nothing
 * that can be redeemed. `used_at` spends the row, `expires_at` retires it
 * regardless (see lib/email-tokens.ts).
 */
export const emailTokens = pgTable("email_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  kind: text("kind", { enum: EMAIL_TOKEN_KINDS }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ms("expires_at").notNull(),
  usedAt: ms("used_at"),
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

/**
 * The DM's own item library, one per world (docs/design-economy.md phase 2).
 * Categories are the same six buckets the SRD compendium filters by, so a
 * homebrew blade and an SRD blade wear the same mark.
 */
export const WORLD_ITEM_CATEGORIES = [
  "weapon",
  "armor",
  "gear",
  "tool",
  "vehicle",
  "magic",
] as const;
export type WorldItemCategory = (typeof WORLD_ITEM_CATEGORIES)[number];

/**
 * Where a thing is worn. Design-economy.md phase 3 named six; `neck` and
 * `wrist` were added when the sheet grew its equipment panel, because an
 * amulet and a bracer are the two pieces every table reaches for first. NULL
 * is the document's "none": the item is carried, not equipped.
 *
 * The same set is the vocabulary on both sides — `world_items.slot` records
 * what a library piece *could* fill, `character_items.slot` records where a
 * particular copy actually sits. Both columns are plain TEXT in the database
 * (no CHECK constraint), so widening this list needs no migration; the
 * validated writers are what keep the values honest.
 */
export const WORLD_ITEM_SLOTS = [
  "head",
  "neck",
  "armor",
  "hands",
  "wrist",
  "ring",
  "boots",
  "weapon",
] as const;
export type WorldItemSlot = (typeof WORLD_ITEM_SLOTS)[number];

/**
 * Keys allowed in `statBonuses`. Flat integers only — phase 3 folds them into
 * statBlock() and the design note is explicit that depth (conditions,
 * attunement) is what kills these systems.
 */
export const WORLD_ITEM_STATS = [
  "ac",
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
  "hp",
] as const;
export type WorldItemStat = (typeof WORLD_ITEM_STATS)[number];

export const worldItems = pgTable("world_items", {
  id: text("id").primaryKey(),
  worldId: text("world_id")
    .notNull()
    .references(() => worlds.id),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category", { enum: WORLD_ITEM_CATEGORIES }).notNull().default("gear"),
  slot: text("slot", { enum: WORLD_ITEM_SLOTS }),
  // JSON object of flat bonuses, e.g. {"ac":1,"str":2}; NULL = a plain item.
  // Written only through the validated writer in lib/world-item-actions.ts and
  // read back through lib/world-items.ts, which distrusts it either way.
  statBonuses: text("stat_bonuses"),
  // Uploaded illustration: storage key + MIME, like a character portrait.
  imageFile: text("image_file"),
  imageMime: text("image_mime"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: ms("created_at").notNull(),
});
// Names are unique per world, case-insensitively — the index lives in
// scripts/bootstrap-db.mjs (`world_items_name_unique`) because it is spelled
// over lower(name), which this schema cannot declare.

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
  // A session is "live" long before anyone rolls initiative — combat is an
  // explicit phase the DM opens and closes; rounds only tick while it is on.
  combatActive: integer("combat_active").notNull().default(0),
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
  // The sheet this row was rolled from, when a player joined initiative with
  // one of their characters — lets the live screen show its portrait.
  // NULL for monsters and DM-added creatures.
  characterId: text("character_id").references(() => characters.id),
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
  // First character per campaign is auto-approved; extra ones from the
  // same user wait for the DM.
  approval: text("approval", { enum: ["approved", "pending"] })
    .notNull()
    .default("approved"),
  notes: text("notes"),
  // Uploaded portrait: storage key (one-shot nanoid + extension) and its MIME
  // type. NULL/NULL means "no portrait" — the UI draws a placeholder instead.
  imageFile: text("image_file"),
  imageMime: text("image_mime"),
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
  // Where the line came from. The name and notes are still copied onto the row
  // (a sheet reads on its own), but the reference is what the inventory links
  // back to, and what a lost snapshot falls back on. Both NULL for a
  // hand-typed line; worldItemId goes back to NULL if the library entry is
  // deleted.
  worldItemId: text("world_item_id").references(() => worldItems.id),
  srdIndex: text("srd_index"),
  // Equipment (docs/design-economy.md phase 3). `slot` is where this copy can
  // be worn — one of WORLD_ITEM_SLOTS, NULL for something merely carried —
  // and `equipped` is whether it is worn right now. At most one equipped row
  // per (character, slot); the database is the arbiter, through the partial
  // unique index `character_items_one_per_slot` in scripts/bootstrap-db.mjs.
  slot: text("slot", { enum: WORLD_ITEM_SLOTS }),
  equipped: integer("equipped").notNull().default(0),
  // Snapshot of the source's bonuses in the same JSON shape world_items uses,
  // taken when the line was stocked, so retuning a library entry does not
  // silently restat every copy already in play. NULL falls back to the
  // referenced world item, and a line with neither is simply flavour.
  statBonuses: text("stat_bonuses"),
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
  // The SRD spell this line was stamped from, when it came from the
  // compendium — the sheet links back to the full text instead of reprinting
  // it. NULL for a hand-typed spell, a class feature or a homebrew power;
  // there is no homebrew spell library to reference.
  srdIndex: text("srd_index"),
  createdAt: ms("created_at").notNull(),
});

/** Chapters of the DM's story book; beats file into one (or stay unfiled). */
export const storyChapters = pgTable("story_chapters", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  createdAt: ms("created_at").notNull(),
});

export const storyBeats = pgTable("story_beats", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  // NULL = unfiled: the beat sits in the story book's default group.
  chapterId: text("chapter_id").references(() => storyChapters.id),
  title: text("title").notNull(),
  narrative: text("narrative"),
  rollNote: text("roll_note"),
  // Plot points are the load-bearing turns of the story; scenes are everything
  // else. Only the rendering differs — both are ordinary beats.
  kind: text("kind", { enum: ["scene", "plot"] })
    .notNull()
    .default("scene"),
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
  // VTT square grid, measured in pixels of the ORIGINAL image. NULL size
  // means "no grid"; the offsets shift the first line off the top-left.
  gridSize: integer("grid_size"),
  gridOffsetX: integer("grid_offset_x").notNull().default(0),
  gridOffsetY: integer("grid_offset_y").notNull().default(0),
  createdAt: ms("created_at").notNull(),
});

/**
 * DM change-log feed: an append-only record of player-side changes (sheets,
 * items, abilities, gold, loot, character lifecycle) so the DM gets
 * observability instead of edit authority. DM writes to other players' sheets
 * land here too — rare writes stay visible. `message` is JSON {k, p} rendered
 * through the dictionary at display time (see lib/campaign-log.ts).
 */
export const campaignEvents = pgTable(
  "campaign_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    // NULL only if the acting user is ever removed — the entry survives.
    actorId: text("actor_id").references(() => users.id),
    kind: text("kind", {
      enum: ["sheet", "item", "ability", "status", "character", "gold", "loot"],
    }).notNull(),
    message: text("message").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("idx_campaign_events").on(t.campaignId, t.createdAt)]
);

export type User = typeof users.$inferSelect;
export type EmailToken = typeof emailTokens.$inferSelect;
export type World = typeof worlds.$inferSelect;
export type WorldItem = typeof worldItems.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CodexEntry = typeof codexEntries.$inferSelect;
export type GameSession = typeof gameSessions.$inferSelect;
export type Combatant = typeof combatants.$inferSelect;
export type SessionEvent = typeof sessionEvents.$inferSelect;
export type StoryChapter = typeof storyChapters.$inferSelect;
export type StoryBeat = typeof storyBeats.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type CharacterItem = typeof characterItems.$inferSelect;
export type CharacterAbility = typeof characterAbilities.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type Encounter = typeof encounters.$inferSelect;
export type EncounterMonster = typeof encounterMonsters.$inferSelect;
export type CampaignMap = typeof campaignMaps.$inferSelect;
export type CampaignEvent = typeof campaignEvents.$inferSelect;
