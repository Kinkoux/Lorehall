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
 * full sheet to fill in the rest.
 */
export async function createCharacter(formData: FormData) {
  const user = await requireUser();
  const campaignId = str(formData, "campaignId");
  const name = str(formData, "name");
  if (!campaignId || !name) return;
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canView) return;

  const existing = await db.query.characters.findFirst({
    where: and(eq(characters.campaignId, campaignId), eq(characters.userId, user.id)),
  });
  if (!existing) {
    await db.insert(characters).values({
      id: nanoid(12),
      campaignId,
      userId: user.id,
      name,
      updatedAt: Date.now(),
    });
    await db
      .update(campaignMembers)
      .set({ characterName: name })
      .where(
        and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, user.id))
      );
  }
  redirect(`/c/${campaignId}/ch/${user.id}`);
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
    name,
    klass: str(formData, "klass") || null,
    race: str(formData, "race") || null,
    level: Math.min(Math.max(int(formData, "level") ?? 1, 1), 30),
    maxHp: int(formData, "maxHp"),
    armorClass: int(formData, "armorClass"),
    str: score("str"),
    dex: score("dex"),
    con: score("con"),
    intel: score("intel"),
    wis: score("wis"),
    cha: score("cha"),
    profSkills: checkboxList("profSkills"),
    profSaves: checkboxList("profSaves"),
    notes: str(formData, "notes") || null,
    updatedAt: Date.now(),
  };

  const existing = await db.query.characters.findFirst({
    where: and(eq(characters.campaignId, campaignId), eq(characters.userId, sheetUserId)),
  });
  if (existing) {
    await db.update(characters).set(values).where(eq(characters.id, existing.id));
  } else {
    await db.insert(characters).values({
      id: nanoid(12),
      campaignId,
      userId: sheetUserId,
      ...values,
    });
  }
  // Keep the party list's shorthand name in sync with the sheet.
  await db
    .update(campaignMembers)
    .set({ characterName: name })
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
    name,
    qty: Math.min(Math.max(int(formData, "qty") ?? 1, 1), 9999),
    notes: str(formData, "notes") || null,
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
    name,
    kind,
    notes: str(formData, "notes") || null,
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
