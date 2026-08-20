import type { Character } from "@/lib/db";
import { SKILLS } from "@/lib/srd";
import { STAT_LABELS, type StatBonuses } from "@/lib/world-items";

export const ABILITIES = ["str", "dex", "con", "intel", "wis", "cha"] as const;
export type AbilityKey = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  intel: "INT",
  wis: "WIS",
  cha: "CHA",
};

/**
 * The sheet spells intelligence `intel` (SQL keyword) while an item's bonus
 * JSON spells it `int`. One map, stated once, rather than a rename that would
 * touch every column and every stored bonus.
 */
const BONUS_KEY: Record<AbilityKey, "str" | "dex" | "con" | "int" | "wis" | "cha"> = {
  str: "str",
  dex: "dex",
  con: "con",
  intel: "int",
  wis: "wis",
  cha: "cha",
};

const SKILL_ABILITY_KEY: Record<string, AbilityKey> = {
  STR: "str",
  DEX: "dex",
  INT: "intel",
  WIS: "wis",
  CHA: "cha",
};

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
export const profBonus = (level: number) => 2 + Math.floor((level - 1) / 4);

/**
 * Armour class, shown as a sum rather than a verdict.
 *
 * The number on the badge is one addition of several terms, and a player who
 * cannot see the terms cannot tell a working sheet from a broken one — "why
 * is it 17?" is the question the breakdown answers. The parts are built by
 * effectiveAc() in lib/armor.ts; the shape and the wording live here so a
 * component can render them without dragging the SRD's JSON into its chunk.
 *
 * `kind` is what the term *is*, so a caller can single out the share that came
 * from equipment; `label` is null for the base, which reads as a bare number.
 */
export type AcPart = {
  kind: "base" | "dex" | "shield" | "item";
  label: string | null;
  value: number;
};

export type AcBreakdown = {
  /** NULL when the sheet has nothing to compute an AC from at all. */
  value: number | null;
  parts: AcPart[];
};

/** "11 + DEX 3 + Shield 2 + Ring of Protection 1" — the badge's tooltip. */
export function acTitle(ac: AcBreakdown): string {
  return ac.parts
    .map((part) => (part.label === null ? `${part.value}` : `${part.label} ${part.value}`))
    .join(" + ");
}

/** What the worn pieces contribute — the shield and every flat AC bonus. */
export function acGearBonus(ac: AcBreakdown): number {
  return ac.parts
    .filter((part) => part.kind === "shield" || part.kind === "item")
    .reduce((sum, part) => sum + part.value, 0);
}

/** The label a DEX term wears in a breakdown. */
export const AC_DEX_LABEL = STAT_LABELS.dex;

export function hasScores(character: Character) {
  return ABILITIES.every((a) => character[a] !== null);
}

const csv = (value: string | null) =>
  (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Computed stat block for a sheet with all six scores filled in.
 *
 * `bonuses` is what the character is *wearing* (docs/design-economy.md phase
 * 3): flat integers folded in before anything downstream is derived, so a ring
 * of +2 DEX moves the modifier, the saves, the skills and passive Perception
 * together instead of quietly moving only the number on the tile. Nothing here
 * is written back — the stored scores stay the character's own, and taking the
 * ring off restores them by arithmetic rather than by an undo.
 */
export function statBlock(character: Character, bonuses: StatBonuses = {}) {
  const pb = profBonus(character.level);
  const profSkills = new Set(csv(character.profSkills));
  const profSaves = new Set(csv(character.profSaves));

  const abilities = ABILITIES.map((key) => {
    const base = character[key] as number;
    const bonus = bonuses[BONUS_KEY[key]] ?? 0;
    return {
      key,
      label: ABILITY_LABELS[key],
      base,
      bonus,
      score: base + bonus,
      mod: mod(base + bonus),
    };
  });

  const saves = abilities.map((a) => ({
    label: a.label,
    proficient: profSaves.has(a.key),
    bonus: a.mod + (profSaves.has(a.key) ? pb : 0),
  }));

  // Skills read the *worn* modifier, not the stored one: a ring of +2 DEX has
  // to move Stealth and passive Perception along with the tile, or the sheet
  // quietly contradicts itself about what the character can do.
  const modByAbility = new Map(abilities.map((a) => [a.key, a.mod] as const));

  const skills = SKILLS.map((skill) => {
    const key = SKILL_ABILITY_KEY[skill.ability];
    const base = modByAbility.get(key) ?? 0;
    const proficient = profSkills.has(skill.name);
    return {
      name: skill.name,
      ability: skill.ability,
      proficient,
      bonus: base + (proficient ? pb : 0),
    };
  });

  const perception = skills.find((s) => s.name === "Perception");
  return {
    profBonus: pb,
    abilities,
    saves,
    skills,
    passivePerception: 10 + (perception?.bonus ?? 0),
  };
}
