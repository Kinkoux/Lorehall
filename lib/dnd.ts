import type { Character } from "@/lib/db";
import { SKILLS } from "@/lib/srd";

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

/** Computed stat block for a sheet with all six scores filled in. */
export function statBlock(character: Character) {
  const pb = profBonus(character.level);
  const profSkills = new Set(csv(character.profSkills));
  const profSaves = new Set(csv(character.profSaves));

  const abilities = ABILITIES.map((key) => ({
    key,
    label: ABILITY_LABELS[key],
    score: character[key] as number,
    mod: mod(character[key] as number),
  }));

  const saves = abilities.map((a) => ({
    label: a.label,
    proficient: profSaves.has(a.key),
    bonus: a.mod + (profSaves.has(a.key) ? pb : 0),
  }));

  const skills = SKILLS.map((skill) => {
    const key = SKILL_ABILITY_KEY[skill.ability];
    const base = mod(character[key] as number);
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
