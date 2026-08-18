import { WORLD_ITEM_STATS, type WorldItemStat } from "@/lib/db/schema";

/**
 * Flat bonuses on a world item. Deliberately shallow (docs/design-economy.md
 * phase 3): a small set of integers, no conditions and no attunement engine.
 * Isomorphic — the edit form reads the same values back that the action wrote.
 */

/** Both ends of a single bonus. A ±10 swing is already far past 5e's range. */
export const STAT_BONUS_MIN = -10;
export const STAT_BONUS_MAX = 10;

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
