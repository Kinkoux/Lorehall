import { and, eq, inArray } from "drizzle-orm";
import { characterItems, db, worldItems } from "@/lib/db";
import type { AcDexRule, Character, WorldItemSlot } from "@/lib/db/schema";
import { AC_DEX_LABEL, abilityScore, mod, type AcBreakdown, type AcPart } from "@/lib/dnd";
import { armorAcFor } from "@/lib/srd-data";
import {
  parseStatBonuses,
  sumStatBonuses,
  type AbilityFloors,
  type StatBonuses,
} from "@/lib/world-items";

/**
 * What the sheet is actually protected by.
 *
 * Before this, armour class was one hand-typed number plus whatever the worn
 * items declared as a flat `ac` bonus — which meant a character in leather
 * armour was as exposed as one in nothing, because the SRD carries no bonus
 * for armour: it carries a *formula*, spelled in prose ("11 + Dex"). Reading
 * that formula is the whole job here.
 *
 * The chain, highest authority first:
 *
 *   1. Worn armour in the `armor` slot carrying a base someone typed onto the
 *      line — the player's own statement about a piece, which outranks even
 *      the compendium, because the SRD's magic armour ("as adamantine plate")
 *      states its class in prose no parser will ever read.
 *   2. That same line's SRD entry, when it parses → its formula.
 *   3. The armour class someone typed into the sheet form.
 *   4. 10 + DEX, the unarmoured default, when the sheet has ability scores.
 *   5. Nothing at all → null, and the badge shows an em dash.
 *
 * There is no "next candidate" past the first: at most one line is worn in
 * `armor` at a time (`character_items_one_per_slot`), so a piece that answers
 * neither 1 nor 2 hands the question straight to the sheet's own field.
 *
 * On top of whichever base won: the piece in `hands`, which adds its own typed
 * base if it has one and otherwise the shield bonus its SRD entry states, and
 * every flat `ac` bonus on every worn piece. Those ride along in all cases (a
 * hand-typed AC of 15 plus a ring of protection is 16), because they are
 * additions to an armour class rather than competing statements of one.
 *
 * The DEX modifier is the *worn* one: `bonuses` is what the pieces add to the
 * ability scores — and, in its `floors`, the scores they set outright — so a
 * ring of +2 DEX moves the armour class the same way it moves Stealth, and so
 * does an ioun stone of agility. Nothing is written back: take the ring off
 * and the number returns by arithmetic.
 */

/** An equipped line, as much of it as the armour rules care about. */
export type WornForAc = {
  name: string;
  slot: WorldItemSlot | null;
  srdIndex: string | null;
  /** The row's own snapshot, or its source's — resolved by the caller. */
  statBonuses: string | null;
  /** The armour class typed onto this line, when a player typed one. */
  acBase?: number | null;
  /** How DEX joins that typed base; absent reads as "none". */
  acDex?: AcDexRule | null;
};

/** The armour formula a single worn line states, and who stated it. */
type LineArmor = { base: number; dex: AcDexRule; typed: boolean };

/**
 * What one line says about a wearer's armour class. The typed base wins by
 * design: a player who has gone to the trouble of writing "16, no DEX" onto
 * Adamantine Armor has said something the compendium could not, and quietly
 * preferring the SRD's silence over their sentence is the bug this fixes.
 */
function lineArmor(piece: WornForAc): LineArmor | null {
  if (piece.acBase !== null && piece.acBase !== undefined) {
    return { base: piece.acBase, dex: piece.acDex ?? "none", typed: true };
  }
  const srd = armorAcFor(piece.srdIndex);
  return srd?.kind === "armor" ? { base: srd.base, dex: srd.dex, typed: false } : null;
}

/** What the piece in hand adds — its typed base first, then the SRD's shield. */
function handBonus(piece: WornForAc): number | null {
  if (piece.acBase !== null && piece.acBase !== undefined) return piece.acBase;
  const srd = armorAcFor(piece.srdIndex);
  return srd?.kind === "shield" ? srd.shieldBonus : null;
}

