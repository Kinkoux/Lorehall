"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import {
  db,
  characters,
  characterItems,
  characterAbilities,
  characterSpellSlots,
  campaignMembers,
  worldItems,
  type WorldItemSlot,
} from "@/lib/db";
import {
  MAX_SPELL_LEVEL,
  MIN_SPELL_LEVEL,
  suggestSlots,
  type SlotRow,
} from "@/lib/spell-slots";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { campaignLog } from "@/lib/campaign-log";
import { fmt } from "@/lib/dnd";
import { getT } from "@/lib/locale";
import { deletePortraitFile, putPortraitFile } from "@/lib/storage";
import { readSlotName } from "@/lib/world-items";
import type { FormState } from "@/lib/actions";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Postgres unique_violation — here, `character_items_one_per_slot`: someone
 * else's click filled the slot between this transaction's read and its write.
 * drizzle wraps driver errors, so the SQLSTATE may sit on the error or its cause.
 */
const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

function int(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Server-side length ceiling — the client's maxlength is a suggestion. */
const cap = (s: string, n: number) => s.slice(0, n);

/** Clamp an optional number into range; a blank field stays blank. */
const clampOpt = (n: number | null, min: number, max: number) =>
  n === null ? null : Math.min(Math.max(n, min), max);

/** Owner of the sheet or the campaign's DM may edit it. */
async function canEditSheet(campaignId: string, sheetUserId: string, actorId: string) {
  if (sheetUserId === actorId) {
    const access = await getCampaignAccess(campaignId, actorId);
    return access?.canParticipate ?? false;
  }
  const access = await getCampaignAccess(campaignId, actorId);
  return access?.isDm ?? false;
}

/**
 * Quick-create from /characters: pick a campaign, name the hero, land on the
 * full sheet to fill in the rest. The first character in a campaign is live
 * immediately; additional ones from the same user wait for the DM's approval.
 */
export async function createCharacter(formData: FormData) {
  const user = await requireUser();
  const campaignId = str(formData, "campaignId");
  const name = str(formData, "name");
  if (!campaignId || !name) return;
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canParticipate) return;

  const existing = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.campaignId, campaignId), eq(characters.userId, user.id)));
  const id = nanoid(12);
  // The sheet and the party list's shorthand name are one change.
  await db.transaction(async (tx) => {
    await tx.insert(characters).values({
      id,
      campaignId,
      userId: user.id,
      name: cap(name, 150),
      approval: existing.length === 0 ? "approved" : "pending",
      updatedAt: Date.now(),
    });
    if (existing.length === 0) {
      await tx
        .update(campaignMembers)
        .set({ characterName: cap(name, 150) })
        .where(
          and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, user.id))
        );
    }
  });
  await campaignLog(campaignId, user.id, "characterCreated", { name: cap(name, 150) });
  redirect(`/c/${campaignId}/ch/${user.id}?ch=${id}`);
}

/** DM lets an extra character into the campaign. */
export async function approveCharacter(characterId: string) {
  const user = await requireUser();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character || character.approval !== "pending") return;
  const access = await getCampaignAccess(character.campaignId, user.id);
  if (!access?.isDm) return;
  await db.update(characters).set({ approval: "approved" }).where(eq(characters.id, characterId));
  await campaignLog(character.campaignId, user.id, "characterApproved", { name: character.name });
  revalidatePath(`/c/${character.campaignId}`);
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
  revalidatePath("/characters");
}

/** DM turns an extra character away — the sheet is removed entirely. */
export async function rejectCharacter(characterId: string) {
  const user = await requireUser();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character || character.approval !== "pending") return;
  const access = await getCampaignAccess(character.campaignId, user.id);
  if (!access?.isDm) return;
  // All four deletes or none: a half-removed sheet leaves items, abilities and
  // spell slots referencing a character row that is gone — and the foreign
  // keys would refuse the last delete anyway.
  await db.transaction(async (tx) => {
    await tx.delete(characterItems).where(eq(characterItems.characterId, characterId));
    await tx.delete(characterAbilities).where(eq(characterAbilities.characterId, characterId));
    await tx
      .delete(characterSpellSlots)
      .where(eq(characterSpellSlots.characterId, characterId));
    await tx.delete(characters).where(eq(characters.id, characterId));
  });
  await campaignLog(character.campaignId, user.id, "characterRejected", { name: character.name });
  revalidatePath(`/c/${character.campaignId}`);
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
  revalidatePath("/characters");
}

