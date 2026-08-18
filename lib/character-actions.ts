"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
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
    return access?.canView ?? false;
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
  if (!access?.canView) return;

  const existing = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.campaignId, campaignId), eq(characters.userId, user.id)));
  const id = nanoid(12);
  await db.insert(characters).values({
    id,
    campaignId,
    userId: user.id,
    name: cap(name, 150),
    approval: existing.length === 0 ? "approved" : "pending",
    updatedAt: Date.now(),
  });
  if (existing.length === 0) {
    await db
      .update(campaignMembers)
      .set({ characterName: cap(name, 150) })
      .where(
        and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, user.id))
      );
  }
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
  await db.delete(characterItems).where(eq(characterItems.characterId, characterId));
  await db.delete(characterAbilities).where(eq(characterAbilities.characterId, characterId));
  await db.delete(characters).where(eq(characters.id, characterId));
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

  if (existing) {
    await db.update(characters).set(values).where(eq(characters.id, existing.id));
  } else {
    // First sheet in the campaign goes live; any extra waits for the DM.
    const mine = await db
      .select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.campaignId, campaignId), eq(characters.userId, sheetUserId)));
    await db.insert(characters).values({
      id: nanoid(12),
      campaignId,
      userId: sheetUserId,
      ...values,
      approval: mine.length === 0 ? "approved" : "pending",
    });
  }
  // Keep the party list's shorthand name in sync with the sheet.
  await db
    .update(campaignMembers)
    .set({ characterName: values.name })
    .where(
      and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, sheetUserId))
    );
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
  await db
    .update(characters)
    .set({ imageFile: fileName, imageMime: file.type })
    .where(eq(characters.id, characterId));
  if (character.imageFile) await deletePortraitFile(character.imageFile);
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
  await deletePortraitFile(character.imageFile);
  revalidatePortraitPages(character.campaignId, character.userId);
}

// ---------- inventory ----------

export async function addItem(characterId: string, formData: FormData) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const name = str(formData, "name");
  if (!name) return;
  await db.insert(characterItems).values({
    id: nanoid(12),
    characterId,
    name: cap(name, 150),
    qty: Math.min(Math.max(int(formData, "qty") ?? 1, 1), 9999),
    notes: cap(str(formData, "notes"), 2_000) || null,
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

export async function adjustItemQty(itemId: string, delta: number) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;
  const qty = item.qty + delta;
  if (qty <= 0) {
    await db.delete(characterItems).where(eq(characterItems.id, itemId));
  } else {
    await db.update(characterItems).set({ qty: Math.min(qty, 9999) }).where(eq(characterItems.id, itemId));
  }
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

export async function deleteItem(itemId: string) {
  const user = await requireUser();
  const item = await db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });
  if (!item) return;
  const character = await getEditableCharacter(item.characterId, user.id);
  if (!character) return;
  await db.delete(characterItems).where(eq(characterItems.id, itemId));
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
  await db.insert(characterAbilities).values({
    id: nanoid(12),
    characterId,
    name: cap(name, 150),
    kind,
    notes: cap(str(formData, "notes"), 2_000) || null,
    usesMax,
    usesLeft: usesMax,
    createdAt: Date.now(),
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
  await db
    .update(characterAbilities)
    .set({ usesLeft: Math.max(0, ability.usesLeft - 1) })
    .where(eq(characterAbilities.id, abilityId));
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}

/** Long rest: refill all limited-use abilities on the sheet. */
export async function longRest(characterId: string) {
  const user = await requireUser();
  const character = await getEditableCharacter(characterId, user.id);
  if (!character) return;
  const abilities = await db
    .select()
    .from(characterAbilities)
    .where(eq(characterAbilities.characterId, characterId));
  for (const ability of abilities) {
    if (ability.usesMax !== null) {
      await db
        .update(characterAbilities)
        .set({ usesLeft: ability.usesMax })
        .where(eq(characterAbilities.id, ability.id));
    }
  }
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
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}
