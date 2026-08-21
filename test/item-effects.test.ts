import { describe, expect, it } from "vitest";

import type { Character } from "@/lib/db";
import { abilityScore, statBlock } from "@/lib/dnd";
import { effectiveAc, type WornForAc } from "@/lib/armor";
import { ITEM_EFFECTS, ITEMS, getItem, magicAcBonus, srdItemBonuses } from "@/lib/srd-data";
import {
  ABILITY_STATS,
  parseStatBonuses,
  parseStatFloors,
  stringifyStatBonuses,
  sumStatBonuses,
} from "@/lib/world-items";
import { planRow, snapshotFor } from "../scripts/backfill-item-effects.mjs";

/**
 * Scores an item *sets* rather than adds to — "Your Strength score is 19 while
 * you wear these gauntlets" — and the curated reading of the SRD's prose that
 * puts them on a sheet. Two halves of one feature: the arithmetic, and the
 * table of sentences it is arithmetic *about*.
 */

/** A sheet with the six scores and nothing proficient, for pure statBlock maths. */
const hero = (scores: Partial<Record<"str" | "dex" | "con" | "intel" | "wis" | "cha", number>>) =>
  ({
    level: 1,
    profSkills: "",
    profSaves: "",
    str: 10,
    dex: 10,
    con: 10,
    intel: 10,
    wis: 10,
    cha: 10,
    ...scores,
  }) as unknown as Character;

/** The stored JSON an item with these mechanics would carry. */
const grants = (bonuses: Record<string, number>, floors?: Record<string, number>) =>
  JSON.stringify(floors ? { ...bonuses, floors } : bonuses);

const scoreOf = (block: ReturnType<typeof statBlock>, key: string) =>
  block.abilities.find((a) => a.key === key);

describe("abilityScore", () => {
  it("takes the larger of the raised score and the floor", () => {
    expect(abilityScore(8, 0, 19)).toBe(19);
    expect(abilityScore(20, 0, 19)).toBe(20);
    // The belt states 21; a +2 ring on top of it reads 21, not 23 — the floor
    // is a floor, not a base to pile onto.
    expect(abilityScore(16, 2, 21)).toBe(21);
    // …until the flat bonuses carry the score past it on their own.
    expect(abilityScore(20, 2, 21)).toBe(22);
  });

  it("is plain addition when nothing states a floor", () => {
    expect(abilityScore(14, 2)).toBe(16);
    expect(abilityScore(14, -2)).toBe(12);
    expect(abilityScore(14)).toBe(14);
  });
});

describe("sumStatBonuses with floors", () => {
  it("keeps the highest floor rather than adding them", () => {
    const worn = sumStatBonuses([
      grants({}, { str: 19 }), // gauntlets of ogre power
      grants({}, { str: 21 }), // belt of hill giant strength
    ]);
    expect(worn.floors).toEqual({ str: 21 });
  });

  it("carries floors and flat bonuses side by side", () => {
    const worn = sumStatBonuses([grants({ ac: 1 }, { con: 19 }), grants({ str: 2, ac: 1 })]);
    expect(worn.ac).toBe(2);
    expect(worn.str).toBe(2);
    expect(worn.floors).toEqual({ con: 19 });
  });

  it("leaves the key off entirely when no piece states one", () => {
    // The old shape, unchanged: this is what every stored row looks like.
    expect(sumStatBonuses([grants({ ac: 1, str: 2 })])).toEqual({ ac: 1, str: 2 });
    expect(sumStatBonuses([null, undefined])).toEqual({});
  });

  it("reads a floor out of gibberish as distrustingly as a bonus", () => {
    expect(parseStatFloors(JSON.stringify({ floors: { str: "19", ac: 30, xp: 4 } }))).toEqual({});
    expect(parseStatFloors(JSON.stringify({ floors: [19] }))).toEqual({});
    expect(parseStatFloors("not json")).toEqual({});
    // Out of 5e's 1–30 is clamped to the nearest score a creature could have.
    expect(parseStatFloors(JSON.stringify({ floors: { str: 99, dex: -4 } }))).toEqual({
      str: 30,
      dex: 1,
    });
  });

  it("round-trips through the writer", () => {
    const stored = stringifyStatBonuses({ ac: 1, str: 2 }, { con: 19 });
    expect(parseStatBonuses(stored)).toEqual({ ac: 1, str: 2, floors: { con: 19 } });
    // Nothing to say is NULL, not an empty object.
    expect(stringifyStatBonuses({}, {})).toBeNull();
    expect(stringifyStatBonuses(null)).toBeNull();
    // The flat clamp still holds, and it does not disturb the floors.
    expect(stringifyStatBonuses({ ac: 50 }, { str: 19 })).toBe(
      JSON.stringify({ ac: 10, floors: { str: 19 } })
    );
  });
});

