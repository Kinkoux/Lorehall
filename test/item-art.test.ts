import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { itemArtSrc, type ItemArt } from "@/components/character/item-art";
import { getItemArt, ITEM_ART, ITEMS } from "@/lib/srd-data";
import itemArtJson from "@/lib/data/item-art.json";
import itemKindsJson from "@/lib/data/item-kinds.json";

/**
 * Which picture wins, and why there is always one to win.
 *
 * The chain narrows from "this exact object" to "a thing of roughly this
 * shape": the photograph somebody took of the piece on their table, the
 * engraving cut for that SRD entry, the engraving shared by every entry of its
 * kind, and finally the category plate — which says almost nothing, and is the
 * reason the steps above it exist. Two callers walk this chain (the paper doll
 * and the inventory grid) and they had drifted apart on it once already.
 */

const art = (over: Partial<ItemArt> = {}): ItemArt => ({
  photo: null,
  plate: null,
  category: null,
  ...over,
});

describe("itemArtSrc", () => {
  it("shows the photograph over anything we could have drawn", () => {
    const photo = "/files/items/abc?v=sword.jpg";
    expect(
      itemArtSrc(art({ photo, plate: "/items/longsword.webp", category: "weapon" }), "armor")
    ).toBe(photo);
  });

  it("prefers the piece's own plate to the plate for its bucket", () => {
    expect(itemArtSrc(art({ plate: "/items/longsword.webp", category: "weapon" }))).toBe(
      "/items/longsword.webp"
    );
  });

  it("falls back to the line's category, then to the caller's guess", () => {
    expect(itemArtSrc(art({ category: "magic" }), "weapon")).toBe("/art/cat-magic.webp");
    // A hand-typed line names no category; the slot it sits in does.
    expect(itemArtSrc(art(), "weapon")).toBe("/art/cat-weapon.webp");
  });

  it("answers null when nothing at all is known", () => {
    expect(itemArtSrc(art())).toBeNull();
    expect(itemArtSrc(art(), null)).toBeNull();
  });
});

describe("getItemArt", () => {
  // What the manifest holds depends on whether the converter has run on this
  // machine, so neither branch may trust the file: each test borrows or hides
  // an index for its own duration and restores what it found.
  it("draws an entry with no plate of its own as the kind of thing it is", () => {
    const had = ITEM_ART.has("battleaxe");
    ITEM_ART.delete("battleaxe");
    try {
      // A kind plate is cut to the same three sizes an item plate is, so the
      // day this branch fires a list row does not download a 512px engraving.
      expect(getItemArt("battleaxe")).toEqual({
        src: "/art/kind-axe.webp",
        thumb: "/art/t/kind-axe.webp",
        mid: "/art/m/kind-axe.webp",
      });
    } finally {
      if (had) ITEM_ART.add("battleaxe");
    }
  });

  it("knows nothing about an index the compendium never listed", () => {
    expect(getItemArt("vorpal-spork-of-brunch")).toBeUndefined();
  });

  it("cannot be tricked into a URL by an inherited property name", () => {
    // The kind map is keyed by SRD index, and "constructor" is not one. Read
    // off a plain object it would have been, and the page would have gone
    // looking for /art/kind-function Object() { [native code] }.webp.
    expect(getItemArt("constructor")).toBeUndefined();
    expect(getItemArt("toString")).toBeUndefined();
  });

  it("gives an engraved entry its own picture at all three sizes", () => {
    const had = ITEM_ART.has("longsword");
    ITEM_ART.add("longsword");
    try {
      expect(getItemArt("longsword")).toEqual({
        src: "/items/longsword.webp",
        thumb: "/items/t/longsword.webp",
        mid: "/items/m/longsword.webp",
      });
    } finally {
      if (!had) ITEM_ART.delete("longsword");
    }
  });
});

/**
 * The manifest is a promise about the filesystem, and nothing in the type
 * system can keep it: `getItemArt` builds a URL by string concatenation, so an
 * index listed with no file behind it produces a perfectly well-typed link to
 * nothing. Rendered through `<img alt="">` that failure is *silent* — a blank
 * box where an engraving should be, on a page no test would otherwise open.
 * So the agreement between the two artefacts is checked here instead: what the
 * manifest lists, the converter must have published, and every kind the data
 * names must have a plate at each of the three sizes something asks for.
 */
const publicPath = (rel: string) => fileURLToPath(new URL(`../public/${rel}`, import.meta.url));

describe("art data invariants", () => {
  const manifest = itemArtJson as string[];
  const kinds = itemKindsJson as Record<string, string>;
  const indexes = new Set(ITEMS.map((i) => i.index));

  it("lists only indexes the compendium actually carries", () => {
    expect(manifest.filter((index) => !indexes.has(index))).toEqual([]);
  });

  it("has every listed plate on disk at all three sizes", () => {
    const missing = manifest.flatMap((index) =>
      [`items/${index}.webp`, `items/m/${index}.webp`, `items/t/${index}.webp`].filter(
        (rel) => !existsSync(publicPath(rel))
      )
    );
    expect(missing).toEqual([]);
  });

  it("maps only known indexes to kinds", () => {
    expect(Object.keys(kinds).filter((index) => !indexes.has(index))).toEqual([]);
  });

  it("has every named kind on disk at all three sizes", () => {
    const missing = [...new Set(Object.values(kinds))].flatMap((kind) =>
      [`art/kind-${kind}.webp`, `art/m/kind-${kind}.webp`, `art/t/kind-${kind}.webp`].filter(
        (rel) => !existsSync(publicPath(rel))
      )
    );
    expect(missing).toEqual([]);
  });
});
