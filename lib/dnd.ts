import type { Character } from "@/lib/db";
// The leaf index rather than lib/srd.ts's full entries: every skill this
// module touches is touched for its name and its ability, and the compendium's
// own entries carry two locales of description apiece. Client components
// import this file for `mod` and `fmt` alone, and a bundler cannot drop a
// field off an object it is handed whole — so the prose would ride along into
// the browser to compute an integer.
import { SKILL_INDEX } from "@/lib/skill-index";
import { STAT_LABELS, type AbilityFloors, type StatBonuses } from "@/lib/world-items";

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

/**
 * The score a character is actually playing with: what the sheet stores, plus
 * what the gear adds, floored by what the gear *sets*.
 *
 * The max is the whole rule. "Your Strength score is 19 … it has no effect if
 * your Strength is already 19 or higher" and "changes to 21 … no effect if
 * already equal or greater" are the same sentence, and both are satisfied by
 * taking the larger of the two numbers. A raised score wins on its own merits:
 * a STR 20 barbarian in gauntlets of ogre power stays at 20, and adding a ring
 * of +2 STR on top of a belt that sets 21 gives 22 rather than 23 — the belt's
 * statement is a floor, not a base to pile onto.
 */
export function abilityScore(base: number, bonus = 0, floor?: number): number {
  const raised = base + bonus;
  return floor !== undefined && floor > raised ? floor : raised;
}
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

/**
 * What a creature *looks* like, for a table where the DM never reads a
 * monster's hit points out loud. The four words are the whole vocabulary —
 * they are the dictionary keys under `session.combatant.condition`, so the
 * ratio is turned into language exactly once, here, instead of in the markup.
 *
 * NULL is "say nothing": a creature with no maximum has no ratio to describe,
 * and inventing a word for it would leak more than the number would.
 */
export type HpCondition = "unscathed" | "wounded" | "badlyWounded" | "down";

export function hpCondition(hp: number | null, maxHp: number | null): HpCondition | null {
  if (hp === null || !maxHp || maxHp <= 0) return null;
  if (hp <= 0) return "down";
  const ratio = hp / maxHp;
  if (ratio > 0.75) return "unscathed";
  if (ratio >= 0.4) return "wounded";
  return "badlyWounded";
}

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
 *
 * `floors` is the other half of the same sentence: the scores worn gear *sets*
 * (amulet of health, a belt of giant strength). It defaults to the ones the
 * bonuses arrived carrying, so every existing caller folds them in without
 * knowing they exist; passing it explicitly is for a caller holding the two
 * apart. Either way `bonus` on each ability is the difference the gear made —
 * a STR 8 wizard in gauntlets of ogre power reads 19 (+11), which is what the
 * tile's highlight is for.
 */
export function statBlock(
  character: Character,
  bonuses: StatBonuses = {},
  floors: AbilityFloors = bonuses.floors ?? {}
) {
  const pb = profBonus(character.level);
  const profSkills = new Set(csv(character.profSkills));
  const profSaves = new Set(csv(character.profSaves));

  const abilities = ABILITIES.map((key) => {
    const base = character[key] as number;
    const score = abilityScore(base, bonuses[BONUS_KEY[key]] ?? 0, floors[BONUS_KEY[key]]);
    return {
      key,
      label: ABILITY_LABELS[key],
      base,
      bonus: score - base,
      score,
      mod: mod(score),
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

  const skills = SKILL_INDEX.map((skill) => {
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

/**
 * The compendium fields a weapon's attack line is read off — a structural
 * shape rather than `SrdItem` itself, so this module stays clear of
 * lib/srd-data.ts and its megabyte of JSON. A hand-typed line has no entry at
 * all and passes null, which is a case the rules below answer rather than
 * refuse.
 */
export type WeaponRef = {
  /** The subcategory line: "Simple Melee", "Martial Ranged". */
  sub?: string | null;
  /** Comma-joined properties; "Finesse" is the one that changes the answer. */
  properties?: string | null;
  /** The dice line as the book writes it — "1d8 slashing". */
  damage?: string | null;
};

export type WeaponAttack = {
  /** Which ability the swing is read off, or null with no modifiers to read. */
  ability: "str" | "dex" | null;
  /** Proficiency plus that modifier, or null when the scores are not all in. */
  bonus: number | null;
  /** The book's damage line, or a dash for a weapon nothing has heard of. */
  damage: string;
};

/**
 * Which ability a weapon swings with, and what that comes to on the die.
 *
 * The ladder is the book's, in the order the book applies it:
 *
 *   ranged  — anything whose subcategory says so is Dexterity, full stop;
 *   finesse — the wielder picks, which the sheet reads as the better of two;
 *   else    — Strength, the default a weapon has when it says nothing.
 *
 * `mods` wants the *worn* modifiers rather than the stored ones, the way
 * `statBlock` hands them out: a belt of giant strength moves the greataxe row
 * with the tile above it. Either being null means the sheet's six scores are
 * not all filled in, and the answer is silence — a `+0` on a blank sheet reads
 * as a fact rather than as an absence.
 *
 * Proficiency is counted in unconditionally, because the SRD grants weapon
 * proficiency by class and background and this sheet models neither. A monk
 * holding a halberd is a conversation with a DM, not a number to withhold.
 *
 * Lives here rather than in the card that draws it because it is arithmetic
 * about a character and a weapon, which is this module's whole subject, and
 * because the next surface that wants an attack line — a statistics block, a
 * table view — should not have to copy a four-branch conditional to get one.
 */
export function weaponAttack(
  weapon: WeaponRef | null | undefined,
  mods: { str: number | null; dex: number | null },
  profBonus: number
): WeaponAttack {
  const damage = weapon?.damage ?? "—";
  const { str, dex } = mods;
  if (str === null || dex === null) return { ability: null, bonus: null, damage };

  const ranged = (weapon?.sub ?? "").includes("Ranged");
  const finesse = (weapon?.properties ?? "").toLowerCase().includes("finesse");
  const ability: "str" | "dex" = ranged || (finesse && dex > str) ? "dex" : "str";
  return { ability, bonus: profBonus + (ability === "dex" ? dex : str), damage };
}
