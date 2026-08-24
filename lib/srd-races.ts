import type { AbilityKey } from "@/lib/dnd";

/**
 * The nine peoples the SRD publishes, in the two things a race decides for a
 * brand-new sheet: how fast it walks, and which scores it was born with a
 * little more of.
 *
 * Paraphrased from the D&D 5e System Reference Document 5.1 (Wizards of the
 * Coast, CC-BY-4.0). Everything else a race carries — darkvision, a breath
 * weapon, the fact that a dwarf knows stonework — is prose rather than
 * arithmetic, and prose belongs in the sheet's notes where a player can argue
 * with it, not in a table the code obeys.
 *
 * Names stay English, the way every other game term in this app does; the
 * sentence that explains a race to a Turkish-speaking player lives in the
 * locale dictionaries, which is where the UI wave will reach for it. This
 * module is the numbers and nothing else.
 */

export const RACE_SLUGS = [
  "dwarf",
  "elf",
  "halfling",
  "human",
  "dragonborn",
  "gnome",
  "half-elf",
  "half-orc",
  "tiefling",
] as const;
export type RaceSlug = (typeof RACE_SLUGS)[number];

export type RaceInfo = {
  slug: RaceSlug;
  /** Canonical English display name — what the sheet stores for a slug. */
  name: string;
  /** Walking speed in feet, the number that goes on the sheet's speed tile. */
  speed: number;
  /** The fixed ability score increases, by the sheet's own ability keys. */
  asi: Partial<Record<AbilityKey, number>>;
  /**
   * How many *free* +1s the race hands out on top of the fixed ones — the
   * half-elf's "two other ability scores of your choice", and nothing else in
   * the SRD. Left as a count rather than as a guess: which two a player wants
   * is a decision, and a decision belongs to the form, not to this table.
   */
  floatingAsi?: number;
};

export const RACES: readonly RaceInfo[] = [
  { slug: "dwarf", name: "Dwarf", speed: 25, asi: { con: 2 } },
  { slug: "elf", name: "Elf", speed: 30, asi: { dex: 2 } },
  { slug: "halfling", name: "Halfling", speed: 25, asi: { dex: 2 } },
  {
    slug: "human",
    name: "Human",
    speed: 30,
    asi: { str: 1, dex: 1, con: 1, intel: 1, wis: 1, cha: 1 },
  },
  { slug: "dragonborn", name: "Dragonborn", speed: 30, asi: { str: 2, cha: 1 } },
  { slug: "gnome", name: "Gnome", speed: 25, asi: { intel: 2 } },
  { slug: "half-elf", name: "Half-Elf", speed: 30, asi: { cha: 2 }, floatingAsi: 2 },
  { slug: "half-orc", name: "Half-Orc", speed: 30, asi: { str: 2, con: 1 } },
  { slug: "tiefling", name: "Tiefling", speed: 30, asi: { cha: 2, intel: 1 } },
];

const fold = (value: string) => value.trim().toLowerCase();

/**
 * Every spelling that names a race: its slug, and its display name folded.
 *
 * The two happen to coincide for all nine — "Half-Elf" folds to the slug
 * "half-elf" — and that coincidence is precisely why the name is entered
 * explicitly rather than relied upon. The sheet's `race` column is free text a
 * player may have typed, imported or had written for them by the builder, and
 * a tenth entry named "Wood Elf" under the slug "wood-elf" would silently stop
 * answering the day it arrived.
 */
const BY_KEY = new Map<string, RaceInfo>();
for (const race of RACES) {
  BY_KEY.set(race.slug, race);
  BY_KEY.set(fold(race.name), race);
}

/**
 * The entry a slug or a written race name points at, or null for anything else.
 *
 * Folded rather than compared whole, so a select that posts "Half-Elf" and one
 * that posts "half-elf" land in the same place. Null is not a failure: a
 * player who typed "Aarakocra" has a race the sheet will happily carry as
 * written, it simply has no speed to offer them.
 */
export function raceBySlug(slug: string | null | undefined): RaceInfo | null {
  if (!slug) return null;
  return BY_KEY.get(fold(slug)) ?? null;
}
