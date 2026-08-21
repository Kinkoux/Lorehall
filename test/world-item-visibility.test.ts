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

import { addItem } from "@/lib/character-actions";
import { searchItemsForCharacter } from "@/lib/search-actions";
import {
  addWorldItemToCharacter,
  createWorldItem,
  updateWorldItem,
} from "@/lib/world-item-actions";
import { characterItems, worldItems } from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import {
  formData,
  seedCharacter,
  seedWorld,
  seedWorldItem,
  type Fixture,
} from "./support/seed";

/**
 * A DM-only library entry is the item equivalent of a DM-only map: it exists,
 * it is finished, and the party has simply not met it yet. These are the three
 * doors a player could otherwise walk through to it — the sheet's lookahead,
 * the compendium's "add to my character", and the sheet's own add form with a
 * forged reference — plus the writes that set the column in the first place.
 */

let fx: Fixture;
let sheet: string;
let hidden: string;
let shared: string;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
  sheet = await seedCharacter(fx.campaignId, fx.player);
  hidden = await seedWorldItem(fx.worldId, fx.dm, {
    name: "Emberfang Secret",
    statBonuses: JSON.stringify({ str: 2 }),
    visibility: "dm",
  });
  shared = await seedWorldItem(fx.worldId, fx.dm, { name: "Emberfang Common" });
  auth.userId = fx.player;
});

const rowsOf = (characterId: string) =>
  db.select().from(characterItems).where(eq(characterItems.characterId, characterId));

const libraryRow = (itemId: string) =>
  db.query.worldItems.findFirst({ where: eq(worldItems.id, itemId) });

describe("searchItemsForCharacter", () => {
  it("keeps a DM-only entry out of a player's suggestions", async () => {
    const found = await searchItemsForCharacter(sheet, "emberfang");
    expect(found.map((s) => s.ref)).toEqual([shared]);
  });

  it("still offers it to the DM who forged it", async () => {
    auth.userId = fx.dm;
    const found = await searchItemsForCharacter(sheet, "emberfang");
    expect(found.map((s) => s.ref).sort()).toEqual([hidden, shared].sort());
  });
});

describe("addWorldItemToCharacter", () => {
  it("refuses a DM-only entry to the player whose sheet it is", async () => {
    await addWorldItemToCharacter(hidden, formData({ characterId: sheet, qty: "1" }));
    expect(await rowsOf(sheet)).toHaveLength(0);
  });

  it("still lets the player take a shared entry", async () => {
    await addWorldItemToCharacter(shared, formData({ characterId: sheet, qty: "2" }));
    const rows = await rowsOf(sheet);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Emberfang Common", qty: 2, worldItemId: shared });
  });

  it("lets the DM hand the hidden one over", async () => {
    auth.userId = fx.dm;
    await addWorldItemToCharacter(hidden, formData({ characterId: sheet, qty: "1" }));
    const rows = await rowsOf(sheet);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Emberfang Secret", worldItemId: hidden });
  });
});

describe("addItem with a forged reference", () => {
  it("stocks the line as free text rather than carrying the hidden bonuses", async () => {
    await addItem(sheet, formData({ name: "Emberfang Secret", qty: "1", worldItemId: hidden }));
    const rows = await rowsOf(sheet);
    expect(rows).toHaveLength(1);
    expect(rows[0].worldItemId).toBeNull();
    expect(rows[0].statBonuses).toBeNull();
  });
});

describe("the visibility column", () => {
  beforeEach(() => {
    auth.userId = fx.dm;
  });

  it("is written by createWorldItem, and is 'everyone' unless the DM says otherwise", async () => {
    await createWorldItem(fx.worldId, {}, formData({ name: "Sunblade", visibility: "dm" }));
    await createWorldItem(fx.worldId, {}, formData({ name: "Torch" }));
    const forged = await db.select().from(worldItems).where(eq(worldItems.worldId, fx.worldId));
    const byName = Object.fromEntries(forged.map((row) => [row.name, row.visibility]));
    expect(byName).toMatchObject({ Sunblade: "dm", Torch: "everyone" });
  });

  it("is flipped back to the whole world by updateWorldItem", async () => {
    await updateWorldItem(hidden, {}, formData({ name: "Emberfang Secret", visibility: "everyone" }));
    expect(await libraryRow(hidden)).toMatchObject({ visibility: "everyone" });
  });
});
