import { mod, profBonus, type AbilityKey } from "@/lib/dnd";
import { matchClass, type ClassSlug } from "@/lib/class-match";
import { SKILL_NAMES } from "@/lib/skill-index";

/**
 * What the book says a class *is*, in the four facts a sheet cannot derive on
 * its own: the hit die it levels on, the two saves it is proficient in, the
 * skills it may pick from, and the ability it casts with.
 *
 * Paraphrased from the D&D 5e System Reference Document 5.1 (Wizards of the
 * Coast, CC-BY-4.0) — the same well lib/srd.ts drinks from, and the reason
 * this table can sit in a public repository at all.
 *
 * It is a *starting point*, never a rule the sheet enforces. Every field it
 * fills in is an ordinary editable column afterwards, because the character
 * builder's job is to spare a first-time player twelve lookups rather than to
 * tell a table of eight years' standing what their multiclassed half-orc is
 * allowed to be. Which is also why nothing here is consulted again once the
 * sheet exists: the sheet's own columns are the truth from then on.
 *
 * Imports run one way only — this module reads lib/dnd.ts, lib/class-match.ts
 * and the leaf lib/skill-index.ts, and none of the three reads it back, so the
 * cycle the arithmetic at the bottom would otherwise invite never forms.
 */

/**
 * Skill names, spelled exactly as the compendium spells them — which is now a
 * fact rather than a hope, because they *are* the compendium's, read straight
 * off lib/skill-index.ts. What a class hands the builder ends up in
 * `characters.prof_skills` as a CSV and lib/dnd.ts compares that CSV to those
 * strings verbatim, so a second hand-kept copy was a typo waiting to become a
 * proficiency that rendered nowhere.
 *
 * The twelve `from` lists below stay written out by hand, because which six
 * skills a barbarian may pick is the book's ruling and not something derivable
 * — but a test walks every entry of every one of them back to this list, so a
 * name that drifts fails a suite rather than a table's evening.
 */
const ALL_SKILLS = SKILL_NAMES;

/** "Choose `n` of these" — a class's skill proficiency clause, as data. */
export type SkillChoices = { n: number; from: readonly string[] };

export type ClassInfo = {
  /** Canonical English display name — what the sheet stores for a slug. */
  name: string;
  /** Sides on the die: 6, 8, 10 or 12. */
  hitDie: number;
  /** The two saving throws the class is proficient in, from level 1. */
  saves: readonly [AbilityKey, AbilityKey];
  skillChoices: SkillChoices;
  /**
   * The ability a caster's DC and attack bonus are read off, or null for a
   * class that casts nothing at level 1.
   *
   * Null covers the four martials — and stays null for the fighter and the
   * rogue on purpose. The SRD does give them the Eldritch Knight and the
   * Arcane Trickster, but a subclass taken at level 3 is not a fact about the
   * class, and answering "INT" for every fighter would print a spell save DC
   * on the sheet of every champion who will never cast a thing.
   */
  castingAbility: "intel" | "wis" | "cha" | null;
  /** The one subclass the SRD publishes for this class. */
  srdSubclass: string;
};

