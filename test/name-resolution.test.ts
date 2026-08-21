import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const auth = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const { db } = await import("./support/db");
  return { ...schema, db };
});

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({ id: auth.userId }),
  getCurrentUser: async () => ({ id: auth.userId }),
  createSession: async () => {},
  destroySession: async () => {},
}));

import { addAbility, addItem, giveItem } from "@/lib/character-actions";
import { characterAbilities, characterItems } from "@/lib/db/schema";
import { sumStatBonuses } from "@/lib/world-items";
import { applySchema, db, truncateAll } from "./support/db";
import {
  formData,
  seedCharacter,
  seedExtraWorld,
  seedWorld,
  seedWorldItem,
  type Fixture,
} from "./support/seed";

/**
 * The name is the last thing asked, and it is enough.
 *
 * The hidden reference the lookahead attaches is the happy path, not the only
 * path: at a table full of phones a tap can land as the list closes and an
 * Enter can submit the form, and both send the typed name alone. So the
 * actions resolve the name themselves — library first, SRD behind it, whole
 * matches only — and a line typed by hand ends up the same row as a picked
 * one. The "custom" tick is the way to say no to all of that.
 */

let fx: Fixture;
let sheet: string;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
  sheet = await seedCharacter(fx.campaignId, fx.player);
  auth.userId = fx.player;
});

const rowsOf = (characterId: string) =>
  db.select().from(characterItems).where(eq(characterItems.characterId, characterId));

const abilitiesOf = (characterId: string) =>
  db
    .select()
    .from(characterAbilities)
    .where(eq(characterAbilities.characterId, characterId));

describe("addItem resolves the name when no reference arrives", () => {
  it("stamps a hand-typed SRD name with its index, slot and summary", async () => {
    await addItem(sheet, formData({ name: "Leather Armor", qty: "1" }));
    const [row] = await rowsOf(sheet);
    expect(row.srdIndex).toBe("leather-armor");
    expect(row.slot).toBe("armor");
    // The compendium's own one-liner, since the player wrote no notes.
    expect(row.notes).toBeTruthy();
  });

  it("reaches the same entry through its Turkish name", async () => {
    await addItem(sheet, formData({ name: "Hançer", qty: "1" }));
    const [row] = await rowsOf(sheet);
    expect(row.srdIndex).toBe("dagger");
    expect(row.slot).toBe("weapon");
    // The line keeps the Turkish spelling the player typed.
    expect(row.name).toBe("Hançer");
  });

  it("does not care about case or the spaces around it", async () => {
    await addItem(sheet, formData({ name: "  lEaTHeR aRMoR  " }));
    const [row] = await rowsOf(sheet);
    expect(row.srdIndex).toBe("leather-armor");
    expect(row.slot).toBe("armor");
    // The line still reads the way it was typed — only the lookup folded case.
    expect(row.name).toBe("lEaTHeR aRMoR");
  });

  it("matches a whole name only — a partial one stays a plain line", async () => {
    await addItem(sheet, formData({ name: "Leath" }));
    const [row] = await rowsOf(sheet);
    expect(row.srdIndex).toBeNull();
    expect(row.slot).toBeNull();
  });

  it("prefers this world's library to the compendium, bonuses and all", async () => {
    const forged = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Leather Armor",
      category: "armor",
      slot: "armor",
      statBonuses: JSON.stringify({ ac: 2 }),
    });
    await addItem(sheet, formData({ name: "leather armor" }));
    const [row] = await rowsOf(sheet);
    expect(row.worldItemId).toBe(forged);
    expect(row.srdIndex).toBeNull();
    expect(sumStatBonuses([row.statBonuses])).toEqual({ ac: 2 });
  });

  it("keeps a DM-only entry hidden from the name too", async () => {
    const hidden = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Emberfang Secret",
      slot: "weapon",
      statBonuses: JSON.stringify({ str: 2 }),
      visibility: "dm",
    });
    await addItem(sheet, formData({ name: "Emberfang Secret" }));
    const [row] = await rowsOf(sheet);
    // Typing it exactly is not the same as having been shown it.
    expect(row.name).toBe("Emberfang Secret");
    expect(row.worldItemId).toBeNull();
    expect(row.statBonuses).toBeNull();
    expect(row.slot).toBeNull();

    // The DM who forged it types the same name and gets the real piece.
    auth.userId = fx.dm;
    await addItem(sheet, formData({ name: "Emberfang Secret" }));
    const rows = await rowsOf(sheet);
    expect(rows[1].worldItemId).toBe(hidden);
    expect(sumStatBonuses([rows[1].statBonuses])).toEqual({ str: 2 });
  });

  it("leaves a library entry from another world alone", async () => {
    // Same name, a world this table does not play in: nothing to borrow.
    const theirWorld = await seedExtraWorld(fx.owner);
    await seedWorldItem(theirWorld, fx.owner, {
      name: "Sunblade",
      slot: "weapon",
      statBonuses: JSON.stringify({ ac: 5 }),
    });
    await addItem(sheet, formData({ name: "Sunblade" }));
    const [row] = await rowsOf(sheet);
    expect(row.worldItemId).toBeNull();
    expect(row.statBonuses).toBeNull();
  });

  it("writes a blank line when the player ticked “custom”", async () => {
    const forged = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Shield",
      category: "armor",
      slot: "hands",
      statBonuses: JSON.stringify({ ac: 2 }),
    });
    // Everything that could attach a source is on the form — a matching name,
    // a library id, an SRD index — and the tick refuses all of it.
    await addItem(
      sheet,
      formData({ name: "Shield", custom: "1", worldItemId: forged, srdIndex: "shield" })
    );
    const [row] = await rowsOf(sheet);
    expect(row.name).toBe("Shield");
    expect(row.worldItemId).toBeNull();
    expect(row.srdIndex).toBeNull();
    expect(row.statBonuses).toBeNull();
    expect(row.slot).toBeNull();
  });
});