/** Only the campaign's DM decides who is dead — the mark shows everywhere. */
export async function setCharacterStatus(characterId: string, status: "alive" | "dead") {
  const user = await requireUser();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) return;
  const access = await getCampaignAccess(character.campaignId, user.id);
  if (!access?.isDm) return;
  await db.update(characters).set({ status }).where(eq(characters.id, characterId));
  await campaignLog(character.campaignId, user.id, "statusChanged", {
    character: character.name,
    status,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
  revalidatePath(`/c/${character.campaignId}`);
  revalidatePath("/characters");
}

export async function upsertCharacter(
  campaignId: string,
  sheetUserId: string,
  formData: FormData
) {
  const user = await requireUser();
  if (!(await canEditSheet(campaignId, sheetUserId, user.id))) return;

  const name = str(formData, "name");
  if (!name) return;
  const characterId = str(formData, "characterId");
  const score = (key: string) => {
    const n = int(formData, key);
    return n === null ? null : Math.min(Math.max(n, 1), 30);
  };
  const checkboxList = (key: string) =>
    formData
      .getAll(key)
      .filter((v): v is string => typeof v === "string")
      .join(",") || null;
  const values = {
    name: cap(name, 150),
    klass: cap(str(formData, "klass"), 80) || null,
    race: cap(str(formData, "race"), 80) || null,
    level: Math.min(Math.max(int(formData, "level") ?? 1, 1), 30),
    maxHp: clampOpt(int(formData, "maxHp"), 0, 9999),
    armorClass: clampOpt(int(formData, "armorClass"), 0, 40),
    str: score("str"),
    dex: score("dex"),
    con: score("con"),
    intel: score("intel"),
    wis: score("wis"),
    cha: score("cha"),
    profSkills: checkboxList("profSkills"),
    profSaves: checkboxList("profSaves"),
    notes: cap(str(formData, "notes"), 20_000) || null,
    updatedAt: Date.now(),
  };

  // With multiple characters per user, the edit form names its target; the
  // create flow (no characterId) only exists while the user has no sheet.
  const existing = characterId
    ? await db.query.characters.findFirst({
        where: and(
          eq(characters.id, characterId),
          eq(characters.campaignId, campaignId),
          eq(characters.userId, sheetUserId)
        ),
      })
    : await db.query.characters.findFirst({
        where: and(eq(characters.campaignId, campaignId), eq(characters.userId, sheetUserId)),
      });
  // characterId comes from the form and is forgeable: when it names a sheet
  // outside this campaign/user the scoped lookup finds nothing, and the
  // request is refused rather than quietly creating a fresh sheet.
  if (characterId && !existing) return;

  // First sheet in the campaign goes live; any extra waits for the DM.
  let approval: "approved" | "pending" = "approved";
  if (!existing) {
    const mine = await db
      .select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.campaignId, campaignId), eq(characters.userId, sheetUserId)));
    approval = mine.length === 0 ? "approved" : "pending";
  }

  // The sheet and the party list's shorthand name move together.
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(characters).set(values).where(eq(characters.id, existing.id));
    } else {
      await tx.insert(characters).values({
        id: nanoid(12),
        campaignId,
        userId: sheetUserId,
        ...values,
        approval,
      });
    }
    await tx
      .update(campaignMembers)
      .set({ characterName: values.name })
      .where(
        and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, sheetUserId))
      );
  });
  // A save on someone else's sheet is a DM write — the feed says so out loud.
  const byDm = sheetUserId !== user.id;
  await campaignLog(campaignId, user.id, byDm ? "sheetSavedByDm" : "sheetSaved", {
    character: values.name,
    dm: byDm ? 1 : 0,
  });
  revalidatePath(`/c/${campaignId}/ch/${sheetUserId}`);
  revalidatePath(`/c/${campaignId}`);
}

async function getEditableCharacter(characterId: string, actorId: string) {
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) return null;
  if (!(await canEditSheet(character.campaignId, character.userId, actorId))) return null;
  return character;
}

// ---------- portrait ----------

