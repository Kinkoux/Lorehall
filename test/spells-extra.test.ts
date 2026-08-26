import { describe, expect, it } from "vitest";

import {
  EXTRA_PREFIX,
  EXTRA_SPELLS,
  SPELLS,
  SPELL_ALIASES,
  SPELL_SOURCES,
  findSpellByAnyName,
  getSpell,
  isExtraSpell,
  searchSpells,
  spellAliasHit,
  spellAliases,
  spellRef,
  spellSummary,
} from "@/lib/srd-data";
import { compendium } from "@/lib/i18n/dict/compendium";

/**
 * The second shelf, and the rule that keeps it legal.
 *
 * `lib/data/spells-extra.json` holds spells this project may name but may not
 * print: the header facts and the book, and nothing that could be mistaken for
 * the entry itself. Most of what follows guards the *shape* of that bargain,
 * because the shape is the bargain — a stub that grew a description field, or
 * an index that collided with an SRD one, would be a licence problem rather
 * than a bug. The rest checks that both shelves answer to a name, which is the
 * whole reason the file exists: an Arcane Trickster holding Booming Blade
 * should not be told there is no such spell.
 */

const SCHOOLS = new Set(SPELLS.map((s) => s.school));
const SRD_NAMES = new Set(SPELLS.map((s) => s.name.toLowerCase()));

