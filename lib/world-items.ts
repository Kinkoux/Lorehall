import { WORLD_ITEM_SLOTS, WORLD_ITEM_STATS, type WorldItemSlot, type WorldItemStat } from "@/lib/db/schema";

/**
 * Flat bonuses on a world item. Deliberately shallow (docs/design-economy.md
 * phase 3): a small set of integers, no conditions and no attunement engine.
 * Isomorphic — the edit form reads the same values back that the action wrote.
 */

/** Both ends of a single bonus. A ±10 swing is already far past 5e's range. */
export const STAT_BONUS_MIN = -10;
export const STAT_BONUS_MAX = 10;

/**
 * Both ends of a hand-written armour base on an inventory line. Nothing in 5e
 * reaches 30 (plate, a shield and a +3 ring is 23), and 0 is the floor a
 * number can honestly have — a blank field is how a line says it has none.
 * Stated here so the form's `min`/`max` and the action's clamp are one fact.
 */
export const AC_BASE_MIN = 0;
export const AC_BASE_MAX = 30;

export type StatBonuses = Partial<Record<WorldItemStat, number>>;

/** Abbreviations, not prose — the sheet spells scores this way in both locales. */
export const STAT_LABELS: Record<WorldItemStat, string> = {
  ac: "AC",
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
  hp: "HP",
};

/**
 * Read the stored JSON back. Every value is re-checked here rather than
 * trusted: the column is plain text, and a row written before a key was
 * retired (or by hand, in a console) must not reach a statblock as a string.
 * Zeroes are dropped — "+0 STR" is not a bonus.
 */
export function parseStatBonuses(raw: string | null | undefined): StatBonuses {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const source = parsed as Record<string, unknown>;
  const out: StatBonuses = {};
  for (const stat of WORLD_ITEM_STATS) {
    const value = source[stat];
    if (typeof value !== "number" || !Number.isInteger(value) || value === 0) continue;
    if (value < STAT_BONUS_MIN || value > STAT_BONUS_MAX) continue;
    out[stat] = value;
  }
  return out;
}

/** The same bonuses in WORLD_ITEM_STATS order, ready to render. */
export function statBonusEntries(
  raw: string | null | undefined
): Array<[WorldItemStat, number]> {
  const bonuses = parseStatBonuses(raw);
  return WORLD_ITEM_STATS.flatMap((stat) => {
    const value = bonuses[stat];
    return value === undefined ? [] : [[stat, value] as [WorldItemStat, number]];
  });
}

/**
 * What a set of worn items adds up to. Each source is re-parsed through the
 * distrusting reader above, so a hand-edited column cannot push a total past
 * what the individual pieces are allowed to be — but the *sum* is deliberately
 * left unclamped: five rings of +2 really are +10, and the one-per-slot rule
 * is what keeps that from running away.
 *
 * Zeroes are dropped again at the end, so a +1 and a −1 cancel out of the
 * display entirely rather than showing as "+0".
 */
export function sumStatBonuses(sources: Array<string | null | undefined>): StatBonuses {
  const total: StatBonuses = {};
  for (const source of sources) {
    for (const [stat, value] of Object.entries(parseStatBonuses(source)) as Array<
      [WorldItemStat, number]
    >) {
      total[stat] = (total[stat] ?? 0) + value;
    }
  }
  for (const stat of WORLD_ITEM_STATS) {
    if (total[stat] === 0) delete total[stat];
  }
  return total;
}

/** Same list, in WORLD_ITEM_STATS order, for a one-line "+2 AC · +1 STR". */
export function bonusEntries(bonuses: StatBonuses): Array<[WorldItemStat, number]> {
  return WORLD_ITEM_STATS.flatMap((stat) => {
    const value = bonuses[stat];
    return value === undefined ? [] : [[stat, value] as [WorldItemStat, number]];
  });
}

/**
 * The one slot a category leaves no argument about. A sword is held, a hauberk
 * is worn on the body, a shield is carried in a hand — three facts no table
 * negotiates, and the only three this function claims. Everything else (a
 * potion, a cloak, a wondrous trinket) answers null, and the player names the
 * slot themselves.
 *
 * `sub` is the SRD's finer grouping ("Light", "Heavy", "Shield"); a library
 * entry has none, so a homebrew shield is filed under the body-armour rule
 * unless its author gave the entry an explicit slot — which is why the writers
 * consult a stored slot *before* falling back here.
 */
export function categorySlot(
  category: string | null | undefined,
  sub: string | null | undefined = null
): WorldItemSlot | null {
  if (category === "weapon") return "weapon";
  if (category === "armor") return sub === "Shield" ? "hands" : "armor";
  return null;
}

/**
 * A slot name that came off a form (or any other untrusted string). Anything
 * outside the set — including the blank a "carried" selection sends — reads as
 * "no slot", which is the state every writer treats as "not equippable".
 */
export function readSlotName(raw: string | null | undefined): WorldItemSlot | null {
  if (!raw) return null;
  return (WORLD_ITEM_SLOTS as readonly string[]).includes(raw) ? (raw as WorldItemSlot) : null;
}
