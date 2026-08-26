"use server";

import { and, eq } from "drizzle-orm";
import { db, characters, worldItems } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { getCampaignAccess } from "@/lib/perms";
import { fmt } from "@/lib/dnd";
import { statBonusEntries, STAT_LABELS } from "@/lib/world-items";
import { categoryArtThumb } from "@/lib/ui-art";
import { worldItemPhoto } from "@/components/character/item-art";

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
  /**
   * The canonical name — English for an SRD entry, whatever its author typed
   * for a library one. This is what the field writes into the form, and it is
   * what the server resolves a nameless submission against, so it stays the
   * same string in every locale.
   */
  name: string;
  /**
   * What to *show* instead, when the reader's locale has its own word for the
   * thing. Absent whenever it would only repeat `name`, so a caller can render
   * `display ?? name` and get the plain case for free.
   */
  display?: string;
  /** Dictionary key under `world.items.categories`. */
  category: string;
  /** Dictionary key under `world.items.slots`, or null for "carried". */
  slot: string | null;
  /** Pre-rendered "+2 AC · +1 STR", or null. Display only — never an input. */
  bonuses: string | null;
  /**
   * The picture a *list row* may wear, resolved on the server for the same
   * reason the sheet's squares are: choosing a plate means reading the
   * compendium's manifest, and that JSON stays here.
   *
   * Cut small, always, and that is the whole distinction from `photo` below. A
   * suggestion list is up to eight rows drawn 28 pixels wide while somebody is
   * still typing; an SRD entry therefore answers with its 96px cut, and a
   * library entry answers with its *category* plate rather than its own
   * photograph — that photograph is whatever the DM uploaded, up to four
   * megabytes of it, at whatever dimensions their phone shoots, and eight of
   * those arriving mid-keystroke is a list that costs more than the sheet.
   */
  art: string;
  /**
   * The library entry's actual photograph, for the one place a single chosen
   * item is drawn and the download is worth it: the strip under the DM's
   * give-item field, which exists precisely so they can see that "Ring" meant
   * the enchanted one. Null for an SRD entry, which has no photograph — only
   * engravings, and `art` already carries the right cut of those.
   */
  photo: string | null;
};

export type SpellSuggestion = {
  ref: string;
  /**
   * The canonical name — the one this library files the spell under, and the
   * one the field writes into the form. A row found under a printed name the
   * SRD dropped ("Bigby's Hand") still writes the SRD's own spelling, because
   * that is what the server resolves a nameless submission against.
   */
  name: string;
  /** What to *show* instead: the printed name that found it. */
  display?: string;
  /** 0 is a cantrip; the caller words it. */
  level: number;
  school: string;
  /** The book, for a spell whose text is not the SRD's to print. Else null. */
  source: string | null;
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
 *
 * A roster character has no table and therefore no world: `access` is null for
 * one, its owner is the only reader, and the library half of the lookahead
 * simply has nothing to read.
 */
async function openSheet(characterId: string, actorId: string) {
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) return null;
  if (!character.campaignId) {
    return character.userId === actorId ? { character, access: null } : null;
  }
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
  // reader would see on the world page. A roster sheet reads no slice at all —
  // it belongs to no world — and the compendium fills the whole list instead.
  const access = open.access;
  const library = access
    ? await db
        .select()
        .from(worldItems)
        .where(
          access.isDm
            ? eq(worldItems.worldId, access.world.id)
            : and(eq(worldItems.worldId, access.world.id), eq(worldItems.visibility, "everyone"))
        )
    : [];
  const fromWorld: ItemSuggestion[] = library
    .filter((item) => matches(item.name, needle))
    .map((item) => ({
      source: "world" as const,
      ref: item.id,
      name: item.name,
      category: item.category,
      slot: item.slot,
      bonuses: bonusSummary(item.statBonuses),
      art: categoryArtThumb(item.category),
      photo: worldItemPhoto(item.id, item.imageFile),
    }));

  const room = MAX_RESULTS - Math.min(fromWorld.length, MAX_RESULTS);
  if (room === 0) return fromWorld.slice(0, MAX_RESULTS);

  // Lazy import keeps the SRD JSON out of the sheet's own chunk.
  const { itemMatchesName, localizedItemName, srdItemArt, srdItemSlot, ITEMS } = await import(
    "@/lib/srd-data"
  );
  // The compendium answers to both names whatever the interface language, so a
  // player typing "hançer" and one typing "dagger" reach the same entry — and
  // both walk away with the same English name written into the row.
  const locale = await getLocale();
  const fromSrd: ItemSuggestion[] = [];
  for (const item of ITEMS) {
    if (fromSrd.length === room) break;
    if (!itemMatchesName(item, needle)) continue;
    const display = localizedItemName(item, locale);
    fromSrd.push({
      source: "srd",
      ref: item.index,
      name: item.name,
      display: display === item.name ? undefined : display,
      category: item.category,
      slot: srdItemSlot(item),
      // Nothing in the SRD carries a machine-readable bonus.
      bonuses: null,
      art: srdItemArt(item).thumb,
      // The compendium is drawings, not photographs.
      photo: null,
    });
  }
  return [...fromWorld, ...fromSrd];
}

/**
 * The same lookahead for the spells field. There is still no homebrew spell
 * library to search (docs/design-economy.md phase 2 built one for items and
 * stopped there), so a homebrew power stays free text — which is exactly how
 * the abilities list already treats class features and traits.
 *
 * What it does now search is the whole of what the compendium knows a spell
 * can be called: the SRD's entries, the fact stubs for spells printed in books
 * this project may not reprint, and the printed names of SRD entries the book
 * renamed. All three write the same shape of row, and the middle one is marked
 * with its book so nobody picks it expecting to be shown the text.
 */
export async function searchSpellsForCharacter(
  characterId: string,
  q: string
): Promise<SpellSuggestion[]> {
  const user = await requireUser();
  const needle = q.trim().toLowerCase();
  if (needle.length < MIN_QUERY) return [];
  if (!(await openSheet(characterId, user.id))) return [];

  const { searchSpells, isExtraSpell, spellAliasHit } = await import("@/lib/srd-data");
  const out: SpellSuggestion[] = [];
  // One search, so the field and the compendium list can never disagree about
  // which spells answer to a name.
  for (const spell of searchSpells(needle, "", "")) {
    if (out.length === MAX_RESULTS) break;
    const source = isExtraSpell(spell) ? spell.source : null;
    const alias = source ? null : spellAliasHit(spell.index, needle);
    out.push({
      ref: spell.index,
      name: spell.name,
      display: alias ?? undefined,
      level: spell.level,
      school: spell.school,
      source,
    });
  }
  return out;
}