describe("statBlock under a floor", () => {
  it("moves the modifier, the save and the skill together", () => {
    const stats = statBlock(hero({ str: 8 }), sumStatBonuses([grants({}, { str: 19 })]));
    const str = scoreOf(stats, "str");
    expect(str?.score).toBe(19);
    expect(str?.mod).toBe(4);
    // The tile reports the difference the gear made, so the highlight is honest.
    expect(str?.bonus).toBe(11);
    expect(stats.saves.find((s) => s.label === "STR")?.bonus).toBe(4);
    expect(stats.skills.find((s) => s.name === "Athletics")?.bonus).toBe(4);
  });

  it("does nothing to a character who is already stronger", () => {
    const stats = statBlock(hero({ str: 20 }), sumStatBonuses([grants({}, { str: 19 })]));
    expect(scoreOf(stats, "str")?.score).toBe(20);
    expect(scoreOf(stats, "str")?.bonus).toBe(0);
  });

  it("floors WIS into passive Perception", () => {
    const stats = statBlock(hero({ wis: 10 }), sumStatBonuses([grants({}, { wis: 19 })]));
    expect(stats.passivePerception).toBe(14);
  });

  it("reads floors handed over separately, and prefers them to the ones inside", () => {
    const stats = statBlock(hero({ intel: 10 }), {}, { int: 19 });
    expect(scoreOf(stats, "intel")?.score).toBe(19);
    const overridden = statBlock(hero({ intel: 10 }), { floors: { int: 19 } }, {});
    expect(scoreOf(overridden, "intel")?.score).toBe(10);
  });

  it("leaves a bonus-only sheet exactly where it was", () => {
    const stats = statBlock(hero({ dex: 14 }), { dex: 2 });
    expect(scoreOf(stats, "dex")?.score).toBe(16);
    expect(scoreOf(stats, "dex")?.bonus).toBe(2);
  });
});

describe("effectiveAc under a DEX floor", () => {
  const stone = (statBonuses: string): WornForAc => ({
    name: "Ioun Stone",
    slot: "head",
    srdIndex: null,
    statBonuses,
  });

  it("moves the DEX term of a light-armour formula", () => {
    // Leather armour is 11 + DEX; a DEX of 10 alone would make that 11.
    const worn = [stone(grants({}, { dex: 19 }))];
    const bonuses = sumStatBonuses(worn.map((piece) => piece.statBonuses));
    const ac = effectiveAc({ armorClass: null, dex: 10 }, worn, bonuses);
    expect(ac.parts.find((p) => p.kind === "dex")?.value).toBe(4);
    // 10 (unarmoured base) + 4.
    expect(ac.value).toBe(14);
  });

  it("respects the medium-armour cap the same way a flat bonus does", () => {
    const worn: WornForAc[] = [
      { name: "Half Plate", slot: "armor", srdIndex: "half-plate-armor", statBonuses: null },
      stone(grants({}, { dex: 19 })),
    ];
    const bonuses = sumStatBonuses(worn.map((piece) => piece.statBonuses));
    // 15 + min(4, 2).
    expect(effectiveAc({ armorClass: null, dex: 10 }, worn, bonuses).value).toBe(17);
  });

  it("still adds nothing when no piece states one", () => {
    expect(effectiveAc({ armorClass: 15, dex: 16 }, []).value).toBe(15);
  });
});

