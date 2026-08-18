"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import {
  db,
  characters,
  characterItems,
  characterAbilities,
  campaignMembers,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { campaignLog } from "@/lib/campaign-log";
import { fmt } from "@/lib/dnd";
import { getT } from "@/lib/locale";
import { deletePortraitFile, putPortraitFile } from "@/lib/storage";
import type { FormState } from "@/lib/actions";

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
  // All three deletes or none: a half-removed sheet leaves items and
  // abilities referencing a character row that is gone.
  await db.transaction(async (tx) => {
    await tx.delete(characterItems).where(eq(characterItems.characterId, characterId));
    await tx.delete(characterAbilities).where(eq(characterAbilities.characterId, characterId));
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

export async function addItem(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const name = str(formData, "name");
  if (!name) return;
  const itemName = cap(name, 150);
  const qty = Math.min(Math.max(int(formData, "qty") ?? 1, 1), 9999);
  await db.insert(characterItems).values({
    id: nanoid(12),
    characterId,
    name: itemName,
    qty,
    notes: cap(str(formData, "notes"), 2_000) || null,
    createdAt: Date.now(),
  });
  await campaignLog(character.campaignId, user.id, "itemAdded", {
    name: itemName,
    n: qty,
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
  const kind = kindRaw === "spell" || kindRaw === "trait" ? kindRaw : "ability";
  const usesMax = int(formData, "usesMax");
  const abilityName = cap(name, 150);
  await db.insert(characterAbilities).values({
    id: nanoid(12),
    characterId,
    name: abilityName,
    kind,
    notes: cap(str(formData, "notes"), 2_000) || null,
    usesMax,
    usesLeft: usesMax,
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

/** Long rest: refill all limited-use abilities on the sheet. */
export async function longRest(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  // One statement refills every limited-use ability on the sheet; the rows it
  // touched are the ones the feed counts.
  const refilled = await db
    .update(characterAbilities)
    .set({ usesLeft: sql`${characterAbilities.usesMax}` })
    .where(
      and(
        eq(characterAbilities.characterId, characterId),
        isNotNull(characterAbilities.usesMax)
      )
    )
    .returning({ id: characterAbilities.id });
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