export function effectiveAc(
  character: Pick<Character, "armorClass" | "dex">,
  worn: readonly WornForAc[],
  bonuses: StatBonuses = {},
  floors: AbilityFloors = bonuses.floors ?? {}
): AcBreakdown {
  const equipped = worn.filter((piece) => piece.slot !== null);
  // The score the character is *wearing*, not the one stored on the sheet —
  // raised by what the gear adds and floored by what it sets, so a piece that
  // states a DEX score moves the armour class the same way it moves Stealth.
  const dexMod =
    character.dex === null
      ? null
      : mod(abilityScore(character.dex, bonuses.dex ?? 0, floors.dex));

  const parts: AcPart[] = [];
  // One line per slot is the database's guarantee, so these are lookups
  // rather than searches for the best of several candidates.
  const body = equipped.find((piece) => piece.slot === "armor");
  const bodyAc = body ? lineArmor(body) : null;

  if (body && bodyAc) {
    // A typed base names the piece it came from — "why is it 16?" is answered
    // by the item, not by a bare number the reader cannot place.
    parts.push({ kind: "base", label: bodyAc.typed ? body.name : null, value: bodyAc.base });
    // A sheet with no DEX score still wears armour — it just contributes the
    // base and nothing else, rather than refusing to answer.
    if (dexMod !== null && bodyAc.dex !== "none") {
      const value = bodyAc.dex === "capped2" ? Math.min(dexMod, 2) : dexMod;
      if (value !== 0) parts.push({ kind: "dex", label: AC_DEX_LABEL, value });
    }
  } else if (character.armorClass !== null) {
    parts.push({ kind: "base", label: null, value: character.armorClass });
  } else if (dexMod !== null) {
    parts.push({ kind: "base", label: null, value: 10 });
    if (dexMod !== 0) parts.push({ kind: "dex", label: AC_DEX_LABEL, value: dexMod });
  }

  const hand = equipped.find((piece) => piece.slot === "hands");
  const shield = hand ? handBonus(hand) : null;
  if (hand && shield) parts.push({ kind: "shield", label: hand.name, value: shield });

  // Per piece rather than as one total, so the tooltip can name what granted
  // it. The distrusting reader is the same one sumStatBonuses uses, so the
  // terms here add up to exactly the figure the stat block folds in.
  for (const piece of equipped) {
    const bonus = parseStatBonuses(piece.statBonuses).ac;
    if (bonus) parts.push({ kind: "item", label: piece.name, value: bonus });
  }

  // No base means the sheet has said nothing about how hard it is to hit;
  // a lone shield is not an armour class, so the badge stays empty.
  const hasBase = parts.some((part) => part.kind === "base");
  if (!hasBase) return { value: null, parts: [] };
  return { value: parts.reduce((sum, part) => sum + part.value, 0), parts };
}

/** Everything a list page needs about one character's gear, already summed. */
export type WornSet = { worn: WornForAc[]; bonuses: StatBonuses };

const EMPTY_WORN: WornSet = { worn: [], bonuses: {} };

/** What a character with no equipped line looks like — never undefined. */
export function wornSetFor(
  loaded: ReadonlyMap<string, WornSet>,
  characterId: string
): WornSet {
  return loaded.get(characterId) ?? EMPTY_WORN;
}

/**
 * The worn gear of many characters in one query.
 *
 * A list page shows a dozen sheets, and asking each of them what it is wearing
 * is a dozen roundtrips for a page that had two. One `IN (…)` answers for the
 * whole party, and the rows are grouped here so the caller's loop is plain
 * arithmetic — the same arithmetic the sheet does for one character.
 *
 * The library entry rides along for the same reason it does on the sheet: a
 * line stocked before the snapshot columns existed still has bonuses, they
 * just live on the entry it was stamped from.
 */
export async function loadWornFor(
  characterIds: readonly string[]
): Promise<Map<string, WornSet>> {
  const loaded = new Map<string, WornSet>();
  if (characterIds.length === 0) return loaded;

  const rows = await db
    .select({
      characterId: characterItems.characterId,
      name: characterItems.name,
      slot: characterItems.slot,
      srdIndex: characterItems.srdIndex,
      statBonuses: characterItems.statBonuses,
      acBase: characterItems.acBase,
      acDex: characterItems.acDex,
      sourceBonuses: worldItems.statBonuses,
    })
    .from(characterItems)
    .leftJoin(worldItems, eq(characterItems.worldItemId, worldItems.id))
    .where(
      and(
        eq(characterItems.equipped, 1),
        inArray(characterItems.characterId, [...new Set(characterIds)])
      )
    );

  for (const row of rows) {
    const piece: WornForAc = {
      name: row.name,
      slot: row.slot,
      srdIndex: row.srdIndex,
      // The row's own snapshot is the truth; the library entry only answers
      // for lines stocked before there was one to take.
      statBonuses: row.statBonuses ?? row.sourceBonuses ?? null,
      acBase: row.acBase,
      acDex: row.acDex,
    };
    const set = loaded.get(row.characterId);
    if (set) set.worn.push(piece);
    else loaded.set(row.characterId, { worn: [piece], bonuses: {} });
  }
  for (const set of loaded.values()) {
    set.bonuses = sumStatBonuses(set.worn.map((piece) => piece.statBonuses));
  }
  return loaded;
}
