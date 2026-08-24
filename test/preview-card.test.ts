import { describe, expect, it } from "vitest";

import { itemPreview, spellPreview } from "@/components/character/PreviewCard";
import type { InventoryLineShape } from "@/components/character/sheet-data";
import type { CharacterAbility } from "@/lib/db";
import { makeT } from "@/lib/i18n";

/**
 * What a preview card is allowed to say, which is only ever what the row's
 * source actually knows.
 *
 * The card is the one place on a sheet where the compendium's own words are
 * quoted back, so the interesting cases are the edges: a line that came from
 * nowhere must not be dressed up as though it came from somewhere, a line the
 * compendium has since forgotten must not produce a card pointing at a 404,
 * and a Turkish reader must get the Turkish name without losing the English
 * one the rest of the app resolves against.
 */

const en = makeT("en");
const tr = makeT("tr");

const line = (over: Partial<InventoryLineShape> = {}): InventoryLineShape => ({
  id: "row1",
  characterId: "ch1",
  name: "A thing",
  qty: 1,
  notes: null,
  worldItemId: null,
  srdIndex: null,
  slot: null,
  equipped: 0,
  statBonuses: null,
  acBase: null,
  acDex: null,
  createdAt: 0,
  bonuses: null,
  sourceWorldId: null,
  photo: null,
  plate: null,
  category: null,
  requiredSlot: null,
  sourceDescription: null,
  ...over,
});

const spellLine = (over: Partial<CharacterAbility> = {}): CharacterAbility => ({
  id: "ab1",
  characterId: "ch1",
  name: "Fireball",
  kind: "spell",
  notes: null,
  usesMax: null,
  usesLeft: null,
  srdIndex: "fireball",
  createdAt: 0,
  ...over,
});

describe("itemPreview", () => {
  it("gives a hand-typed line no card at all", () => {
    expect(itemPreview(line({ name: "Grandfather's pipe" }), "en", en)).toBeNull();
  });

  it("gives no card for an index the compendium no longer knows", () => {
    expect(itemPreview(line({ srdIndex: "wand-of-nothing-in-particular" }), "en", en)).toBeNull();
  });

  it("quotes the SRD entry and points at its page", () => {
    const facts = itemPreview(line({ name: "Longsword", srdIndex: "longsword" }), "en", en);
    expect(facts?.title).toBe("Longsword");
    expect(facts?.href).toBe("/compendium/items/longsword");
    expect(facts?.summary).toContain("1d8");
    expect(facts?.linkLabel).toBe(en("character.sheet.openInCompendium"));
  });

  it("heads the card in Turkish and keeps the SRD's spelling underneath", () => {
    const facts = itemPreview(line({ name: "Dagger", srdIndex: "dagger" }), "tr", tr);
    expect(facts?.title).toBe("Hançer");
    expect(facts?.subtitle).toContain("Dagger");
  });

  it("shows what this copy grants, not what a fresh one would", () => {
    // The snapshot on the row is the number the armour maths counts, so it is
    // the number the card states — even where the book would answer otherwise.
    const facts = itemPreview(
      line({ srdIndex: "ring-of-protection", bonuses: '{"ac":1}' }),
      "en",
      en
    );
    expect(facts?.bonuses).toBe('{"ac":1}');
  });

  it("sends a forged piece home to its own world's library", () => {
    const facts = itemPreview(
      line({
        name: "The Ashen Key",
        worldItemId: "wi1",
        sourceWorldId: "w1",
        category: "magic",
        sourceDescription: "Warm to the touch, and always pointing north.",
      }),
      "en",
      en
    );
    expect(facts?.href).toBe("/w/w1#wi-wi1");
    expect(facts?.detail).toBe("Warm to the touch, and always pointing north.");
    expect(facts?.linkLabel).toBe(en("character.sheet.openInLibrary"));
  });

  it("clips a description that would turn the card into a page", () => {
    const facts = itemPreview(
      line({
        worldItemId: "wi1",
        sourceWorldId: "w1",
        sourceDescription: "word ".repeat(200),
      }),
      "en",
      en
    );
    expect(facts?.detail?.endsWith("…")).toBe(true);
    expect(facts?.detail?.length).toBeLessThanOrEqual(241);
  });
});

describe("spellPreview", () => {
  it("gives a homebrew power no card", () => {
    expect(spellPreview(spellLine({ name: "Rune Volley", srdIndex: null }), en)).toBeNull();
  });

  it("carries what the summary line leaves out", () => {
    const facts = spellPreview(spellLine(), en);
    expect(facts?.href).toBe("/compendium/spells/fireball");
    expect(facts?.art).toBe("/art/m/school-evocation.webp");
    expect(facts?.summary).toContain("Level 3");
    // The classes are the subtitle's whole job: spellSummary never names them.
    expect(facts?.subtitle).toContain("Sorcerer");
  });
});
