/**
 * URLs for the engraving plates under `public/art/`, written by
 * `scripts/convert-ui-art.mjs`.
 *
 * Deliberately free of imports: these are plain string constants, so a client
 * component can reach for a plate without dragging the compendium's JSON into
 * its bundle.
 */

const ART = (name: string) => `/art/${name}.webp`;

/**
 * A character's class is free text — the sheet takes whatever the player types,
 * in either language. So we look for a known class name *inside* the string
 * rather than demanding an exact match: "Level 3 Wizard", "büyücü/hırsız" and
 * "Fighter (Champion)" all land on a plate.
 *
 * Matching folds the input twice: plain `toLowerCase()` keeps the English
 * names intact ("FIGHTER" → "fighter") but breaks ALL-CAPS Turkish, whose
 * dotless I lowers to a dotted i ("SAVAŞÇI" → "savaşçi"); the Turkish-locale
 * fold repairs exactly that case. A needle only has to match either fold.
 */
const CLASS_ALIASES: Array<[needle: string, slug: string]> = [
  ["barbarian", "barbarian"],
  ["bard", "bard"],
  ["cleric", "cleric"],
  ["druid", "druid"],
  ["fighter", "fighter"],
  ["monk", "monk"],
  ["paladin", "paladin"],
  ["ranger", "ranger"],
  ["rogue", "rogue"],
  ["sorcerer", "sorcerer"],
  ["warlock", "warlock"],
  ["wizard", "wizard"],
  ["büyücü", "wizard"],
  ["sihirbaz", "wizard"],
  ["savaşçı", "fighter"],
  ["barbar", "barbarian"],
  ["ozan", "bard"],
  ["rahip", "cleric"],
  ["hırsız", "rogue"],
  ["keşiş", "monk"],
  ["korucu", "ranger"],
  ["avcı", "ranger"],
];

/** The class plate for a written class, or null when nothing is recognised. */
export function classArtFor(klass: string | null | undefined): string | null {
  if (!klass) return null;
  const folds = [klass.toLowerCase(), klass.toLocaleLowerCase("tr")];
  for (const [needle, slug] of CLASS_ALIASES) {
    if (folds.some((text) => text.includes(needle))) return ART(`class-${slug}`);
  }
  return null;
}

/** The sigil plate for a spell school. SRD school names are English. */
export function schoolArt(school: string): string {
  return ART(`school-${school.toLowerCase()}`);
}

/** The category plate for an item: weapon, armor, gear, tool, vehicle, magic. */
export function categoryArt(category: string): string {
  return ART(`cat-${category}`);
}

/** Vignettes for the empty states, one per ledger that can stand empty. */
export const EMPTY_ART = {
  codex: ART("empty-codex"),
  inventory: ART("empty-inventory"),
  quests: ART("empty-quests"),
  journal: ART("empty-journal"),
  maps: ART("empty-maps"),
  party: ART("empty-party"),
  spells: ART("empty-spells"),
  library: ART("empty-library"),
  encounters: ART("empty-encounters"),
  treasury: ART("empty-treasury"),
} as const;
