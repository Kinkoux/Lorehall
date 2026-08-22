import {
  campaignMaps,
  campaignMembers,
  campaigns,
  characterAbilities,
  characterItems,
  characterSpellSlots,
  characters,
  codexEntries,
  combatants,
  gameSessions,
  storyBeats,
  storyChapters,
  users,
  worldItems,
  worldMembers,
  worlds,
  type AcDexRule,
  type WorldItemSlot,
} from "@/lib/db/schema";
import { db } from "./db";

/**
 * The cast every permission test needs, spelled out rather than generated:
 *
 * - `owner`   owns the world but never joined the table
 * - `dm`      runs the campaign (no campaign_members row — the DM is not a member)
 * - `player`  a real campaign_members row
 * - `stranger` no relationship to any of it
 */
export type Fixture = Awaited<ReturnType<typeof seedWorld>>;

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

export async function seedUser(id: string, username = id) {
  await db.insert(users).values({
    id,
    username,
    displayName: username,
    passwordHash: `hash-${id}`,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedWorld() {
  const owner = await seedUser("owner");
  const dm = await seedUser("dm");
  const player = await seedUser("player");
  const stranger = await seedUser("stranger");

  const worldId = nextId("world");
  await db.insert(worlds).values({
    id: worldId,
    name: "Thornreach",
    ownerId: owner,
    createdAt: Date.now(),
  });
  await db.insert(worldMembers).values([
    { worldId, userId: owner, role: "owner", joinedAt: Date.now() },
    { worldId, userId: player, role: "member", joinedAt: Date.now() },
  ]);

  const campaignId = await seedCampaign(worldId, dm);
  await db.insert(campaignMembers).values({
    campaignId,
    userId: player,
    characterName: "Vex",
    joinedAt: Date.now(),
  });

  return { owner, dm, player, stranger, worldId, campaignId };
}

/**
 * A second world for the same cast — `seedWorld` mints fixed user ids and can
 * only run once per test. Nothing joins this one; it exists to own rows that
 * the campaign under test has no business reaching.
 */
export async function seedExtraWorld(ownerId: string) {
  const id = nextId("world");
  await db.insert(worlds).values({
    id,
    name: `Elsewhere ${id}`,
    ownerId,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedCampaign(worldId: string, dmUserId: string) {
  const id = nextId("campaign");
  await db.insert(campaigns).values({
    id,
    worldId,
    name: `Campaign ${id}`,
    dmUserId,
    joinCode: `JOIN${id.toUpperCase()}`,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedCodexEntry(
  worldId: string,
  createdBy: string,
  visibility: "everyone" | "dm" = "everyone"
) {
  const id = nextId("codex");
  const now = Date.now();
  await db.insert(codexEntries).values({
    id,
    worldId,
    type: "npc",
    title: "Grum the Innkeeper",
    body: "",
    visibility,
    createdBy,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function seedCharacter(
  /** NULL is a roster character — one its player owns outside any campaign. */
  campaignId: string | null,
  userId: string,
  maxHp = 20,
  /** What the sheet says it is, for the rules that read the written class. */
  sheet: { klass?: string; level?: number } = {}
) {
  const id = nextId("character");
  await db.insert(characters).values({
    id,
    campaignId,
    userId,
    name: "Vex",
    klass: sheet.klass,
    level: sheet.level ?? 3,
    maxHp,
    updatedAt: Date.now(),
  });
  return id;
}

/** A row of the spell slot tracker: how many of a level, how many spent. */
export async function seedSpellSlot(
  characterId: string,
  level: number,
  total: number,
  used = 0
) {
  await db.insert(characterSpellSlots).values({ characterId, level, total, used });
  return level;
}

export async function seedItem(
  characterId: string,
  qty: number,
  name = "Healing Potion",
  /** Equipment fields, for the tests that care where a line is worn. */
  worn: {
    slot?: WorldItemSlot;
    equipped?: 0 | 1;
    statBonuses?: string;
    worldItemId?: string;
    /** The compendium entry the line was stamped from, when it had one. */
    srdIndex?: string;
    /** An armour class the player typed onto this copy. */
    acBase?: number;
    acDex?: AcDexRule;
  } = {}
) {
  const id = nextId("item");
  await db.insert(characterItems).values({
    id,
    characterId,
    name,
    qty,
    slot: worn.slot,
    equipped: worn.equipped ?? 0,
    statBonuses: worn.statBonuses,
    worldItemId: worn.worldItemId,
    srdIndex: worn.srdIndex,
    acBase: worn.acBase,
    acDex: worn.acDex,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedWorldItem(
  worldId: string,
  createdBy: string,
  values: {
    name?: string;
    slot?: WorldItemSlot;
    statBonuses?: string;
    category?: "weapon" | "armor" | "gear" | "tool" | "vehicle" | "magic";
    /** 'dm' is the piece the party has not been shown yet. */
    visibility?: "everyone" | "dm";
  } = {}
) {
  const id = nextId("worlditem");
  await db.insert(worldItems).values({
    id,
    worldId,
    name: values.name ?? `Relic ${id}`,
    category: values.category ?? "gear",
    slot: values.slot,
    statBonuses: values.statBonuses,
    visibility: values.visibility ?? "everyone",
    createdBy,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedAbility(characterId: string, usesMax: number, usesLeft: number) {
  const id = nextId("ability");
  await db.insert(characterAbilities).values({
    id,
    characterId,
    name: "Second Wind",
    kind: "ability",
    usesMax,
    usesLeft,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedSession(campaignId: string) {
  const id = nextId("session");
  await db.insert(gameSessions).values({
    id,
    campaignId,
    title: "Session One",
    status: "live",
    combatActive: 1,
    startedAt: Date.now(),
  });
  return id;
}

export async function seedCombatant(
  sessionId: string,
  values: { hp: number; maxHp: number | null; tempHp?: number; deathFailures?: number }
) {
  const id = nextId("combatant");
  await db.insert(combatants).values({
    id,
    sessionId,
    name: "Goblin",
    initiative: 12,
    hp: values.hp,
    maxHp: values.maxHp,
    tempHp: values.tempHp ?? 0,
    deathFailures: values.deathFailures ?? 0,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedMap(campaignId: string, isActive: 0 | 1, title = "Tavern") {
  const id = nextId("map");
  await db.insert(campaignMaps).values({
    id,
    campaignId,
    title,
    fileName: `${id}.png`,
    mimeType: "image/png",
    isActive,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedChapter(campaignId: string, position = 1) {
  const id = nextId("chapter");
  await db.insert(storyChapters).values({
    id,
    campaignId,
    title: `Chapter ${position}`,
    position,
    createdAt: Date.now(),
  });
  return id;
}

export async function seedBeat(
  campaignId: string,
  status: "pending" | "current" | "done" = "pending",
  position = 1
) {
  const id = nextId("beat");
  await db.insert(storyBeats).values({
    id,
    campaignId,
    title: `Beat ${position}`,
    status,
    position,
    createdAt: Date.now(),
  });
  return id;
}

/** Server actions read their input as FormData; this is the whole ceremony. */
export function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}
