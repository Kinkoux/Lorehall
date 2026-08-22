import type { WorldItemSlot } from "@/lib/db/schema";
import { categoryArt } from "@/lib/ui-art";

/**
 * What picture stands for a thing on the sheet.
 *
 * Three sources, narrowing: a library entry can carry an actual photograph of
 * the piece; an SRD line has a plate of the item itself, or failing that of its
 * kind; and everything else falls back to the plate for its category, which
 * says only "a weapon" or "a thing in a backpack". The priority is spelled here
 * once so the paper doll and the inventory grid cannot drift apart on it.
 *
 * Kept out of lib/ui-art.ts on purpose — that module is import-free so client
 * bundles can reach for a plate without dragging anything else along. `plate`
 * arrives already chosen for the same reason: picking it means reading the
 * compendium's manifest, and that JSON stays on the server.
 */
export type ItemArt = {
  /** `/files/items/<id>?v=…`, when the library entry has an upload. */
  photo: string | null;
  /** The SRD plate for this exact line, resolved by getItemArt() upstream. */
  plate: string | null;
  /** One of WORLD_ITEM_CATEGORIES — from the SRD entry or the library entry. */
  category: string | null;
};

/**
 * What a slot says about what it is holding, when the piece itself never said.
 * Only the three slots that can hold one kind of thing get to guess: the
 * weapon slot holds a weapon, the armour slot holds armour, the finger holds
 * something enchanted (nobody wears a plain iron band into a dungeon). A
 * cloak, a pair of boots or a pair of gloves could be anything, so those fall
 * through — to the slot's own mark on the paper doll, and to the "a thing in a
 * backpack" plate in the inventory.
 *
 * One map for both places on purpose: the doll and the grid draw the same
 * items, and had drifted apart on exactly this question.
 */
export const SLOT_CATEGORY: Partial<Record<WorldItemSlot, string>> = {
  weapon: "weapon",
  armor: "armor",
  ring: "magic",
};

/** The above, for a slot that may be NULL (a line that is merely carried). */
export const slotCategory = (slot: WorldItemSlot | null | undefined): string | null =>
  (slot && SLOT_CATEGORY[slot]) ?? null;

/**
 * The image for a line, or null when nothing is known about it. `fallback` is
 * the category a caller can infer from context — the weapon slot holds a
 * weapon — and is only consulted when the line itself named none.
 */
export function itemArtSrc(art: ItemArt, fallback: string | null = null): string | null {
  if (art.photo) return art.photo;
  if (art.plate) return art.plate;
  const category = art.category ?? fallback;
  return category ? categoryArt(category) : null;
}

/**
 * Where a library entry's own picture is served from. The file name rides
 * along as ?v= so a replacement lands on a different (immutable) cache entry.
 */
export function worldItemPhoto(
  worldItemId: string | null | undefined,
  imageFile: string | null | undefined
): string | null {
  return worldItemId && imageFile ? `/files/items/${worldItemId}?v=${imageFile}` : null;
}
