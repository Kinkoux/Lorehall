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

/**
 * The six keys a *floor* may name. AC and HP are totals, not scores: nothing
 * in the SRD says "your armour class is 19 while you wear this", so a floor on
 * either would be a rule we invented rather than one we read.
 */
export const ABILITY_STATS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
] as const satisfies readonly WorldItemStat[];
export type AbilityStat = (typeof ABILITY_STATS)[number];

/** The span a stated score may fall in — 5e's own 1–30. */
export const ABILITY_FLOOR_MIN = 1;
export const ABILITY_FLOOR_MAX = 30;

/**
 * Scores an item *sets* rather than adds to: "Your Strength score is 19 while
 * you wear these gauntlets", "…changes to 21. If your Strength is already
 * equal to or greater, the item has no effect."
 *
 * Both sentences are one rule — a floor under the score — which is why they
 * are stored as one: the wearer keeps whatever they had if it was already
 * higher. A flat bonus cannot express this (it would stack on a STR 20 fighter
 * the belt is supposed to do nothing for) and neither can an override (it
 * would *lower* them), so floors are their own term.
 */
export type AbilityFloors = Partial<Record<AbilityStat, number>>;

/**
 * What a piece grants: flat integers, plus — optionally — the scores it sets.
 *
 * The floors ride inside the same object (and the same stored JSON) rather
 * than in a column of their own, so every path that already carries bonuses
 * from an item to a stat block carries the floors with them and no caller has
 * to learn about a second value it might drop.
 */
export type StatBonuses = Partial<Record<WorldItemStat, number>> & {
  floors?: AbilityFloors;
};

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
  const source = readObject(raw);
  if (!source) return {};
  const out: StatBonuses = {};
  for (const stat of WORLD_ITEM_STATS) {
    const value = source[stat];
    if (typeof value !== "number" || !Number.isInteger(value) || value === 0) continue;
    if (value < STAT_BONUS_MIN || value > STAT_BONUS_MAX) continue;
    out[stat] = value;
  }
  const floors = readFloors(source.floors);
  if (floors) out.floors = floors;
  return out;
}

/** JSON that is an object, or nothing. A string, an array, junk: nothing. */
function readObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

/**
 * The `floors` half of a stored bonus object, read as distrustingly as the
 * flat half above: only the six ability keys, only whole numbers, and only
 * inside 1–30 — a value outside that is clamped rather than dropped, because a
 * floor is a *statement about a score* and the nearest legal score is a truer
 * reading of it than silence. Returns null when nothing survives, so the
 * caller can leave the key off entirely.
 */
function readFloors(raw: unknown): AbilityFloors | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const out: AbilityFloors = {};
  let any = false;
  for (const stat of ABILITY_STATS) {
    const value = source[stat];
    if (typeof value !== "number" || !Number.isInteger(value)) continue;
    out[stat] = Math.min(Math.max(value, ABILITY_FLOOR_MIN), ABILITY_FLOOR_MAX);
    any = true;
  }
  return any ? out : null;
}

/** The floors alone, for a caller that has no use for the flat bonuses. */
export function parseStatFloors(raw: string | null | undefined): AbilityFloors {
  return parseStatBonuses(raw).floors ?? {};
}

/**
 * The stored shape, built from parts: the writer's side of the reader above.
 *
 * Everything is put through the same limits the reader enforces, so a curated
 * data file cannot state a bonus a hand-edited form would have been stopped
 * from stating. Nothing left after that is NULL rather than `{}` — a piece
 * that grants nothing is a plain item, not an item granting nothing.
 */
export function stringifyStatBonuses(
  bonuses: StatBonuses | null | undefined,
  floors?: AbilityFloors | null
): string | null {
  const out: StatBonuses = {};
  for (const stat of WORLD_ITEM_STATS) {
    const value = bonuses?.[stat];
    if (typeof value !== "number" || !Number.isInteger(value) || value === 0) continue;
    out[stat] = Math.min(Math.max(value, STAT_BONUS_MIN), STAT_BONUS_MAX);
  }
  const stated = floors ?? bonuses?.floors;
  const kept = readFloors(stated);
  if (kept) out.floors = kept;
  return Object.keys(out).length > 0 ? JSON.stringify(out) : null;
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
 *
 * Floors do not add: two items that each set STR to a score state the *same
 * kind* of fact twice, and the higher statement wins (the belt of storm giant
 * strength does not become 48 because gauntlets are also worn). The key is
 * left off entirely when no worn piece states one.
 */
export function sumStatBonuses(sources: Array<string | null | undefined>): StatBonuses {
  const total: StatBonuses = {};
  const floors: AbilityFloors = {};
  let floored = false;
  for (const source of sources) {
    const parsed = parseStatBonuses(source);
    for (const stat of WORLD_ITEM_STATS) {
      const value = parsed[stat];
      if (value === undefined) continue;
      total[stat] = (total[stat] ?? 0) + value;
    }
    for (const stat of ABILITY_STATS) {
      const value = parsed.floors?.[stat];
      if (value === undefined) continue;
      floors[stat] = Math.max(floors[stat] ?? value, value);
      floored = true;
    }
  }
  for (const stat of WORLD_ITEM_STATS) {
    if (total[stat] === 0) delete total[stat];
  }
  if (floored) total.floors = floors;
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
