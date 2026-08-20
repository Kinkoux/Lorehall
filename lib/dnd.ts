import type { Character } from "@/lib/db";
import { SKILLS } from "@/lib/srd";
import type { StatBonuses } from "@/lib/world-items";

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