const PORTRAIT_MAX_BYTES = 4 * 1024 * 1024;
const PORTRAIT_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** The portrait shows on the sheet, the party list, the hub and initiative. */
function revalidatePortraitPages(campaignId: string, userId: string) {
  revalidatePath(`/c/${campaignId}/ch/${userId}`);
  revalidatePath(`/c/${campaignId}`);
  revalidatePath("/characters");
}

/**
 * Owner or DM uploads a face for the character. The stored name is a one-shot
 * nanoid, so /files/portraits can serve it immutable; the previous file is
 * dropped only once the new one is safely stored.
 */
export async function uploadPortrait(
  characterId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const character = await getEditableCharacter(characterId, user.id);
  // A missing sheet and a forbidden one answer the same — the id is forgeable.
  if (!character) return { error: t("errors.portrait.notAllowed") };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: t("errors.portrait.noFile") };
  if (file.size > PORTRAIT_MAX_BYTES) return { error: t("errors.portrait.tooLarge") };
  const ext = PORTRAIT_EXT_BY_MIME[file.type];
  if (!ext) return { error: t("errors.portrait.badType") };

  const fileName = `${nanoid(16)}.${ext}`;
  await putPortraitFile(fileName, new Uint8Array(await file.arrayBuffer()), file.type);
  try {
    await db
      .update(characters)
      .set({ imageFile: fileName, imageMime: file.type })
      .where(eq(characters.id, characterId));
  } catch (e) {
    // Storage cannot join the transaction: with no row naming it, the freshly
    // uploaded object is unreachable, so drop it and report the real error.
    await deletePortraitFile(fileName).catch((err) =>
      console.error("uploadPortrait: orphan cleanup failed", err)
    );
    throw e;
  }
  if (character.imageFile) {
    await deletePortraitFile(character.imageFile).catch((e) =>
      console.error("uploadPortrait: old file delete failed", e)
    );
  }
  await campaignLog(character.campaignId, user.id, "portraitChanged", {
    character: character.name,
  });
  revalidatePortraitPages(character.campaignId, character.userId);
  return {};
}

export async function removePortrait(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character?.imageFile) return;
  await db
    .update(characters)
    .set({ imageFile: null, imageMime: null })
    .where(eq(characters.id, characterId));
  // Row first: a leftover object is cheaper than a sheet naming a missing file.
  await deletePortraitFile(character.imageFile).catch((e) =>
    console.error("removePortrait: file delete failed", e)
  );
  await campaignLog(character.campaignId, user.id, "portraitRemoved", {
    character: character.name,
  });
  revalidatePortraitPages(character.campaignId, character.userId);
}

// ---------- inventory ----------

/**
 * What an inventory line is, beyond its name: the source it was picked from
 * (if any), where it can be worn, and what it grants. The autocomplete on the
 * sheet sends a reference, never the numbers — the slot and the bonuses are
 * re-derived here from the library row or the SRD entry the reference names,
 * so a forged field buys nothing a player could not already type into the
 * sheet form by hand.
 */
type ItemSource = {
  worldItemId: string | null;
  srdIndex: string | null;
  slot: WorldItemSlot | null;
  statBonuses: string | null;
  /** Only used when the add form left the notes blank. */
  summary: string | null;
};

async function resolveItemSource(
  formData: FormData,
  campaignId: string,
  actorId: string
): Promise<ItemSource> {
  const blank: ItemSource = {
    worldItemId: null,
    srdIndex: null,
    slot: readSlotName(str(formData, "slot")),
    statBonuses: null,
    summary: null,
  };

  // A library entry wins: it is the only source that carries real bonuses.
  const worldItemId = str(formData, "worldItemId");
  if (worldItemId) {
    const [access, item] = await Promise.all([
      getCampaignAccess(campaignId, actorId),
      db.query.worldItems.findFirst({ where: eq(worldItems.id, worldItemId) }),
    ]);
    // The id is forgeable, and a library belongs to exactly one world: a table
    // running elsewhere cannot draw from it however the ids were paired up.
    if (access && item && item.worldId === access.world.id) {
      return {
        worldItemId: item.id,
        srdIndex: null,
        slot: item.slot,
        statBonuses: item.statBonuses,
        summary: item.description,
      };
    }
    return blank;
  }

  const srdIndex = str(formData, "srdIndex");
  if (srdIndex) {
    // Lazy import keeps the SRD JSON out of the sheet's chunk. Nothing in the
    // SRD carries a machine-readable bonus, so an SRD line brings a slot and a
    // summary and nothing else.
    const { getItem, itemSummary, srdItemSlot } = await import("@/lib/srd-data");
    const item = getItem(srdIndex);
    if (item) {
      return {
        worldItemId: null,
        srdIndex: item.index,
        slot: srdItemSlot(item),
        statBonuses: null,
        summary: itemSummary(item),
      };
    }
  }
  return blank;
}

