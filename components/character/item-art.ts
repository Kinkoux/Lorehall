import { categoryArt } from "@/lib/ui-art";

/**
 * What picture stands for a thing on the sheet.
 *
 * Two sources, in order: a library entry can carry an actual photograph of the
 * piece, and everything else falls back to the engraved plate for its category.
 * The priority is spelled here once so the paper doll and the inventory grid
 * cannot drift apart on it.
 *
 * Kept out of lib/ui-art.ts on purpose — that module is import-free so client
 * bundles can reach for a plate without dragging anything else along.
 */
export type ItemArt = {
  /** `/files/items/<id>?v=…`, when the library entry has an upload. */
  photo: string | null;
  /** One of WORLD_ITEM_CATEGORIES — from the SRD entry or the library entry. */
  category: string | null;
};

/**
 * The image for a line, or null when nothing is known about it. `fallback` is
 * the category a caller can infer from context — the weapon slot holds a
 * weapon — and is only consulted when the line itself named none.
 */
export function itemArtSrc(art: ItemArt, fallback: string | null = null): string | null {
  if (art.photo) return art.photo;
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