describe("the curated reading of the SRD's prose", () => {
  it("stamps an amulet of health with the score it sets", () => {
    const stored = srdItemBonuses(getItem("amulet-of-health")!);
    expect(parseStatBonuses(stored)).toEqual({ floors: { con: 19 } });
  });

  it("gives every belt of giant strength its own score", () => {
    const floorOf = (index: string) => parseStatFloors(srdItemBonuses(getItem(index)!)).str;
    expect(floorOf("belt-of-giant-strength-hill")).toBe(21);
    expect(floorOf("belt-of-giant-strength-stone")).toBe(23);
    expect(floorOf("belt-of-giant-strength-frost")).toBe(23);
    expect(floorOf("belt-of-giant-strength-fire")).toBe(25);
    expect(floorOf("belt-of-giant-strength-cloud")).toBe(27);
    expect(floorOf("belt-of-giant-strength-storm")).toBe(29);
    // The catalog entry states no number, so it grants none.
    expect(srdItemBonuses(getItem("belt-of-giant-strength")!)).toBeNull();
  });

  it("counts a ring of protection once, not once per reader", () => {
    const item = getItem("ring-of-protection")!;
    // The prose parser can still see the sentence…
    expect(magicAcBonus(item)).toBe(1);
    // …but the table answers first, and it answers +1 — never +2.
    expect(parseStatBonuses(srdItemBonuses(item))).toEqual({ ac: 1 });
  });

  it("refuses the bonuses that come with a condition attached", () => {
    for (const index of ["bracers-of-defense", "arrow-catching-shield", "rod-of-alertness"]) {
      const item = getItem(index)!;
      // The regex reads the number; the curated entry is what stops it.
      expect(magicAcBonus(item)).not.toBeNull();
      expect(srdItemBonuses(item)).toBeNull();
    }
  });

  it("falls back to the prose only for an entry the table says nothing about", () => {
    expect(ITEM_EFFECTS["shield"]).toBeUndefined();
    expect(srdItemBonuses(getItem("shield")!)).toBeNull();
    expect(srdItemBonuses(getItem("longsword")!)).toBeNull();
  });

  it("names only real SRD entries, and states only things the model can hold", () => {
    const known = new Set(ITEMS.map((item) => item.index));
    for (const [index, effect] of Object.entries(ITEM_EFFECTS)) {
      expect(known.has(index), index).toBe(true);
      for (const stat of Object.keys(effect.floors ?? {})) {
        expect(ABILITY_STATS as readonly string[]).toContain(stat);
      }
      // Nothing survives the writer's limits by accident: what the table says
      // and what a sheet would store are the same numbers.
      const stored = stringifyStatBonuses(effect.bonuses, effect.floors);
      const declared = effect.bonuses || effect.floors ? stored : null;
      expect(stored).toBe(declared);
    }
  });
});

describe("the backfill's plan", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "row1",
    srd_index: "amulet-of-health",
    stat_bonuses: null,
    ...over,
  });

  it("stamps a bare SRD line", () => {
    expect(planRow(row())).toEqual({
      id: "row1",
      srdIndex: "amulet-of-health",
      statBonuses: JSON.stringify({ floors: { con: 19 } }),
    });
  });

  it("leaves a line a player has already stated numbers for alone", () => {
    expect(planRow(row({ stat_bonuses: JSON.stringify({ ac: 3 }) }))).toBeNull();
    // Even an empty object is somebody's answer, not an absence of one.
    expect(planRow(row({ stat_bonuses: "{}" }))).toBeNull();
  });

  it("leaves alone what it has nothing to say about", () => {
    expect(planRow(row({ srd_index: null }))).toBeNull();
    expect(planRow(row({ srd_index: "longsword" }))).toBeNull();
    expect(planRow(row({ srd_index: "bracers-of-defense" }))).toBeNull();
  });

  it("writes the same snapshot the app would", () => {
    for (const index of Object.keys(ITEM_EFFECTS)) {
      expect(snapshotFor(index), index).toBe(srdItemBonuses(getItem(index)!));
    }
  });
});
