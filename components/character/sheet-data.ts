import { asc, eq } from "drizzle-orm";
import {
  db,
  characterAbilities,
  characterItems,
  characterSpellSlots,
  worldItems,
  type CharacterItem,
  type WorldItemSlot,
} from "@/lib/db";
import { getItem, getItemArt, requiredSlot } from "@/lib/srd-data";
import { worldItemPhoto } from "@/components/character/item-art";

/**
 * An inventory row as the sheet reads it: the stored line plus what the join
 * answered — what it grants (its own snapshot, or its source's), which world
 * the library entry lives in for the link back, and the three things the
 * square needs to draw itself.
 */
export type InventoryLineShape = CharacterItem & {
  bonuses: string | null;
  sourceWorldId: string | null;
  photo: string | null;
  plate: string | null;
  category: string | null;
  /** Where its source insists it is worn, or null when nothing insists. */
  requiredSlot: WorldItemSlot | null;
  /** The library entry's own prose, for the hover preview on its link. */
  sourceDescription: string | null;
};

/**
 * Everything one sheet is made of, below the character row itself.
 *
 * Two routes draw the same sheet now — the one at a table and the one on a
 * player's roster — and they ask the database exactly the same three questions
 * to do it. Asking them in one place is what keeps the roster from quietly
 * drifting into a sheet that shows a different backpack than the campaign's.
 * The character row stays the caller's business: each route reaches it by its
 * own path, and each has its own idea of who may look.
 */
export async function loadSheetRows(characterId: string) {
  // The library entry rides along so a line can still show its bonuses (and
  // link home) when it was stocked before the snapshot columns existed.
  const [itemRows, abilities, spellSlots] = await Promise.all([
    db
      .select({ item: characterItems, source: worldItems })
      .from(characterItems)
      .leftJoin(worldItems, eq(characterItems.worldItemId, worldItems.id))
      .where(eq(characterItems.characterId, characterId))
      .orderBy(asc(characterItems.createdAt)),
    db
      .select()
      .from(characterAbilities)
      .where(eq(characterAbilities.characterId, characterId))
      .orderBy(asc(characterAbilities.createdAt)),
    // Ordered here so the tracker can draw the rows as they come.
    db
      .select()
      .from(characterSpellSlots)
      .where(eq(characterSpellSlots.characterId, characterId))
      .orderBy(asc(characterSpellSlots.level)),
  ]);

  const items: InventoryLineShape[] = itemRows.map(({ item, source }) => ({
    ...item,
    // The row's own snapshot is the truth; the library entry only answers for
    // lines stocked before there was one to take.
    bonuses: item.statBonuses ?? source?.statBonuses ?? null,
    sourceWorldId: source?.worldId ?? null,
    // Only a library entry can carry a photograph of the actual piece.
    photo: worldItemPhoto(item.worldItemId, source?.imageFile),
    // Resolved here rather than in the component: choosing a plate means
    // reading the compendium's manifest, and that JSON belongs on the server.
    // The middle cut, not the full engraving: no square on this page is wider
    // than about 100 CSS px, which 256px covers on a retina screen, and the
    // 640px plate was sixty-odd times the pixels the layout can show.
    plate: item.srdIndex ? (getItemArt(item.srdIndex)?.mid ?? null) : null,
    // For the plate that stands in for one: the compendium knows the category
    // of an SRD line, the library entry knows its own, and a hand-typed line
    // knows neither.
    category: (item.srdIndex ? getItem(item.srdIndex)?.category : null) ?? source?.category ?? null,
    // Where the line's source says it must be worn — the same rule equipItem
    // enforces, so the button the sheet offers cannot promise a slot the
    // action would refuse.
    requiredSlot: requiredSlot(item.srdIndex, source),
    // Only wanted for the one-touch preview hanging off the line's link.
    sourceDescription: source?.description ?? null,
  }));

  return { items, abilities, spellSlots };
}
