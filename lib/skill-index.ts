/**
 * The eighteen skills, in the two facts every surface in the app needs: what
 * the skill is called, and which ability it is rolled off.
 *
 * Paraphrased from the D&D 5e System Reference Document 5.1 (Wizards of the
 * Coast, CC-BY-4.0), and deliberately the *whole* of what this module knows.
 * The sentence explaining what Sleight of Hand is for lives in lib/srd.ts,
 * which builds its own entries on top of this list — the arrow points that way
 * round for one reason: the character builder is a client island, it needs the
 * names and the abilities to draw eighteen tick boxes, and a module that
 * carried the prose as well would post two locales of description into the
 * browser bundle to render eighteen labels. A bundler cannot shake a field off
 * an object it is handing over whole, so the split has to exist in the source.
 *
 * This is also the one place the names are spelled. `characters.prof_skills`
 * stores them as a CSV and lib/dnd.ts compares that CSV to these strings
 * verbatim, so a typo here is a proficiency that renders nowhere — which is
 * exactly why lib/srd-classes.ts derives its own list from this one rather
 * than keeping a second copy that could drift.
 *
 * A leaf on purpose: it imports nothing, because lib/dnd.ts reads lib/srd.ts,
 * lib/srd.ts reads this, and a third edge back into lib/dnd.ts would close the
 * ring.
 */

/** The five abilities a skill can be rolled off — no skill uses Constitution. */
export type SkillAbility = "STR" | "DEX" | "INT" | "WIS" | "CHA";

export type SkillIndexEntry = { name: string; ability: SkillAbility };

/**
 * Grouped by ability rather than alphabetically, the way the printed sheet
 * rules them: a player looking for Stealth looks under DEX. Every list drawn
 * from this one inherits that order, which is why it is worth stating once.
 */
export const SKILL_INDEX: readonly SkillIndexEntry[] = [
  { name: "Athletics", ability: "STR" },
  { name: "Acrobatics", ability: "DEX" },
  { name: "Sleight of Hand", ability: "DEX" },
  { name: "Stealth", ability: "DEX" },
  { name: "Arcana", ability: "INT" },
  { name: "History", ability: "INT" },
  { name: "Investigation", ability: "INT" },
  { name: "Nature", ability: "INT" },
  { name: "Religion", ability: "INT" },
  { name: "Animal Handling", ability: "WIS" },
  { name: "Insight", ability: "WIS" },
  { name: "Medicine", ability: "WIS" },
  { name: "Perception", ability: "WIS" },
  { name: "Survival", ability: "WIS" },
  { name: "Deception", ability: "CHA" },
  { name: "Intimidation", ability: "CHA" },
  { name: "Performance", ability: "CHA" },
  { name: "Persuasion", ability: "CHA" },
];

/** The names alone, for the callers that only ever needed a vocabulary. */
export const SKILL_NAMES: readonly string[] = SKILL_INDEX.map((skill) => skill.name);
