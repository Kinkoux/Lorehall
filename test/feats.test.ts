import { describe, expect, it } from "vitest";

import { ABILITIES } from "@/lib/dnd";
import {
  acceptsFeatAsi,
  featAsiOptions,
  FEATS,
  FEAT_PREFIX,
  findFeatByName,
  getFeat,
  isFeatIndex,
} from "@/lib/srd-feats";
import { character } from "@/lib/i18n/dict/character";

/**
 * The third shelf, held to the same bargain as the second.
 *
 * `lib/data/feats.json` may name the Player's Handbook's feats and state four
 * facts about each; it may not print a word of what any of them does. Most of
 * what follows guards the *shape* of that — a stub that grew a `desc` field
 * would be a licence problem rather than a bug — and the rest guards the one
 * mechanical fact the sheet acts on by itself: a half-feat's +1, which lands
 * in a column, and would land in the wrong one if this file spelled an
 * ability the way the book does instead of the way the schema does.
 */

/** The index style the shelf follows behind its prefix. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

describe("feats.json", () => {
  it("holds the book's whole list, not a sample of it", () => {
    expect(FEATS.length).toBe(42);
  });

  it("carries the four facts and only the four facts", () => {
    const allowed = new Set(["index", "name", "source", "srd", "prerequisite", "asi"]);
    for (const feat of FEATS) {
      for (const key of allowed) expect(Object.hasOwn(feat, key), `${feat.name}.${key}`).toBe(true);
      // And nothing else. `desc`, `benefit`, a blurb, a summary: the day one
      // of those appears here is the day this stops being a signpost.
      for (const key of Object.keys(feat)) expect(allowed.has(key), `${feat.name}.${key}`).toBe(true);
      expect(feat.name.trim(), feat.index).toBeTruthy();
      expect(feat.source, feat.name).toBe("PHB");
      expect(typeof feat.srd, feat.name).toBe("boolean");
      // A prerequisite is a fact or it is absent — never an empty string
      // standing in for one nobody looked up.
      if (feat.prerequisite !== null) expect(feat.prerequisite.trim(), feat.name).toBeTruthy();
    }
  });

  it("files every entry under a prefixed index of its own", () => {
    const seen = new Set<string>();
    for (const feat of FEATS) {
      expect(feat.index.startsWith(FEAT_PREFIX), feat.index).toBe(true);
      expect(feat.index).toBe(`${FEAT_PREFIX}${slug(feat.name)}`);
      expect(seen.has(feat.index), feat.index).toBe(false);
      seen.add(feat.index);
    }
  });

  it("names the one feat the SRD carries too, and only that one", () => {
    expect(FEATS.filter((f) => f.srd).map((f) => f.name)).toEqual(["Grappler"]);
  });

  it("spells a half-feat's +1 the way the six columns are spelled", () => {
    // "intel", not "int": the sheet's column is a SQL keyword away from the
    // book's abbreviation, and a point written to the wrong key is a point
    // written nowhere.
    for (const feat of FEATS) {
      if (feat.asi === null || feat.asi === "any") continue;
      expect(feat.asi.length, feat.name).toBeGreaterThan(0);
      for (const key of feat.asi) expect(ABILITIES, `${feat.name}: ${key}`).toContain(key);
    }
  });

  it("hands out the +1s the 2014 book hands out", () => {
    const halves = FEATS.filter((f) => f.asi !== null).map((f) => f.name);
    expect(halves).toEqual([
      "Actor",
      "Athlete",
      "Durable",
      "Heavily Armored",
      "Heavy Armor Master",
      "Keen Mind",
      "Lightly Armored",
      "Linguist",
      "Moderately Armored",
      "Observant",
      "Resilient",
      "Tavern Brawler",
      "Weapon Master",
    ]);
  });

  it("gives every source a name a reader has heard of, in both languages", () => {
    for (const feat of FEATS) {
      expect(character.en.sheet.feat.sources[feat.source], feat.source).toBeTruthy();
      expect(character.tr.sheet.feat.sources[feat.source], feat.source).toBeTruthy();
    }
  });
});

describe("the feat readers", () => {
  it("answers to an index and to a whole name, folded", () => {
    expect(getFeat("f-alert")?.name).toBe("Alert");
    expect(findFeatByName("  war caster ")?.index).toBe("f-war-caster");
    expect(getFeat("f-nothing-at-all")).toBeUndefined();
  });

  it("wants the whole name, as the spell and item sides do", () => {
    expect(findFeatByName("Great")).toBeUndefined();
    expect(findFeatByName("")).toBeUndefined();
  });

  it("knows a feat index from a spell's on the string alone", () => {
    expect(isFeatIndex("f-lucky")).toBe(true);
    expect(isFeatIndex("x-booming-blade")).toBe(false);
    expect(isFeatIndex("fireball")).toBe(false);
    expect(isFeatIndex(null)).toBe(false);
  });

  it("opens Resilient to all six and Observant to its two", () => {
    expect(featAsiOptions(getFeat("f-resilient")!)).toEqual(ABILITIES);
    expect(featAsiOptions(getFeat("f-observant")!)).toEqual(["intel", "wis"]);
    expect(featAsiOptions(getFeat("f-alert")!)).toEqual([]);
  });

  it("refuses a point a feat never offered", () => {
    expect(acceptsFeatAsi(getFeat("f-observant")!, "wis")).toBe(true);
    expect(acceptsFeatAsi(getFeat("f-observant")!, "str")).toBe(false);
    expect(acceptsFeatAsi(getFeat("f-resilient")!, "cha")).toBe(true);
    expect(acceptsFeatAsi(getFeat("f-alert")!, "dex")).toBe(false);
  });
});
