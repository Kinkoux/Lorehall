"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  db,
  characters,
  characterItems,
  worldItems,
  WORLD_ITEM_CATEGORIES,
  WORLD_ITEM_SLOTS,
  WORLD_ITEM_STATS,
  type WorldItemCategory,
  type WorldItemSlot,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess, hasDmPowers } from "@/lib/perms";
import { campaignLog } from "@/lib/campaign-log";
import { getT } from "@/lib/locale";
import { deleteItemFile, putItemFile } from "@/lib/storage";
import { STAT_BONUS_MAX, STAT_BONUS_MIN, type StatBonuses } from "@/lib/world-items";
import type { T } from "@/lib/i18n";
import type { FormState } from "@/lib/actions";

/**
 * The DM's item library for one world (docs/design-economy.md phase 2). Every
 * write here gates on `hasDmPowers`: the world's owner, or anyone running a
 * campaign inside it. Players only ever read the library.
 */

const NAME_MAX = 120;
const DESC_MAX = 2_000;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Postgres unique_violation — here, a name already taken in this world. */
const isUniqueViolation = (e: unknown) => {
  // drizzle wraps driver errors; the SQLSTATE may sit on the error or its cause.
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Server-side length ceiling — the client's maxlength is a suggestion. */
const cap = (s: string, n: number) => s.slice(0, n);

function readCategory(formData: FormData): WorldItemCategory {
  const raw = str(formData, "category");
  return (WORLD_ITEM_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as WorldItemCategory)
    : "gear";
}

/** Blank (and anything unrecognised) means "carried, not worn". */
function readSlot(formData: FormData): WorldItemSlot | null {
  const raw = str(formData, "slot");
  return (WORLD_ITEM_SLOTS as readonly string[]).includes(raw) ? (raw as WorldItemSlot) : null;
}

/**
 * The bonus fields, rebuilt from scratch: only the eight allowed keys are
 * read, each clamped to ±10, and a blank or zero field is left out entirely.
 * Nothing the form sends reaches the column verbatim, so the JSON in the
 * database is always something phase 3 can fold into a statblock.
 */
function readStatBonuses(formData: FormData): string | null {
  const bonuses: StatBonuses = {};
  for (const stat of WORLD_ITEM_STATS) {
    const raw = str(formData, `bonus_${stat}`);
    if (!raw) continue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n === 0) continue;
    bonuses[stat] = Math.min(Math.max(n, STAT_BONUS_MIN), STAT_BONUS_MAX);
  }
  return Object.keys(bonuses).length > 0 ? JSON.stringify(bonuses) : null;
}

type Upload = { fileName: string; mime: string };

/**
 * The optional illustration. A null upload means the field was left empty —
 * "leave the picture alone" — which is not an error; only a file this app
 * refuses to serve is. The key is minted here (never taken from the browser)
 * so /files/items can serve it immutable.
 */
async function storeImage(
  formData: FormData,
  t: T
): Promise<{ upload: Upload | null; error?: string }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { upload: null };
  if (file.size > IMAGE_MAX_BYTES) return { upload: null, error: t("errors.worldItems.tooLarge") };
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return { upload: null, error: t("errors.worldItems.badType") };
  const fileName = `${nanoid(16)}.${ext}`;
  await putItemFile(fileName, new Uint8Array(await file.arrayBuffer()), file.type);
  return { upload: { fileName, mime: file.type } };
}

/** Storage cannot join a transaction, so an orphan is swept up by hand. */
async function dropUpload(upload: Upload | null, where: string) {
  if (!upload) return;
  await deleteItemFile(upload.fileName).catch((e) =>
    console.error(`${where}: orphan cleanup failed`, e)
  );
}

export async function createWorldItem(
  worldId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  if (!(await hasDmPowers(worldId, user.id))) return { error: t("errors.worldItems.dmOnly") };

  const name = cap(str(formData, "name"), NAME_MAX);
  if (!name) return { error: t("errors.worldItems.nameRequired") };

  const stored = await storeImage(formData, t);
  if (stored.error) return { error: stored.error };
  const upload = stored.upload;

  try {
    await db.insert(worldItems).values({
      id: nanoid(12),
      worldId,
      name,
      description: cap(str(formData, "description"), DESC_MAX) || null,
      category: readCategory(formData),
      slot: readSlot(formData),
      statBonuses: readStatBonuses(formData),
      imageFile: upload?.fileName ?? null,
      imageMime: upload?.mime ?? null,
      createdBy: user.id,
      createdAt: Date.now(),
    });
  } catch (e) {
    // No row will name the object, so it is unreachable either way.
    await dropUpload(upload, "createWorldItem");
    if (isUniqueViolation(e)) return { error: t("errors.worldItems.duplicateName") };
    throw e;
  }
  revalidatePath(`/w/${worldId}`);
  return {};
}

