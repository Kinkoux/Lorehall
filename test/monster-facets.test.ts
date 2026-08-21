import { describe, expect, it } from "vitest";

import {
  MONSTER_SIZES,
  MONSTER_TYPES,
  monsterBaseType,
  searchMonsters,
} from "@/lib/srd-data";

/**
 * The monster list could only be narrowed by name and CR, while every stat
 * block also states a type and a size. Both are prose in the data — "fiend
 * (devil)", "swarm of Tiny beasts" — so the facets only work if the reading of
 * that prose holds.
 */

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("monsterBaseType", () => {
  it("folds the parenthetical sub-race away and files swarms on their own", () => {
    expect(monsterBaseType("fiend (devil)")).toBe("fiend");
    expect(monsterBaseType("humanoid (any race)")).toBe("humanoid");
    expect(monsterBaseType("swarm of Tiny beasts")).toBe("swarm");
    expect(monsterBaseType("dragon")).toBe("dragon");
  });

  it("offers a dropdown-sized list of types, and the sizes in game order", () => {
    // 33 distinct strings in the data collapse to the SRD's creature types.
    expect(MONSTER_TYPES.length).toBeLessThan(20);
    expect(MONSTER_TYPES).toContain("fiend");
    expect(MONSTER_TYPES).toContain("swarm");
    expect(MONSTER_TYPES).not.toContain("fiend (devil)");
    expect(MONSTER_SIZES).toEqual([
      "Tiny",
      "Small",
      "Medium",
      "Large",
      "Huge",
      "Gargantuan",
    ]);
  });
});

describe("searchMonsters facets", () => {
  it("matches the base type, so one bucket catches every sub-race of it", () => {
    const fiends = searchMonsters("", "", "fiend");
    expect(names(fiends)).toContain("Imp"); // fiend (devil)
    expect(names(fiends)).toContain("Dretch"); // fiend (demon)
    expect(names(fiends)).toContain("Hell Hound"); // plain fiend
    // A swarm of beasts is a swarm here, not a beast.
    expect(names(searchMonsters("", "", "beast"))).not.toContain("Swarm of Rats");
    expect(names(searchMonsters("", "", "swarm"))).toContain("Swarm of Rats");
  });

  it("matches size case-insensitively and stacks with the other filters", () => {
    expect(searchMonsters("", "", "", "Tiny")).toEqual(searchMonsters("", "", "", "tiny"));
    expect(searchMonsters("", "", "", "Tiny").every((m) => m.size === "Tiny")).toBe(true);

    const tinyFiends = searchMonsters("", "", "fiend", "tiny");
    expect(names(tinyFiends)).toContain("Imp");
    expect(names(tinyFiends)).not.toContain("Hell Hound"); // Medium

    const huge13 = searchMonsters("dragon", "13", "dragon", "Huge");
    expect(huge13.length).toBeGreaterThan(0);
    expect(huge13.every((m) => m.crLabel === "13" && m.size === "Huge")).toBe(true);
  });

  it("leaves the result set alone when a facet is not asked for", () => {
    const byName = searchMonsters("goblin", "");
    expect(byName).toEqual(searchMonsters("goblin", "", "", ""));
    expect(searchMonsters("", "", "no-such-type")).toEqual([]);
  });
});
