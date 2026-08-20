"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  db,
  characters,
  characterAbilities,
  characterItems,
  encounters,
  encounterMonsters,
  combatants,
  gameSessions,
  sessionEvents,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { logMessage } from "@/lib/session-log";
import { campaignLog } from "@/lib/campaign-log";
import { fmt } from "@/lib/dnd";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function int(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Server-side length ceiling — the client's maxlength is a suggestion. */
const cap = (s: string, n: number) => s.slice(0, n);

// ---------- spells → character sheet ----------

export async function addSpellToCharacter(spellIndex: string, characterId: string) {
  const user = await requireUser();
  // Lazy import keeps ~900KB of SRD JSON out of the campaign/session chunks.
  const { getSpell, spellSummary } = await import("@/lib/srd-data");
  const spell = getSpell(spellIndex);
  if (!spell) return;
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character || character.userId !== user.id) return;
  // A sheet still awaiting the DM's nod isn't a place to stock spells.
  if (character.approval !== "approved") return;

  const existing = await db.query.characterAbilities.findFirst({
    where: and(
      eq(characterAbilities.characterId, characterId),
      eq(characterAbilities.name, spell.name)
    ),
  });
  if (existing) return;

  await db.insert(characterAbilities).values({
    id: nanoid(12),
    characterId,
    name: spell.name,
    kind: "spell",
    notes: spellSummary(spell),
    // The sheet links back to the compendium entry rather than reprinting it.
    srdIndex: spell.index,
    createdAt: Date.now(),
  });
  await campaignLog(character.campaignId, user.id, "spellAdded", {
    name: spell.name,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

// ---------- items → character inventory ----------

/** From an item detail page: drop an SRD item into a character's inventory. */
export async function addItemToCharacter(itemIndex: string, formData: FormData) {
  const user = await requireUser();
  // Lazy import keeps the SRD JSON out of the campaign/session chunks.
  const { getItem, itemSummary, srdItemSlot, magicAcBonus } = await import("@/lib/srd-data");
  const item = getItem(itemIndex);
  if (!item) return;
  const characterId = str(formData, "characterId");
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character || character.approval !== "approved") return;
  // Mine, or one in a campaign I run.
  if (character.userId !== user.id) {
    const access = await getCampaignAccess(character.campaignId, user.id);
    if (!access?.isDm) return;
  }

  const qty = Math.min(Math.max(int(formData, "qty") ?? 1, 1), 999);
  const acBonus = magicAcBonus(item);
  await db.insert(characterItems).values({
    id: nanoid(12),
    characterId,
    name: item.name,
    qty,
    notes: itemSummary(item),
    // The index is the link back to this page from the inventory row.
    srdIndex: item.index,
    // The one machine-readable magic bonus the SRD's prose yields; mundane
    // armour math stays derived from the index at read time instead.
    statBonuses: acBonus ? JSON.stringify({ ac: acBonus }) : null,
    slot: srdItemSlot(item),
    createdAt: Date.now(),
  });
  await campaignLog(character.campaignId, user.id, "srdItemAdded", {
    name: item.name,
    n: qty,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

// ---------- encounters ----------

async function requireDmEncounter(encounterId: string, userId: string) {
  const encounter = await db.query.encounters.findFirst({
    where: eq(encounters.id, encounterId),
  });
  if (!encounter) return null;
  const access = await getCampaignAccess(encounter.campaignId, userId);
  return access?.isDm ? encounter : null;
}

export async function createEncounter(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return;
  const name = str(formData, "name");
  if (!name) return;
  await db.insert(encounters).values({
    id: nanoid(12),
    campaignId,
    name: cap(name, 150),
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${campaignId}`);
}

export async function deleteEncounter(encounterId: string) {
  const user = await requireUser();
  const encounter = await requireDmEncounter(encounterId, user.id);
  if (!encounter) return;
  await db.delete(encounterMonsters).where(eq(encounterMonsters.encounterId, encounterId));
  await db.delete(encounters).where(eq(encounters.id, encounterId));
  revalidatePath(`/c/${encounter.campaignId}`);
}

/** From a monster detail page: add an SRD monster to one of my encounters. */
export async function addMonsterToEncounter(monsterIndex: string, formData: FormData) {
  const user = await requireUser();
  const { getMonster } = await import("@/lib/srd-data");
  const monster = getMonster(monsterIndex);
  if (!monster) return;
  const encounterId = str(formData, "encounterId");
  const encounter = await requireDmEncounter(encounterId, user.id);
  if (!encounter) return;

  await db.insert(encounterMonsters).values({
    id: nanoid(12),
    encounterId,
    name: monster.name,
    count: Math.min(Math.max(int(formData, "count") ?? 1, 1), 20),
    maxHp: monster.hp,
    dexMod: monster.dexMod,
    srdIndex: monster.index,
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${encounter.campaignId}`);
}

/** Homebrew row typed straight into the encounter builder. */
export async function addCustomMonsterToEncounter(encounterId: string, formData: FormData) {
  const user = await requireUser();
  const encounter = await requireDmEncounter(encounterId, user.id);
  if (!encounter) return;
  const name = str(formData, "name");
  if (!name) return;
  await db.insert(encounterMonsters).values({
    id: nanoid(12),
    encounterId,
    name: cap(name, 150),
    count: Math.min(Math.max(int(formData, "count") ?? 1, 1), 20),
    maxHp: int(formData, "maxHp"),
    dexMod: Math.min(Math.max(int(formData, "dexMod") ?? 0, -5), 10),
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${encounter.campaignId}`);
}

export async function removeEncounterMonster(rowId: string) {
  const user = await requireUser();
  const row = await db.query.encounterMonsters.findFirst({
    where: eq(encounterMonsters.id, rowId),
  });
  if (!row) return;
  const encounter = await requireDmEncounter(row.encounterId, user.id);
  if (!encounter) return;
  await db.delete(encounterMonsters).where(eq(encounterMonsters.id, rowId));
  revalidatePath(`/c/${encounter.campaignId}`);
}

/**
 * Roll initiative for every monster in the encounter (d20 + DEX mod) and
 * drop them into the live session's order.
 */
export async function deployEncounter(sessionId: string, formData: FormData) {
  const user = await requireUser();
  const session = await db.query.gameSessions.findFirst({
    where: eq(gameSessions.id, sessionId),
  });
  if (!session || session.status !== "live") return;
  const access = await getCampaignAccess(session.campaignId, user.id);
  if (!access?.isDm) return;

  const encounterId = str(formData, "encounterId");
  const encounter = await db.query.encounters.findFirst({
    where: and(eq(encounters.id, encounterId), eq(encounters.campaignId, session.campaignId)),
  });
  if (!encounter) return;

  const rows = await db
    .select()
    .from(encounterMonsters)
    .where(eq(encounterMonsters.encounterId, encounterId))
    .orderBy(asc(encounterMonsters.createdAt));
  if (rows.length === 0) return;

  // Remember whose turn it is so the pointer can follow them after the insert.
  const before = await db
    .select()
    .from(combatants)
    .where(eq(combatants.sessionId, sessionId))
    .orderBy(desc(combatants.initiative), asc(combatants.createdAt));
  const currentId = before[session.turnIndex]?.id ?? null;

  let total = 0;
  await db.transaction(async (tx) => {
    for (const row of rows) {
      for (let i = 1; i <= row.count; i++) {
        const roll = randomInt(1, 21) + row.dexMod;
        await tx.insert(combatants).values({
          id: nanoid(12),
          sessionId,
          name: row.count > 1 ? `${row.name} #${i}` : row.name,
          initiative: roll,
          maxHp: row.maxHp,
          hp: row.maxHp,
          createdAt: Date.now() + total, // preserve insertion order for ties
        });
        total++;
      }
    }
    if (currentId) {
      const after = await tx
        .select()
        .from(combatants)
        .where(eq(combatants.sessionId, sessionId))
        .orderBy(desc(combatants.initiative), asc(combatants.createdAt));
      const newIndex = after.findIndex((c) => c.id === currentId);
      if (newIndex !== -1 && newIndex !== session.turnIndex) {
        await tx
          .update(gameSessions)
          .set({ turnIndex: newIndex })
          .where(eq(gameSessions.id, sessionId));
      }
    }
    await tx.insert(sessionEvents).values({
      id: nanoid(12),
      sessionId,
      userId: user.id,
      kind: "system",
      message: logMessage("encounterDeployed", { name: encounter.name, n: total }),
      createdAt: Date.now(),
    });
  });
  revalidatePath(`/s/${sessionId}`);
}

/** From a monster detail page: throw it straight into a live session I'm running. */
export async function addMonsterToLiveSession(monsterIndex: string, formData: FormData) {
  const user = await requireUser();
  const { getMonster } = await import("@/lib/srd-data");
  const monster = getMonster(monsterIndex);
  if (!monster) return;
  const sessionId = str(formData, "sessionId");
  const session = await db.query.gameSessions.findFirst({
    where: eq(gameSessions.id, sessionId),
  });
  if (!session || session.status !== "live") return;
  const access = await getCampaignAccess(session.campaignId, user.id);
  if (!access?.isDm) return;

  const roll = randomInt(1, 21) + monster.dexMod;
  await db.insert(combatants).values({
    id: nanoid(12),
    sessionId,
    name: monster.name,
    initiative: roll,
    maxHp: monster.hp,
    hp: monster.hp,
    createdAt: Date.now(),
  });
  await db.insert(sessionEvents).values({
    id: nanoid(12),
    sessionId,
    userId: user.id,
    kind: "system",
    message: logMessage("monsterJoins", { name: monster.name, roll, mod: fmt(monster.dexMod) }),
    createdAt: Date.now(),
  });
  revalidatePath(`/s/${sessionId}`);
}
