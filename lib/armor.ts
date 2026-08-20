import type { Character, WorldItemSlot } from "@/lib/db/schema";
import { AC_DEX_LABEL, mod, type AcBreakdown, type AcPart } from "@/lib/dnd";
import { armorAcFor } from "@/lib/srd-data";
import { parseStatBonuses, type StatBonuses } from "@/lib/world-items";

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
 *   1. Worn armour in the `armor` slot whose SRD entry parses → its formula.
 *   2. The armour class someone typed into the sheet form.
 *   3. 10 + DEX, the unarmoured default, when the sheet has ability scores.
 *   4. Nothing at all → null, and the badge shows an em dash.
 *
 * On top of whichever base won: a shield held in `hands`, and every flat `ac`
 * bonus on every worn piece. Those two ride along in all four cases (a hand-
 * typed AC of 15 plus a ring of protection is 16), because they are additions
 * to an armour class rather than competing statements of one.
 *
 * The DEX modifier is the *worn* one: `bonuses` is what the pieces add to the
 * ability scores, so a ring of +2 DEX moves the armour class the same way it
 * moves Stealth. Nothing is written back — take the ring off and the number
 * returns by arithmetic.
 */

/** An equipped line, as much of it as the armour rules care about. */
export type WornForAc = {
  name: string;
  slot: WorldItemSlot | null;
  srdIndex: string | null;
  /** The row's own snapshot, or its source's — resolved by the caller. */
  statBonuses: string | null;
};

export function effectiveAc(
  character: Pick<Character, "armorClass" | "dex">,
  worn: readonly WornForAc[],
  bonuses: StatBonuses = {}
): AcBreakdown {
  const equipped = worn.filter((piece) => piece.slot !== null);
  // The score the character is *wearing*, not the one stored on the sheet.
  const dexMod =
    character.dex === null ? null : mod(character.dex + (bonuses.dex ?? 0));

  const parts: AcPart[] = [];
  // One reading per piece: the SRD lookup is a scan, and the shield and the
  // body armour are both looked for in the same list.
  const read = equipped.map((piece) => ({ piece, ac: armorAcFor(piece.srdIndex) }));

  const body = read.find((line) => line.piece.slot === "armor" && line.ac?.kind === "armor");
  const bodyAc = body?.ac;

  if (bodyAc?.kind === "armor") {
    parts.push({ kind: "base", label: null, value: bodyAc.base });
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

  const shield = read.find((line) => line.piece.slot === "hands" && line.ac?.kind === "shield");
  if (shield?.ac?.kind === "shield") {
    parts.push({ kind: "shield", label: shield.piece.name, value: shield.ac.shieldBonus });
  }

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