export async function addItem(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const name = str(formData, "name");
  if (!name) return;
  const itemName = cap(name, 150);
  const qty = Math.min(Math.max(int(formData, "qty") ?? 1, 1), 9999);
  const source = await resolveItemSource(formData, character.campaignId, user.id);
  await db.insert(characterItems).values({
    id: nanoid(12),
    characterId,
    name: itemName,
    qty,
    // A line the player annotated keeps their words; one they left blank
    // borrows the source's own summary rather than showing nothing.
    notes: cap(str(formData, "notes"), 2_000) || cap(source.summary ?? "", 2_000) || null,
    worldItemId: source.worldItemId,
    srdIndex: source.srdIndex,
    slot: source.slot,
    statBonuses: source.statBonuses,
    createdAt: Date.now(),
  });
  await campaignLog(character.campaignId, user.id, "itemAdded", {
    name: itemName,
    n: qty,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

/**
 * Put a piece on.
 *
 * Where it goes is decided by whatever knows best. A line that came from the
 * compendium or the library is placed by its source: a breastplate is body
 * armour, a shield is held, a sword is swung, and no slot the form names can
 * move them — a request that asks otherwise is refused outright rather than
 * quietly corrected, the same silent refusal every other bad input to this
 * action gets. Only a hand-typed line, which no source ever spoke for, takes
 * the slot from the form: "Grandfather's Signet" is a ring because someone
 * said so, and it could as easily have been an amulet.
 *
 * The source also outranks the row's own stored slot, which heals lines
 * stocked before this rule existed (and the ones a backfill has since given a
 * reference to) the first time they are worn.
 *
 * Both halves are one write: whatever occupied the slot comes off in the same
 * transaction the new piece goes on in, so the sheet is never briefly wearing
 * two helms, and never briefly wearing none. `character_items_one_per_slot`
 * backs that up for two clicks that arrive at once — the loser gets SQLSTATE
 * 23505 and is dropped, because the slot did end up filled either way.
 */
export async function equipItem(itemId: string, formData: FormData) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;

  // Lazy import keeps the SRD JSON out of the sheet's chunk, as everywhere
  // else this module reaches for it.
  const { requiredSlot } = await import("@/lib/srd-data");
  const source = item.worldItemId
    ? await db.query.worldItems.findFirst({ where: eq(worldItems.id, item.worldItemId) })
    : null;
  const required = requiredSlot(item.srdIndex, source);
  const asked = readSlotName(str(formData, "slot"));
  if (required && asked && asked !== required) return;

  const slot = required ?? item.slot ?? asked;
  if (!slot) return;
  if (item.equipped === 1 && item.slot === slot) return;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(characterItems)
        .set({ equipped: 0 })
        .where(
          and(
            eq(characterItems.characterId, item.characterId),
            eq(characterItems.slot, slot),
            eq(characterItems.equipped, 1)
          )
        );
      await tx
        .update(characterItems)
        .set({ slot, equipped: 1 })
        .where(eq(characterItems.id, itemId));
    });
  } catch (e) {
    if (isUniqueViolation(e)) return;
    throw e;
  }
  await campaignLog(character.campaignId, user.id, "itemEquipped", {
    name: item.name,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

/** Take it off. The slot stays on the row — it is still a helm, just not worn. */
export async function unequipItem(itemId: string) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item || item.equipped === 0) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;
  await db.update(characterItems).set({ equipped: 0 }).where(eq(characterItems.id, itemId));
  await campaignLog(character.campaignId, user.id, "itemUnequipped", {
    name: item.name,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

export async function adjustItemQty(itemId: string, delta: number) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;

  // The pile is counted in the database, so two hands reaching for it at once
  // both count. The new total decides whether the row survives, and the
  // decrement and the delete are one write.
  const qty = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(characterItems)
      .set({ qty: sql`LEAST(9999, ${characterItems.qty} + ${delta})` })
      .where(eq(characterItems.id, itemId))
      .returning({ qty: characterItems.qty });
    if (!row) return null;
    // The last one off the pile is a removal, not a quantity tweak.
    if (row.qty <= 0) await tx.delete(characterItems).where(eq(characterItems.id, itemId));
    return row.qty;
  });
  if (qty === null) return;

  await campaignLog(
    character.campaignId,
    user.id,
    qty <= 0 ? "itemRemoved" : "itemQty",
    qty <= 0
      ? { name: item.name, character: character.name }
      : { name: item.name, d: fmt(delta), n: qty, character: character.name }
  );
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

export async function deleteItem(itemId: string) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;
  await db.delete(characterItems).where(eq(characterItems.id, itemId));
  await campaignLog(character.campaignId, user.id, "itemRemoved", {
    name: item.name,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

// ---------- spells & abilities ----------

export async function addAbility(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const name = str(formData, "name");
  if (!name) return;
  const kindRaw = str(formData, "kind");
  let kind: "spell" | "ability" | "trait" =
    kindRaw === "spell" || kindRaw === "trait" ? kindRaw : "ability";
  const usesMax = int(formData, "usesMax");
  const abilityName = cap(name, 150);

  // A line picked from the compendium keeps the index, so the sheet can link
  // back to the full text instead of reprinting it. There is no homebrew spell
  // library to reference — the SRD is the only source a spell can name.
  let srdIndex: string | null = null;
  let summary: string | null = null;
  const pickedIndex = str(formData, "srdIndex");
  if (pickedIndex) {
    const { getSpell, spellSummary } = await import("@/lib/srd-data");
    const spell = getSpell(pickedIndex);
    if (spell) {
      srdIndex = spell.index;
      summary = spellSummary(spell);
      // Whatever the dropdown said, a spell from the spell list is a spell.
      kind = "spell";
    }
  }

  await db.insert(characterAbilities).values({
    id: nanoid(12),
    characterId,
    name: abilityName,
    kind,
    notes: cap(str(formData, "notes"), 2_000) || cap(summary ?? "", 2_000) || null,
    usesMax,
    usesLeft: usesMax,
    srdIndex,
    createdAt: Date.now(),
  });
  await campaignLog(character.campaignId, user.id, "abilityAdded", {
    name: abilityName,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

/** Spend one use (e.g. cast a spell slot); floor at zero. */
export async function useAbility(abilityId: string) {
  const user = await requireUser();
  const ability = await db.query.characterAbilities.findFirst({
    where: eq(characterAbilities.id, abilityId),
  });
  if (!ability || ability.usesLeft === null) return;
  const character = await getEditableCharacter(ability.characterId, user.id);
  if (!character) return;
  // Counted down in place: two casts in the same instant spend two slots.
  // The IS NOT NULL guard keeps an unlimited ability from being given a
  // count by a spend that raced the read above.
  await db
    .update(characterAbilities)
    .set({ usesLeft: sql`GREATEST(0, ${characterAbilities.usesLeft} - 1)` })
    .where(
      and(eq(characterAbilities.id, abilityId), isNotNull(characterAbilities.usesLeft))
    );
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

/** Long rest: refill all limited-use abilities and every spent spell slot. */
export async function longRest(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  // One statement refills every limited-use ability on the sheet, a second
  // unseals every spell slot, and the two are one write: a rest that restored
  // the abilities but not the slots is not a rest anyone would recognise.
  // The rows the first statement touched are the ones the feed counts — the
  // slots ride along inside the same "long rest" entry rather than adding a
  // second line to the feed for the same click.
  const refilled = await db.transaction(async (tx) => {
    const rows = await tx
      .update(characterAbilities)
      .set({ usesLeft: sql`${characterAbilities.usesMax}` })
      .where(
        and(
          eq(characterAbilities.characterId, characterId),
          isNotNull(characterAbilities.usesMax)
        )
      )
      .returning({ id: characterAbilities.id });
    await tx
      .update(characterSpellSlots)
      .set({ used: 0 })
      .where(eq(characterSpellSlots.characterId, characterId));
    return rows;
  });
  await campaignLog(character.campaignId, user.id, "longRest", {
    character: character.name,
    n: refilled.length,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

export async function deleteAbility(abilityId: string) {
  const user = await requireUser();
  const ability = await db.query.characterAbilities.findFirst({
    where: eq(characterAbilities.id, abilityId),
  });
  if (!ability) return;
  const character = await getEditableCharacter(ability.characterId, user.id);
  if (!character) return;
  await db.delete(characterAbilities).where(eq(characterAbilities.id, abilityId));
  await campaignLog(character.campaignId, user.id, "abilityRemoved", {
    name: ability.name,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

// ---------- spell slots ----------

/**
 * Write a whole slot table in one go: the levels named are inserted or
 * retuned, and every level *not* named is dropped — the table on screen is
 * exactly the rows that come back.
 *
 * Spent slots survive a retune, which is the only behaviour that makes sense
 * mid-session: a wizard who has already burned two of four level-1 slots and
 * then fixes a typo in the table has still burned them. Lowering the total
 * below what is spent pulls `used` down with it (LEAST), so the row can never
 * read "3/2".
 */
async function writeSlotRows(characterId: string, rows: SlotRow[]) {
  await db.transaction(async (tx) => {
    const levels = rows.map((row) => row.level);
    await tx
      .delete(characterSpellSlots)
      .where(
        levels.length === 0
          ? eq(characterSpellSlots.characterId, characterId)
          : and(
              eq(characterSpellSlots.characterId, characterId),
              notInArray(characterSpellSlots.level, levels)
            )
      );
    for (const row of rows) {
      await tx
        .insert(characterSpellSlots)
        .values({ characterId, level: row.level, total: row.total, used: 0 })
        .onConflictDoUpdate({
          target: [characterSpellSlots.characterId, characterSpellSlots.level],
          set: {
            total: row.total,
            used: sql`LEAST(${characterSpellSlots.used}, ${row.total})`,
          },
        });
    }
  });
}

/**
 * The sheet's own slot table, nine numbers wide. A level left blank or set to
 * zero has no slots and loses its row; anything above nine is a typo, not a
 * character (the SRD stops at nine of a level, and so does the tracker).
 */
export async function setSpellSlots(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;

  const rows: SlotRow[] = [];
  for (let level = MIN_SPELL_LEVEL; level <= MAX_SPELL_LEVEL; level += 1) {
    const total = clampOpt(int(formData, `level${level}`), 0, 9) ?? 0;
    if (total > 0) rows.push({ level, total });
  }
  await writeSlotRows(characterId, rows);
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

/**
 * Fill the table in from the class the sheet already names — the button that
 * saves a level 9 cleric from typing "4 3 3 3 1" by hand.
 *
 * It overwrites the totals on purpose: "suggest" here means "give me the
 * book's answer", and a player who wanted their own numbers has the form right
 * above it. Spent slots are still spent afterwards (writeSlotRows keeps
 * `used`), so pressing it mid-session does not hand anyone free casts. A class
 * the tables do not speak for — a barbarian, a homebrew name — writes nothing
 * at all rather than clearing what is there.
 */
export async function suggestFromClass(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const rows = suggestSlots(character.klass, character.level);
  if (!rows || rows.length === 0) return;
  await writeSlotRows(characterId, rows);
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

/** Neither end of the counter takes a level the table could not hold. */
const isSpellLevel = (level: number) =>
  Number.isInteger(level) && level >= MIN_SPELL_LEVEL && level <= MAX_SPELL_LEVEL;

/**
 * Burn a slot. Counted in the database like every other resource on the sheet,
 * so two casts in the same instant spend two slots rather than one; the LEAST
 * keeps a race from spending a slot the character does not have.
 */
export async function spendSpellSlot(characterId: string, level: number) {
  const user = await requireUser();
  if (!isSpellLevel(level)) return;
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  await db
    .update(characterSpellSlots)
    .set({
      used: sql`LEAST(${characterSpellSlots.total}, ${characterSpellSlots.used} + 1)`,
    })
    .where(
      and(
        eq(characterSpellSlots.characterId, characterId),
        eq(characterSpellSlots.level, level)
      )
    );
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

/** Misclicked. The same counter, the other way, floored at zero. */
export async function restoreSpellSlot(characterId: string, level: number) {
  const user = await requireUser();
  if (!isSpellLevel(level)) return;
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  await db
    .update(characterSpellSlots)
    .set({ used: sql`GREATEST(0, ${characterSpellSlots.used} - 1)` })
    .where(
      and(
        eq(characterSpellSlots.characterId, characterId),
        eq(characterSpellSlots.level, level)
      )
    );
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}
