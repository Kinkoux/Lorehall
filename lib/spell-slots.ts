import { matchClass, type ClassSlug } from "@/lib/class-match";

/**
 * The 5e spell slot tables, and how a written class is turned into a starting
 * row set for the sheet.
 *
 * The sheet does not *enforce* any of this: slots are ordinary numbers a
 * player edits by hand, because half the tables at a real table are running a
 * homebrew class, a multiclass, or a variant nobody printed. This module only
 * answers "what would the book give you?", which is what the sheet's
 * "suggest from class" button asks — and the tables it answers from are the
 * three progressions the SRD actually publishes.
 *
 * Deliberately import-free apart from the class matcher (itself a list of
 * strings), so a client component could call this without pulling anything
 * heavy along.
 */

/** One row of the tracker: how many slots of a given spell level. */
export type SlotRow = { level: number; total: number };

/** The lowest and highest spell level a row may name. */
export const MIN_SPELL_LEVEL = 1;
export const MAX_SPELL_LEVEL = 9;
/** Above this a character gains no further slots — level 25 reads as 20. */
export const MAX_CASTER_LEVEL = 20;

/**
 * Bard, cleric, druid, sorcerer and wizard: one progression, indexed by
 * character level, each row listing slots for spell levels 1..9.
 */
const FULL: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/**
 * Paladin and ranger: the same shape at half speed, and — the detail every
 * half caster sheet gets wrong — nothing at all at level 1.
 */
const HALF: readonly (readonly number[])[] = [
  [],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

/**
 * Pact magic. A warlock's slots are not a column of levels but a handful of
 * slots that are all the same (rising) level — so the tracker writes them into
 * the row for that level and nowhere else: a level 5 warlock is two level-3
 * slots, which is exactly one row reading "3 · ● ●".
 *
 * Each entry is [how many, what level].
 */
const PACT: readonly (readonly [count: number, level: number])[] = [
  [1, 1],
  [2, 1],
  [2, 2],
  [2, 2],
  [2, 3],
  [2, 3],
  [2, 4],
  [2, 4],
  [2, 5],
  [2, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [3, 5],
  [4, 5],
  [4, 5],
  [4, 5],
  [4, 5],
];

const FULL_CASTERS: readonly ClassSlug[] = ["bard", "cleric", "druid", "sorcerer", "wizard"];
const HALF_CASTERS: readonly ClassSlug[] = ["paladin", "ranger"];

/** A column of per-spell-level counts into tracker rows, dropping the zeroes. */
function rowsOf(counts: readonly number[]): SlotRow[] {
  return counts.flatMap((total, index) =>
    total > 0 ? [{ level: index + 1, total }] : []
  );
}

/**
 * What the book would hand a character of this written class and level.
 *
 * Returns null when the class is not one the tables speak for — an
 * unrecognised homebrew name, but also a barbarian: "no suggestion" and "a
 * suggestion of nothing" have to read differently, or the button would quietly
 * wipe a fighter's hand-entered slots. An empty array is the third answer: a
 * paladin at level 1 *is* a caster, just not yet.
 */
export function suggestSlots(
  klass: string | null | undefined,
  level: number
): SlotRow[] | null {
  const slug = matchClass(klass);
  if (!slug) return null;
  const capped = Math.min(Math.max(Math.trunc(level) || 1, 1), MAX_CASTER_LEVEL);
  const index = capped - 1;
  if (FULL_CASTERS.includes(slug)) return rowsOf(FULL[index]);
  if (HALF_CASTERS.includes(slug)) return rowsOf(HALF[index]);
  if (slug === "warlock") {
    const [count, slotLevel] = PACT[index];
    return [{ level: slotLevel, total: count }];
  }
  return null;
}
