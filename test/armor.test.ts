import { describe, expect, it } from "vitest";

import { effectiveAc, type WornForAc } from "@/lib/armor";
import { acGearBonus, acTitle, weaponAttack } from "@/lib/dnd";
import { ITEMS, armorAcFor, getItem, parseArmorAc, type SrdItem } from "@/lib/srd-data";

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

/** The same line after a player has typed an armour class onto their copy. */
const typed = (
  line: WornForAc,
  acBase: number | null,
  acDex: WornForAc["acDex"] = null
): WornForAc => ({ ...line, acBase, acDex });

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

/**
 * The escape hatch. SRD magic armour keeps its mechanic in prose — Adamantine
 * Armor carries no `ac` field at all — so the compendium has nothing to say
 * and wearing the thing moved no number. A base typed onto the line does, and
 * it outranks every other source: the player has stated something about their
 * own copy that nothing else in the app could know.
 */
describe("effectiveAc with a base typed onto the line", () => {
  const nimble = { armorClass: null, dex: 16 }; // +3
  const blank = { armorClass: null, dex: null };

  it("gives magic armour the class its prose never stated", () => {
    // The compendium reads nothing off this entry: category "magic", ac null.
    expect(armorAcFor("adamantine-armor")).toBeNull();
    const ac = effectiveAc(nimble, [typed(worn("adamantine-armor", "armor"), 16, "none")]);
    expect(ac.value).toBe(16);
    // Named, not bare: the reader can tell which piece claimed the number.
    expect(acTitle(ac)).toBe("Adamantine Armor 16");
  });

  it("overrules the compendium's own reading of the same piece", () => {
    // Chain mail is 16 and ignores DEX; this copy is not, because its owner
    // says so. Intent wins over the parser, or the field is decoration.
    const ac = effectiveAc(nimble, [typed(worn("chain-mail", "armor"), 12, "full")]);
    expect(ac.value).toBe(15);
    expect(acTitle(ac)).toBe("Chain Mail 12 + DEX 3");
  });

  it("applies the DEX rule the line states, cap and all", () => {
    expect(effectiveAc(nimble, [typed(plain("Star Mail", "armor"), 14, "capped2")]).value).toBe(16);
    expect(effectiveAc(nimble, [typed(plain("Star Mail", "armor"), 14, "full")]).value).toBe(17);
    // An unstated rule is "none" — the safe reading, not the generous one.
    expect(effectiveAc(nimble, [typed(plain("Star Mail", "armor"), 14)]).value).toBe(14);
    // And a sheet with no DEX score still wears it.
    expect(effectiveAc(blank, [typed(plain("Star Mail", "armor"), 14, "full")]).value).toBe(14);
  });

  it("reads a base typed onto the hand as the bonus it adds", () => {
    // A +1 shield: the SRD says 2, this copy says 3, and the copy wins.
    const ac = effectiveAc(nimble, [
      worn("leather-armor", "armor"),
      typed(worn("shield", "hands"), 3),
    ]);
    expect(ac.value).toBe(17);
    expect(acTitle(ac)).toBe("11 + DEX 3 + Shield 3");
    expect(acGearBonus(ac)).toBe(3);
  });

  it("lets a hand-typed buckler count that the SRD has never heard of", () => {
    const ac = effectiveAc(nimble, [typed(plain("Oaken Buckler", "hands"), 1)]);
    expect(ac.value).toBe(14);
    expect(acGearBonus(ac)).toBe(1);
  });

  it("ignores a base typed onto a line worn anywhere else", () => {
    // Body and hand are the two places an armour class is stated from; a ring
    // that wants to add to it says so through its flat `ac` bonus.
    const ring = typed(plain("Signet", "ring", JSON.stringify({ ac: 1 })), 5);
    const ac = effectiveAc(nimble, [ring]);
    expect(ac.value).toBe(14);
    expect(acTitle(ac)).toBe("10 + DEX 3 + Signet 1");
  });

  it("leaves a line nobody has edited exactly as it was", () => {
    // The columns are NULL on every existing row, and NULL means "say nothing
    // and let the compendium answer" — not "this piece is worth 0".
    const untouched = typed(worn("chain-mail", "armor"), null);
    expect(effectiveAc(nimble, [untouched]).value).toBe(16);
    expect(effectiveAc(nimble, [typed(worn("shield", "hands"), null)]).value).toBe(15);
    // Nothing to say and no compendium entry either: the sheet's own field.
    expect(effectiveAc({ armorClass: 15, dex: 16 }, [typed(plain("Rags", "armor"), null)]).value)
      .toBe(15);
  });
});

/**
 * The offensive half of the same question: what a worn weapon comes to.
 *
 * `weaponAttack` lives in lib/dnd.ts rather than in the card that draws it,
 * which is what makes these four lines testable at all — the ladder used to be
 * a conditional nested inside a React component and could only be checked by
 * rendering one.
 */
describe("weaponAttack", () => {
  /** A level 5 character: proficiency 3, strong arm, quicker hands. */
  const mods = { str: 1, dex: 3 };
  const pb = 3;

  it("reads a ranged weapon off Dexterity whatever the arm behind it", () => {
    const bow = weaponAttack(getItem("longbow"), { str: 4, dex: 3 }, pb);
    expect(bow.ability).toBe("dex");
    expect(bow.bonus).toBe(6);
    expect(bow.damage).toBe("1d8 piercing");
  });

  it("lets a finesse weapon take whichever hand is better", () => {
    // STR 8 (−1) against DEX 16 (+3): the dagger swings with the wrist.
    const quick = weaponAttack(getItem("dagger"), { str: -1, dex: 3 }, pb);
    expect(quick.ability).toBe("dex");
    expect(quick.bonus).toBe(6);
    // And the same dagger in a barbarian's fist goes back to the shoulder.
    const strong = weaponAttack(getItem("dagger"), { str: 4, dex: 0 }, pb);
    expect(strong.ability).toBe("str");
    expect(strong.bonus).toBe(7);
  });

  it("falls to Strength for a weapon that says nothing", () => {
    const sword = weaponAttack(getItem("longsword"), mods, pb);
    expect(sword.ability).toBe("str");
    expect(sword.bonus).toBe(4);
  });

  it("says nothing at all when the six scores are not all in", () => {
    // A dash beats a +0: a blank sheet has no attack bonus, and printing one
    // would read as a fact rather than as an absence.
    const half = weaponAttack(getItem("longsword"), { str: null, dex: 3 }, pb);
    expect(half.ability).toBeNull();
    expect(half.bonus).toBeNull();
    expect(half.damage).toBe("1d8 slashing");
  });

  it("carries a hand-typed line to Strength and a dash", () => {
    const heirloom = weaponAttack(null, mods, pb);
    expect(heirloom.ability).toBe("str");
    expect(heirloom.bonus).toBe(4);
    expect(heirloom.damage).toBe("—");
  });
});