/** The SRD's own index style, which the stubs follow behind their prefix. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

describe("spells-extra.json", () => {
  it("is a curated set, not an empty promise", () => {
    expect(EXTRA_SPELLS.length).toBeGreaterThan(30);
  });

  it("carries the header facts and only the header facts", () => {
    const allowed = new Set([
      "index",
      "name",
      "level",
      "school",
      "castingTime",
      "range",
      "components",
      "duration",
      "concentration",
      "ritual",
      "classes",
      "source",
    ]);
    for (const spell of EXTRA_SPELLS) {
      // Every field present, none of them blank — an entry we could not fill
      // in belongs out of the file rather than in it half-answered.
      for (const key of allowed) expect(Object.hasOwn(spell, key), `${spell.name}.${key}`).toBe(true);
      // And nothing else. `desc`, `higherLevel`, a blurb, a summary: the day
      // one of those appears here is the day this stops being a signpost.
      for (const key of Object.keys(spell)) expect(allowed.has(key), `${spell.name}.${key}`).toBe(true);
      expect(spell.name.trim(), spell.index).toBeTruthy();
      expect(spell.castingTime.trim(), spell.name).toBeTruthy();
      expect(spell.range.trim(), spell.name).toBeTruthy();
      expect(spell.components.trim(), spell.name).toBeTruthy();
      expect(spell.duration.trim(), spell.name).toBeTruthy();
      expect(spell.classes.length, spell.name).toBeGreaterThan(0);
    }
  });

  it("states components as letters, never as the material they name", () => {
    // "V, S, M" and not "M (a red dragon's scale)": the parenthetical is the
    // book's wording, and the SRD entries are the only ones that may carry it.
    for (const spell of EXTRA_SPELLS) {
      expect(spell.components, spell.name).toMatch(/^[VSM](, [VSM])*$/);
    }
  });

  it("files every entry under a prefixed index of its own", () => {
    const seen = new Set<string>();
    for (const spell of EXTRA_SPELLS) {
      expect(spell.index.startsWith(EXTRA_PREFIX), spell.index).toBe(true);
      expect(spell.index).toBe(`${EXTRA_PREFIX}${slug(spell.name)}`);
      expect(seen.has(spell.index), spell.index).toBe(false);
      seen.add(spell.index);
      // The prefix is what keeps the two shelves apart; an SRD index that
      // started with it would break every reader at once.
      expect(getSpell(spell.index)).toBeUndefined();
    }
  });

  it("never shadows a spell the SRD already prints in full", () => {
    const clashes = EXTRA_SPELLS.filter((s) => SRD_NAMES.has(s.name.toLowerCase()));
    expect(clashes.map((s) => s.name)).toEqual([]);
  });

  it("keeps to levels, schools and books the rest of the app can draw", () => {
    for (const spell of EXTRA_SPELLS) {
      expect(spell.level, spell.name).toBeGreaterThanOrEqual(0);
      expect(spell.level, spell.name).toBeLessThanOrEqual(9);
      // A school with no sigil plate would draw a broken image on every row.
      expect(SCHOOLS.has(spell.school), `${spell.name}: ${spell.school}`).toBe(true);
      expect(SPELL_SOURCES).toContain(spell.source);
      // And a book with no expansion would show a bare abbreviation to a
      // reader who has never heard of it.
      expect(compendium.en.spells.sources[spell.source], spell.source).toBeTruthy();
      expect(compendium.tr.spells.sources[spell.source], spell.source).toBeTruthy();
    }
  });

  it("holds the three the table actually asked for", () => {
    const booming = spellRef("x-booming-blade");
    expect(booming?.kind).toBe("extra");
    expect(booming?.spell.level).toBe(0);
    expect(spellRef("x-silvery-barbs")?.spell.castingTime).toBe("1 reaction");
    expect(spellRef("x-distort-value")?.spell.duration).toBe("8 hours");
  });
});

describe("spell-aliases.json", () => {
  it("points every printed name at a spell the SRD really carries", () => {
    for (const [alias, index] of Object.entries(SPELL_ALIASES)) {
      expect(getSpell(index), `${alias} → ${index}`).toBeTruthy();
      expect(spellAliases(index)).toContain(alias);
    }
  });

  it("only ever renames — never invents a second entry", () => {
    // An alias is a door into a spell we have; if the SRD published it under
    // that very name there would be nothing to alias.
    for (const alias of Object.keys(SPELL_ALIASES)) {
      expect(SRD_NAMES.has(alias.toLowerCase()), alias).toBe(false);
    }
  });

  it("tells a searcher which printed name answered", () => {
    expect(spellAliasHit("arcane-hand", "bigby")).toBe("Bigby's Hand");
    expect(spellAliasHit("arcane-hand", "fireball")).toBeNull();
    expect(spellAliasHit("fireball", "fire")).toBeNull();
  });
});

describe("spellRef", () => {
  it("names the shelf an index came off", () => {
    expect(spellRef("fireball")?.kind).toBe("srd");
    expect(spellRef("x-booming-blade")?.kind).toBe("extra");
  });

  it("knows nothing it was not given", () => {
    expect(spellRef("x-nothing-at-all")).toBeUndefined();
    expect(spellRef("nothing-at-all")).toBeUndefined();
  });

  it("hands both shelves to the same summary line", () => {
    expect(spellSummary(spellRef("x-booming-blade")!.spell)).toContain("Cantrip evocation");
  });
});

describe("findSpellByAnyName", () => {
  it("answers to an SRD name, a stub's name and a printed one alike", () => {
    expect(findSpellByAnyName("Fireball")?.spell.index).toBe("fireball");
    expect(findSpellByAnyName("booming blade")?.spell.index).toBe("x-booming-blade");
    expect(findSpellByAnyName("  Tasha's Hideous Laughter ")?.spell.index).toBe(
      "hideous-laughter"
    );
  });

  it("wants the whole name, as the item side does", () => {
    expect(findSpellByAnyName("Booming")).toBeUndefined();
    expect(findSpellByAnyName("Rune Volley")).toBeUndefined();
  });
});

describe("searchSpells", () => {
  it("finds a spell by its own name and by the one a book prints", () => {
    const own = searchSpells("hideous laughter", "", "").map((s) => s.index);
    const printed = searchSpells("Tasha's Hideous", "", "").map((s) => s.index);
    expect(own).toContain("hideous-laughter");
    expect(printed).toEqual(["hideous-laughter"]);
  });

  it("lists the stubs alongside the SRD, in their own level's place", () => {
    const cantrips = searchSpells("", "0", "");
    expect(cantrips.some((s) => s.index === "x-booming-blade")).toBe(true);
    // The merged list keeps the SRD file's own order: level, then name.
    for (let i = 1; i < cantrips.length; i++) {
      expect(cantrips[i - 1].name.localeCompare(cantrips[i].name)).toBeLessThanOrEqual(0);
    }
    const levels = searchSpells("", "", "").map((s) => s.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("marks which rows may not be printed", () => {
    const found = searchSpells("booming blade", "", "");
    expect(found.length).toBe(1);
    expect(isExtraSpell(found[0])).toBe(true);
    expect(SPELLS.some((s) => isExtraSpell(s))).toBe(false);
  });

  it("holds the stubs to the same filters the SRD is held to", () => {
    expect(searchSpells("booming blade", "", "Cleric")).toEqual([]);
    expect(searchSpells("booming blade", "3", "")).toEqual([]);
    expect(searchSpells("booming blade", "", "", "Illusion")).toEqual([]);
  });

  // The reason any of this exists: the rogue who asked for these three.
  it("offers an Arcane Trickster the spells they came for", () => {
    const trickster = searchSpells("", "", "", "", "arcane-trickster").map((s) => s.index);
    expect(trickster).toContain("x-booming-blade");
    expect(trickster).toContain("x-silvery-barbs");
    expect(trickster).toContain("x-distort-value");
  });

  it("gives a subclass tagged in the SRD no stubs it never tagged", () => {
    // "Lore" is a field on the SRD's own entries; a stub carries no such tag,
    // and a filter that guessed one would be inventing rules.
    const lore = searchSpells("", "", "", "", "lore");
    expect(lore.length).toBeGreaterThan(0);
    expect(lore.every((s) => !isExtraSpell(s))).toBe(true);
  });
});