export async function updateWorldItem(
  itemId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const item = await db.query.worldItems.findFirst({ where: eq(worldItems.id, itemId) });
  // A missing item and a forbidden one answer the same — the id is forgeable.
  if (!item || !(await hasDmPowers(item.worldId, user.id))) {
    return { error: t("errors.worldItems.notAllowed") };
  }

  const name = cap(str(formData, "name"), NAME_MAX);
  if (!name) return { error: t("errors.worldItems.nameRequired") };

  const stored = await storeImage(formData, t);
  if (stored.error) return { error: stored.error };
  const upload = stored.upload;

  try {
    await db
      .update(worldItems)
      .set({
        name,
        description: cap(str(formData, "description"), DESC_MAX) || null,
        category: readCategory(formData),
        slot: readSlot(formData),
        statBonuses: readStatBonuses(formData),
        // An empty file field leaves the current picture in place.
        ...(upload ? { imageFile: upload.fileName, imageMime: upload.mime } : {}),
      })
      .where(eq(worldItems.id, itemId));
  } catch (e) {
    await dropUpload(upload, "updateWorldItem");
    if (isUniqueViolation(e)) return { error: t("errors.worldItems.duplicateName") };
    throw e;
  }
  // Only once the replacement is safely recorded does the old one go.
  if (upload && item.imageFile) {
    await deleteItemFile(item.imageFile).catch((e) =>
      console.error("updateWorldItem: old file delete failed", e)
    );
  }
  revalidatePath(`/w/${item.worldId}`);
  return {};
}

/**
 * Retire a library entry. Sheets that were stocked from it keep the item —
 * only the back-reference is cleared, in the same write as the delete, so no
 * inventory row is ever left pointing at a missing library entry.
 */
export async function deleteWorldItem(itemId: string) {
  const user = await requireUser();
  const item = await db.query.worldItems.findFirst({ where: eq(worldItems.id, itemId) });
  if (!item) return;
  if (!(await hasDmPowers(item.worldId, user.id))) return;

  await db.transaction(async (tx) => {
    await tx
      .update(characterItems)
      .set({ worldItemId: null })
      .where(eq(characterItems.worldItemId, itemId));
    await tx.delete(worldItems).where(eq(worldItems.id, itemId));
  });
  // Row first, then the object: a leftover file is the cheaper failure.
  if (item.imageFile) {
    await deleteItemFile(item.imageFile).catch((e) =>
      console.error("deleteWorldItem: file delete failed", e)
    );
  }
  revalidatePath(`/w/${item.worldId}`);
}

/**
 * Stamp a library entry into a character's inventory — the world-item twin of
 * the compendium's "add to my sheet". Name and description are copied onto the
 * row so the sheet reads on its own; the reference is what phase 3 will follow
 * back for slot and bonuses.
 */
export async function addWorldItemToCharacter(itemId: string, formData: FormData) {
  const user = await requireUser();
  const item = await db.query.worldItems.findFirst({ where: eq(worldItems.id, itemId) });
  if (!item) return;

  const characterId = str(formData, "characterId");
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character || character.approval !== "approved") return;

  const access = await getCampaignAccess(character.campaignId, user.id);
  if (!access) return;
  // The library belongs to one world; a table running in another world cannot
  // draw from it, however the ids were paired up in the form.
  if (access.world.id !== item.worldId) return;
  // Mine (and I actually sit at this table), or one in a campaign I run.
  const mine = character.userId === user.id && access.canParticipate;
  if (!mine && !access.isDm) return;

  const rawQty = Number.parseInt(str(formData, "qty"), 10);
  const qty = Math.min(Math.max(Number.isFinite(rawQty) ? rawQty : 1, 1), 999);
  await db.insert(characterItems).values({
    id: nanoid(12),
    characterId,
    name: item.name,
    qty,
    notes: item.description,
    worldItemId: item.id,
    createdAt: Date.now(),
  });
  await campaignLog(character.campaignId, user.id, "worldItemAdded", {
    name: item.name,
    n: qty,
    character: character.name,
  });
  revalidatePath(`/c/${character.campaignId}/ch/${character.userId}`);
}
