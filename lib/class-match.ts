/**
 * Reading a class out of free text.
 *
 * A character's class is whatever the player typed, in either language, so
 * everything downstream — the class plate on the portrait, the spell slot
 * table the sheet offers to fill in — has to *find* a known class inside the
 * string rather than demand an exact match: "Level 3 Wizard", "büyücü/hırsız"
 * and "Fighter (Champion)" all land on `wizard`, `wizard` and `fighter`.
 *
 * Matching folds the input twice: plain `toLowerCase()` keeps the English
 * names intact ("FIGHTER" → "fighter") but breaks ALL-CAPS Turkish, whose
 * dotless I lowers to a dotted i ("SAVAŞÇI" → "savaşçi"); the Turkish-locale
 * fold repairs exactly that case. A needle only has to match either fold.
 *
 * Deliberately free of imports, like lib/ui-art.ts which reads from it: a
 * client component may reach for a class plate without dragging anything else
 * into its bundle.
 */

export const CLASS_SLUGS = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
] as const;
export type ClassSlug = (typeof CLASS_SLUGS)[number];

/**
 * Needles searched for inside the written class, first match wins. The English
 * names come first so a string carrying both ("Wizard / büyücü") is read the
 * same way whichever language it leans on.
 */
const CLASS_ALIASES: Array<[needle: string, slug: ClassSlug]> = [
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
  // Compounds before the words they contain: `includes` has no word borders,
  // so "kara büyücü" left below "büyücü" would be read as a wizard — which is
  // exactly what it did until the short-rest button made warlocks matter.
  ["kara büyücü", "warlock"],
  ["doğuştan büyücü", "sorcerer"],
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

/** The class a written line names, or null when nothing is recognised. */
export function matchClass(klass: string | null | undefined): ClassSlug | null {
  if (!klass) return null;
  const folds = [klass.toLowerCase(), klass.toLocaleLowerCase("tr")];
  for (const [needle, slug] of CLASS_ALIASES) {
    if (folds.some((text) => text.includes(needle))) return slug;
  }
  return null;
}