describe("giveItem resolves the name the same way", () => {
  it("hands over a compendium piece the DM only typed the name of", async () => {
    auth.userId = fx.dm;
    await giveItem(fx.campaignId, formData({ characterId: sheet, name: "Shield", qty: "1" }));
    const [row] = await rowsOf(sheet);
    expect(row.srdIndex).toBe("shield");
    // A shield is held — the slot came from the source, not the form.
    expect(row.slot).toBe("hands");
  });

  it("still starts blank when the DM ticked “custom”", async () => {
    auth.userId = fx.dm;
    await giveItem(
      fx.campaignId,
      formData({ characterId: sheet, name: "Shield", qty: "1", custom: "1" })
    );
    const [row] = await rowsOf(sheet);
    expect(row.name).toBe("Shield");
    expect(row.srdIndex).toBeNull();
    expect(row.slot).toBeNull();
  });
});

describe("addAbility resolves a spell by name", () => {
  it("links a hand-typed “fireball” to the compendium and calls it a spell", async () => {
    await addAbility(sheet, formData({ name: "fireball", kind: "ability" }));
    const [row] = await abilitiesOf(sheet);
    expect(row.srdIndex).toBe("fireball");
    // Whatever the dropdown said: a spell from the spell list is a spell.
    expect(row.kind).toBe("spell");
    expect(row.notes).toBeTruthy();
  });

  it("leaves a homebrew power alone when “custom” is ticked", async () => {
    await addAbility(
      sheet,
      formData({ name: "Fireball", kind: "trait", custom: "1", srdIndex: "fireball" })
    );
    const [row] = await abilitiesOf(sheet);
    expect(row.srdIndex).toBeNull();
    expect(row.kind).toBe("trait");
    expect(row.notes).toBeNull();
  });

  it("keeps a name the spell list has never heard of as free text", async () => {
    await addAbility(sheet, formData({ name: "Rune Cannon", kind: "ability" }));
    const [row] = await abilitiesOf(sheet);
    expect(row.srdIndex).toBeNull();
    expect(row.kind).toBe("ability");
  });
});