export const CLASSES: Record<ClassSlug, ClassInfo> = {
  barbarian: {
    name: "Barbarian",
    hitDie: 12,
    saves: ["str", "con"],
    skillChoices: {
      n: 2,
      from: ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"],
    },
    castingAbility: null,
    srdSubclass: "Path of the Berserker",
  },
  bard: {
    name: "Bard",
    hitDie: 8,
    saves: ["dex", "cha"],
    // "Choose any three skills" — the one class whose list is the whole list.
    skillChoices: { n: 3, from: ALL_SKILLS },
    castingAbility: "cha",
    srdSubclass: "College of Lore",
  },
  cleric: {
    name: "Cleric",
    hitDie: 8,
    saves: ["wis", "cha"],
    skillChoices: { n: 2, from: ["History", "Insight", "Medicine", "Persuasion", "Religion"] },
    castingAbility: "wis",
    srdSubclass: "Life Domain",
  },
  druid: {
    name: "Druid",
    hitDie: 8,
    saves: ["intel", "wis"],
    skillChoices: {
      n: 2,
      from: [
        "Arcana",
        "Animal Handling",
        "Insight",
        "Medicine",
        "Nature",
        "Perception",
        "Religion",
        "Survival",
      ],
    },
    castingAbility: "wis",
    srdSubclass: "Circle of the Land",
  },
  fighter: {
    name: "Fighter",
    hitDie: 10,
    saves: ["str", "con"],
    skillChoices: {
      n: 2,
      from: [
        "Acrobatics",
        "Animal Handling",
        "Athletics",
        "History",
        "Insight",
        "Intimidation",
        "Perception",
        "Survival",
      ],
    },
    castingAbility: null,
    srdSubclass: "Champion",
  },
  monk: {
    name: "Monk",
    hitDie: 8,
    saves: ["str", "dex"],
    skillChoices: {
      n: 2,
      from: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"],
    },
    castingAbility: null,
    srdSubclass: "Way of the Open Hand",
  },
  paladin: {
    name: "Paladin",
    hitDie: 10,
    saves: ["wis", "cha"],
    skillChoices: {
      n: 2,
      from: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"],
    },
    castingAbility: "cha",
    srdSubclass: "Oath of Devotion",
  },
  ranger: {
    name: "Ranger",
    hitDie: 10,
    saves: ["str", "dex"],
    skillChoices: {
      n: 3,
      from: [
        "Animal Handling",
        "Athletics",
        "Insight",
        "Investigation",
        "Nature",
        "Perception",
        "Stealth",
        "Survival",
      ],
    },
    castingAbility: "wis",
    srdSubclass: "Hunter",
  },
  rogue: {
    name: "Rogue",
    hitDie: 8,
    saves: ["dex", "intel"],
    skillChoices: {
      n: 4,
      from: [
        "Acrobatics",
        "Athletics",
        "Deception",
        "Insight",
        "Intimidation",
        "Investigation",
        "Perception",
        "Performance",
        "Persuasion",
        "Sleight of Hand",
        "Stealth",
      ],
    },
    castingAbility: null,
    srdSubclass: "Thief",
  },
  sorcerer: {
    name: "Sorcerer",
    hitDie: 6,
    saves: ["con", "cha"],
    skillChoices: {
      n: 2,
      from: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"],
    },
    castingAbility: "cha",
    srdSubclass: "Draconic Bloodline",
  },
  warlock: {
    name: "Warlock",
    hitDie: 8,
    saves: ["wis", "cha"],
    skillChoices: {
      n: 2,
      from: [
        "Arcana",
        "Deception",
        "History",
        "Intimidation",
        "Investigation",
        "Nature",
        "Religion",
      ],
    },
    castingAbility: "cha",
    srdSubclass: "The Fiend",
  },
  wizard: {
    name: "Wizard",
    hitDie: 6,
    saves: ["intel", "wis"],
    skillChoices: {
      n: 2,
      from: ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"],
    },
    castingAbility: "intel",
    srdSubclass: "School of Evocation",
  },
};

/** The book's entry for a written class line, or null when nothing matches. */
export function classInfo(klass: string | null | undefined): ClassInfo | null {
  const slug = matchClass(klass);
  return slug ? CLASSES[slug] : null;
}

/**
 * The ability a written class casts with — null for a martial, and null again
 * for a homebrew name no table but its own has heard of.
 */
export function castingAbilityFor(klass: string | null | undefined): AbilityKey | null {
  return classInfo(klass)?.castingAbility ?? null;
}

/** What a spell save and a spell attack come to, and which ability said so. */
export type Spellcasting = { ability: AbilityKey; dc: number; attack: number };

/**
 * The two numbers every caster writes at the top of their sheet and then
 * mis-copies for the rest of the campaign.
 *
 * Both are one sum wearing two hats — proficiency plus the casting modifier,
 * with the DC starting from 8 — which is exactly why they are worth computing
 * rather than typing: a level-up moves them together or not at all.
 *
 * `scores` is what the character is actually playing with, so a caller holding
 * worn gear should pass the *effective* scores (lib/dnd.ts `statBlock` folds
 * bonuses and floors in) rather than the stored ones — an amulet that raises
 * WIS raises the cleric's save DC with it.
 *
 * The six may be half-answered, which is why they are typed as loosely as they
 * are: the character builder asks this question of a form the player is still
 * filling in, and a wizard with no Intelligence written down yet is a wizard
 * whose DC cannot be stated. Null is that, and also "this sheet has no
 * spellcasting to describe" — a barbarian, or a class line nothing recognises.
 * Both are the same answer to the caller: say nothing.
 */
export function spellcasting(
  klass: string | null | undefined,
  level: number,
  scores: Record<AbilityKey, number | null | undefined>
): Spellcasting | null {
  const ability = castingAbilityFor(klass);
  if (!ability) return null;
  const score = scores[ability];
  if (score === null || score === undefined) return null;
  const bonus = profBonus(level) + mod(score);
  return { ability, dc: 8 + bonus, attack: bonus };
}

/**
 * The hit points the book would hand a character of this class and level.
 *
 * Level 1 is the whole die; every level after it is the *average* roll rounded
 * up — a d8 gives 5, a d10 gives 6 — which is the fixed-value option the rules
 * offer beside rolling. Constitution applies once per level, the first
 * included, so a level 5 warlock with CON 14 reads 8+2 + 4×(5+2) = 38.
 *
 * Rolled hit points are a table's own business: this is only ever the default
 * offered to a blank field, and the number stays editable forever after.
 */
export function averageHp(hitDie: number, level: number, conMod: number): number {
  const perLevel = Math.floor(hitDie / 2) + 1 + conMod;
  return hitDie + conMod + Math.max(level - 1, 0) * perLevel;
}
