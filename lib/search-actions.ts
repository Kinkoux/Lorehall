"use server";

import { and, eq } from "drizzle-orm";
import { db, characters, worldItems } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { fmt } from "@/lib/dnd";
import { statBonusEntries, STAT_LABELS } from "@/lib/world-items";

/**
 * Lookahead for the two "type a name" fields on a character sheet. The point
 * is not search for its own sake: it is that an inventory line typed as
 * "Longsword" and one picked from the compendium should not be different
 * kinds of thing. Picking from the list is what attaches a reference, and the
 * reference is what later gives the row its slot, its bonuses and its link.
 *
 * Free text still wins whenever the player wants it to — nothing here is
 * required, and a name that matches nothing is simply added as typed.
 */

/** Below this a query matches half the SRD; the field stays quiet instead. */
const MIN_QUERY = 2;
/** A dropdown longer than this is a list, not a suggestion. */
const MAX_RESULTS = 8;

export type ItemSuggestion = {
  /** Where it came from — the world's own library, or the SRD compendium. */
  source: "srd" | "world";
  /** The world item's id, or the SRD index. Goes back as a hidden field. */
  ref: string;
  name: string;
  /** Dictionary key under `world.items.categories`. */
  category: string;
  /** Dictionary key under `world.items.slots`, or null for "carried". */
  slot: string | null;
  /** Pre-rendered "+2 AC · +1 STR", or null. Display only — never an input. */
  bonuses: string | null;
};

export type SpellSuggestion = {
  ref: string;
  name: string;
  /** 0 is a cantrip; the caller words it. */
  level: number;
  school: string;
};

/**
 * Turkish is why this is `toLowerCase()` and not a regex or a locale-aware
 * fold: "İstanbul".toLocaleLowerCase("tr") produces a dotless-i sequence that
 * no longer matches the same word typed in an English keyboard layout, and a
 * user-supplied string in a RegExp is a metacharacter waiting to happen.
 * Plain case folding plus `includes` is both predictable and safe here.
 */
const matches = (name: string, needle: string) => name.toLowerCase().includes(needle);

/**
 * Suggestions are a read of the world's library, so the gate is the sheet's
 * own: the character's player (while they actually sit at the table) or the
 * DM who runs it. Anyone else — including the world owner watching from
 * outside — gets nothing rather than an error, because the id is forgeable
 * and a refusal that differs from "no matches" is itself an answer.
 */
async function openSheet(characterId: string, actorId: string) {
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) return null;
  const access = await getCampaignAccess(character.campaignId, actorId);
  if (!access) return null;
  const mine = character.userId === actorId && access.canParticipate;
  if (!mine && !access.isDm) return null;
  return { character, access };
}

/** The one-line "+2 AC · +1 STR" a suggestion shows, or null for a plain item. */
function bonusSummary(statBonuses: string | null): string | null {
  const entries = statBonusEntries(statBonuses);
  if (entries.length === 0) return null;
  return entries.map(([stat, value]) => `${fmt(value)} ${STAT_LABELS[stat]}`).join(" · ");
}

/**
 * Names this character could plausibly be typing. The world's own library
 * comes first — a DM who forged "Emberfang Dagger" for this table means that
 * one, not the SRD's dagger — and the SRD fills whatever room is left.
 */
export async function searchItemsForCharacter(
  characterId: string,
  q: string
): Promise<ItemSuggestion[]> {
  const user = await requireUser();
  const needle = q.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];
  const open = await openSheet(characterId, user.id);
  if (!open) return [];

  // A DM-only entry is not among the names this sheet could be typing: the
  // lookahead is a read of the library, so it reads the same slice of it the
  // reader would see on the world page.
  const library = await db
    .select()
    .from(worldItems)
    .where(
      open.access.isDm
        ? eq(worldItems.worldId, open.access.world.id)
        : and(
            eq(worldItems.worldId, open.access.world.id),
            eq(worldItems.visibility, "everyone")
          )
    );
  const fromWorld: ItemSuggestion[] = library
    .filter((item) => matches(item.name, needle))
    .map((item) => ({
      source: "world" as const,
      ref: item.id,
      name: item.name,
      category: item.category,
      slot: item.slot,
      bonuses: bonusSummary(item.statBonuses),
    }));

  const room = MAX_RESULTS - Math.min(fromWorld.length, MAX_RESULTS);
  if (room === 0) return fromWorld.slice(0, MAX_RESULTS);

  // Lazy import keeps the SRD JSON out of the sheet's own chunk.
  const { ITEMS, srdItemSlot } = await import("@/lib/srd-data");
  const fromSrd: ItemSuggestion[] = [];
  for (const item of ITEMS) {
    if (fromSrd.length === room) break;
    if (!matches(item.name, needle)) continue;
    fromSrd.push({
      source: "srd",
      ref: item.index,
      name: item.name,
      category: item.category,
      slot: srdItemSlot(item),
      // Nothing in the SRD carries a machine-readable bonus.
      bonuses: null,
    });
  }
  return [...fromWorld, ...fromSrd];
}

/**
 * The same lookahead for the spells field, SRD-only: there is no homebrew
 * spell library to search (docs/design-economy.md phase 2 built one for items
 * and stopped there), so a homebrew power stays free text — which is exactly
 * how the abilities list already treats class features and traits.
 */
export async function searchSpellsForCharacter(
  characterId: string,
  q: string
): Promise<SpellSuggestion[]> {
  const user = await requireUser();
  const needle = q.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];
  if (!(await openSheet(characterId, user.id))) return [];

  const { SPELLS } = await import("@/lib/srd-data");
  const out: SpellSuggestion[] = [];
  for (const spell of SPELLS) {
    if (out.length === MAX_RESULTS) break;
    if (!matches(spell.name, needle)) continue;
    out.push({ ref: spell.index, name: spell.name, level: spell.level, school: spell.school });
  }
  return out;
}
