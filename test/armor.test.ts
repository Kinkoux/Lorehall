import { describe, expect, it } from "vitest";

import { effectiveAc, type WornForAc } from "@/lib/armor";
import { acGearBonus, acTitle } from "@/lib/dnd";
import { ITEMS, getItem, parseArmorAc, type SrdItem } from "@/lib/srd-data";

/**
 * The armour rules, which the sheet had none of: every piece of SRD armour
 * states its class as prose ("11 + Dex"), so a character in leather was as
 * exposed as one in nothing until something read the sentence.
 */

/** An SRD entry, as an equipped inventory line would carry it. */
const worn = (srdIndex: string, slot: WornForAc["slot"], statBonuses: string | null = null) => ({
  name: getItem(srdIndex)?.name ?? srdIndex,
  slot,
  srdIndex,
  statBonuses,
});

/** A hand-typed line: no source, so no formula — only its flat bonuses. */
const plain = (name: string, slot: WornForAc["slot"], statBonuses: string | null = null) => ({
  name,
  slot,
  srdIndex: null,
  statBonuses,
});

const acOf = (index: string) => parseArmorAc(getItem(index) as SrdItem);

describe("parseArmorAc", () => {
  it("reads light armour as base plus the whole DEX modifier", () => {
    expect(acOf("leather-armor")).toEqual({ kind: "armor", base: 11, dex: "full" });
  });

  it("reads medium armour as base plus DEX, capped at +2", () => {
    expect(acOf("half-plate-armor")).toEqual({ kind: "armor", base: 15, dex: "capped2" });
  });

  it("reads heavy armour as a flat number that ignores DEX", () => {
    expect(acOf("chain-mail")).toEqual({ kind: "armor", base: 16, dex: "none" });
  });

  it("reads a shield's number as a bonus, not an armour class", () => {
    expect(acOf("shield")).toEqual({ kind: "shield", shieldBonus: 2 });
  });

  it("has an answer for every piece of armour in the compendium", () => {
    const armour = ITEMS.filter((item) => item.category === "armor");
    // 13 entries across four shapes of wording — a new one appearing unparsed
    // is exactly the regression this catches.
    expect(armour).toHaveLength(13);
    expect(armour.filter((item) => parseArmorAc(item) === null)).toEqual([]);
  });

  it("says nothing about things that are not armour", () => {
    expect(parseArmorAc(getItem("longsword") as SrdItem)).toBeNull();
  });

  const shaped = (ac: string, sub: string | null = "Light"): SrdItem =>
    ({ ...(getItem("leather-armor") as SrdItem), ac, sub }) as SrdItem;

  it("tolerates spacing, case and the fuller spellings", () => {
    expect(parseArmorAc(shaped("  12 + DEX  "))).toEqual({
      kind: "armor",
      base: 12,
      dex: "full",
    });
    expect(parseArmorAc(shaped("13 + Dexterity modifier (Max. 2)", "Medium"))).toEqual({
      kind: "armor",
      base: 13,
      dex: "capped2",
    });
  });

  it("refuses wording it does not understand rather than guessing", () => {
    // A cap the SRD never writes, and a sentence: both fall through to the
    // armour class the player typed in by hand.
    expect(parseArmorAc(shaped("13 + Dex (max 3)", "Medium"))).toBeNull();
    expect(parseArmorAc(shaped("as unarmoured, plus a blessing"))).toBeNull();
    expect(parseArmorAc(shaped(""))).toBeNull();
  });
});

describe("effectiveAc", () => {
  const nimble = { armorClass: null, dex: 16 }; // +3
  const clumsy = { armorClass: null, dex: 8 }; // −1
  const blank = { armorClass: null, dex: null };

  it("puts worn armour first, over the sheet's own field", () => {
    const ac = effectiveAc({ armorClass: 15, dex: 16 }, [worn("leather-armor", "armor")]);
    expect(ac.value).toBe(14);
    expect(acTitle(ac)).toBe("11 + DEX 3");
  });

  it("caps the DEX share of medium armour at +2", () => {
    expect(effectiveAc(nimble, [worn("half-plate-armor", "armor")]).value).toBe(17);
  });

  it("still applies a DEX penalty under medium armour", () => {
    expect(effectiveAc(clumsy, [worn("chain-shirt", "armor")]).value).toBe(12);
  });

  it("ignores DEX entirely under heavy armour, penalty and all", () => {
    expect(effectiveAc(clumsy, [worn("chain-mail", "armor")]).value).toBe(16);
    expect(effectiveAc(nimble, [worn("chain-mail", "armor")]).value).toBe(16);
  });

  it("gives a sheet with no ability scores the armour's base alone", () => {
    const ac = effectiveAc(blank, [worn("leather-armor", "armor")]);
    expect(ac.value).toBe(11);
    expect(acTitle(ac)).toBe("11");
  });

  it("adds the shield in hand on top of whatever else is worn", () => {
    const ac = effectiveAc(nimble, [worn("leather-armor", "armor"), worn("shield", "hands")]);
    expect(ac.value).toBe(16);
    expect(acTitle(ac)).toBe("11 + DEX 3 + Shield 2");
    expect(acGearBonus(ac)).toBe(2);
  });

  it("adds every flat AC bonus, and names what granted it", () => {
    const ac = effectiveAc(nimble, [
      worn("leather-armor", "armor"),
      plain("Ring of Protection", "ring", JSON.stringify({ ac: 1 })),
      plain("Cloak of Displacement", "neck", JSON.stringify({ ac: 2, str: 1 })),
    ]);
    expect(ac.value).toBe(17);
    expect(acTitle(ac)).toBe("11 + DEX 3 + Ring of Protection 1 + Cloak of Displacement 2");
    expect(acGearBonus(ac)).toBe(3);
  });

  it("moves with a worn DEX bonus, the same way the stat block does", () => {
    // A ring of +2 DEX takes the score from 16 to 18: +3 becomes +4.
    const ac = effectiveAc(nimble, [worn("leather-armor", "armor")], { dex: 2 });
    expect(ac.value).toBe(15);
  });

  it("falls back to the armour class someone typed into the sheet", () => {
    const ac = effectiveAc({ armorClass: 15, dex: 16 }, [worn("shield", "hands")]);
    expect(ac.value).toBe(17);
    expect(acTitle(ac)).toBe("15 + Shield 2");
  });

  it("falls back again to the unarmoured 10 + DEX", () => {
    const ac = effectiveAc(nimble, []);
    expect(ac.value).toBe(13);
    expect(acTitle(ac)).toBe("10 + DEX 3");
  });

  it("answers null when the sheet gives it nothing to work with", () => {
    expect(effectiveAc(blank, [])).toEqual({ value: null, parts: [] });
    // A shield alone is not an armour class — there is nothing to add it to.
    expect(effectiveAc(blank, [worn("shield", "hands")]).value).toBeNull();
  });

  it("only reads armour that is actually worn in the right place", () => {
    // Plate carried in a pack, and a sword held where a shield would go.
    expect(effectiveAc(nimble, [worn("plate-armor", null)]).value).toBe(13);
    expect(effectiveAc(nimble, [worn("longsword", "hands")]).value).toBe(13);
  });

  it("ignores a hand-typed line that merely calls itself armour", () => {
    // No source, no formula: the name on a line grants nothing by itself.
    expect(effectiveAc(nimble, [plain("Rusty Plate", "armor")]).value).toBe(13);
  });
});
