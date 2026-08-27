import featsJson from "@/lib/data/feats.json";
import { ABILITIES, type AbilityKey } from "@/lib/dnd";

/**
 * The third shelf, and the same bargain the second one struck.
 *
 * `lib/data/feats.json` names the forty-two feats the 2014 Player's Handbook
 * prints and states four facts about each: what it is called, which book it is
 * in, what it asks of you before you may take it, and whether taking it also
 * lifts an ability score by one. It carries no description, and it never will
 * — a feat's text is the book's, and a public repository is not where the
 * book's text goes. What a player takes off this shelf is the *name*, written
 * onto their sheet; the wording they read out of their own copy.
 *
 * That sounds thin and is not. The name is what a level-up needs in order to
 * be a level-up rather than an ability score bump with a note beside it, and
 * the `asi` field is the one mechanical fact the sheet has to know on its own
 * behalf: a half-feat's +1 lands in a column, and a column nobody wrote to is
 * a level-up the player has to repair by hand.
 *
 * Grappler is marked `srd` because it happens to be in the SRD as well as the
 * Player's Handbook — a fact worth recording and no licence to print it here.
 * The stub is the stub either way.
 */

/**
 * Which ability a feat's +1 may go to: a short list for a feat that names its
 * own, the string "any" for Resilient, and null for the great majority, which
 * give no score at all.
 *
 * Null is also the honest answer where nobody was sure. A feat filed with no
 * `asi` hands out no point, and a player who knows better writes the point in
 * by hand on the sheet — which is the wrong answer in the direction that can
 * be corrected, unlike a +1 this file invented.
 */
export type FeatAsi = readonly AbilityKey[] | "any" | null;

export type Feat = {
  /** `f-alert` — the prefix is what keeps these out of every spell reader. */
  index: string;
  name: string;
  /** The book it is printed in. Every entry here says "PHB"; the field is
   *  written down anyway, for the day a second book joins the shelf. */
  source: "PHB";
  /** True for the one feat the SRD also carries. Provenance, not permission. */
  srd: boolean;
  /** The short fact standing in front of it — "Str 13", "Spellcasting". */
  prerequisite: string | null;
  asi: FeatAsi;
};

export const FEATS = featsJson as Feat[];

/**
 * The mark that tells a feat's index from a spell's wherever only the string
 * survives — a stored `srd_index` on a sheet's row, a hidden form field. No
 * SRD index begins with it, and neither does the `x-` the spell stubs use, so
 * the three shelves stay apart on a prefix alone.
 */
export const FEAT_PREFIX = "f-";

/** "This index names a feat" — asked of a bare string, cheaply. */
export const isFeatIndex = (index: string | null | undefined): boolean =>
  typeof index === "string" && index.startsWith(FEAT_PREFIX);

const FEAT_BY_INDEX = new Map(FEATS.map((f) => [f.index, f] as const));
const FEAT_BY_NAME = new Map(FEATS.map((f) => [f.name.toLowerCase(), f] as const));

export const getFeat = (index: string): Feat | undefined => FEAT_BY_INDEX.get(index);

/**
 * A feat by the name somebody typed, whole and case-folded — the same bargain
 * the spell and item sides strike. Half a name matches nothing: "Great" is not
 * a request for Great Weapon Master, and guessing would put a feat on a sheet
 * that nobody asked for.
 */
export const findFeatByName = (name: string): Feat | undefined =>
  FEAT_BY_NAME.get(name.trim().toLowerCase());

/** The abilities a feat's +1 may actually be spent on — empty for most. */
export function featAsiOptions(feat: Feat): readonly AbilityKey[] {
  if (feat.asi === null) return [];
  return feat.asi === "any" ? ABILITIES : feat.asi;
}

/**
 * "May this feat's point go here?" — the question the level-up action asks
 * before it writes a score, and the reason a posted `featAsi` cannot smuggle a
 * +1 out of a feat that grants none.
 */
export const acceptsFeatAsi = (feat: Feat, key: AbilityKey): boolean =>
  featAsiOptions(feat).includes(key);
