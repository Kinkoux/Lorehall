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

import { addItem, equipItem, unequipItem } from "@/lib/character-actions";
import { characterItems } from "@/lib/db/schema";
import { sumStatBonuses } from "@/lib/world-items";
import { applySchema, db, sqlState, truncateAll } from "./support/db";
import {
  formData,
  seedCharacter,
  seedExtraWorld,
  seedItem,
  seedWorld,
  seedWorldItem,
  type Fixture,
} from "./support/seed";

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

const rowOf = (itemId: string) =>
  db.query.characterItems.findFirst({ where: eq(characterItems.id, itemId) });

const wornIn = async (characterId: string, slot: string) =>
  (await rowsOf(characterId)).filter((row) => row.equipped === 1 && row.slot === slot);

async function capture(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  throw new Error("expected the write to be rejected, but it went through");
}

describe("character_items_one_per_slot", () => {
  it("rejects a second helm on the same head with SQLSTATE 23505", async () => {
    await seedItem(sheet, 1, "Iron Helm", { slot: "head", equipped: 1 });
    const error = await capture(() =>
      seedItem(sheet, 1, "Bronze Helm", { slot: "head", equipped: 1 })
    );
    expect(sqlState(error)).toBe("23505");
  });

  it("puts no ceiling on the same slot while nothing is worn", async () => {
    await seedItem(sheet, 1, "Iron Helm", { slot: "head" });
    await seedItem(sheet, 1, "Bronze Helm", { slot: "head" });
    await seedItem(sheet, 1, "Straw Hat", { slot: "head" });
    expect(await wornIn(sheet, "head")).toHaveLength(0);
  });

  it("is scoped per character — two heroes may each wear a helm", async () => {
    const other = await seedCharacter(fx.campaignId, fx.dm);
    await seedItem(sheet, 1, "Iron Helm", { slot: "head", equipped: 1 });
    await seedItem(other, 1, "Iron Helm", { slot: "head", equipped: 1 });
    expect(await wornIn(sheet, "head")).toHaveLength(1);
    expect(await wornIn(other, "head")).toHaveLength(1);
  });

  it("leaves the other seven slots free", async () => {
    await seedItem(sheet, 1, "Helm", { slot: "head", equipped: 1 });
    await seedItem(sheet, 1, "Amulet", { slot: "neck", equipped: 1 });
    await seedItem(sheet, 1, "Bracer", { slot: "wrist", equipped: 1 });
    const worn = (await rowsOf(sheet)).filter((row) => row.equipped === 1);
    expect(worn).toHaveLength(3);
  });
});

describe("equipItem", () => {
  it("swaps the occupant of a slot in one write", async () => {
    const old = await seedItem(sheet, 1, "Iron Helm", { slot: "head", equipped: 1 });
    const fresh = await seedItem(sheet, 1, "Crown", { slot: "head" });

    await equipItem(fresh, formData({}));

    const worn = await wornIn(sheet, "head");
    expect(worn).toHaveLength(1);
    expect(worn[0].id).toBe(fresh);
    // The displaced piece stays in the pack, still knowing where it goes.
    const retired = await rowOf(old);
    expect(retired?.equipped).toBe(0);
    expect(retired?.slot).toBe("head");
  });

  it("takes the slot from the form when the line has none of its own", async () => {
    const heirloom = await seedItem(sheet, 1, "Grandfather's Signet");
    await equipItem(heirloom, formData({ slot: "ring" }));
    const row = await rowOf(heirloom);
    expect(row?.slot).toBe("ring");
    expect(row?.equipped).toBe(1);
  });

  it("refuses a slot name that is not one of the eight", async () => {
    const heirloom = await seedItem(sheet, 1, "Grandfather's Signet");
    await equipItem(heirloom, formData({ slot: "tail" }));
    const row = await rowOf(heirloom);
    expect(row?.equipped).toBe(0);
    expect(row?.slot).toBeNull();
  });

  it("ignores a form slot for a piece that already knows where it goes", async () => {
    const boots = await seedItem(sheet, 1, "Striding Boots", { slot: "boots" });
    await equipItem(boots, formData({ slot: "head" }));
    const row = await rowOf(boots);
    expect(row?.slot).toBe("boots");
    expect(await wornIn(sheet, "head")).toHaveLength(0);
  });

  it("writes nothing when another player reaches for someone else's sheet", async () => {
    const helm = await seedItem(sheet, 1, "Iron Helm", { slot: "head" });
    auth.userId = fx.stranger;
    await equipItem(helm, formData({}));
    expect((await rowOf(helm))?.equipped).toBe(0);
  });

  it("lets the DM equip a piece on a player's sheet", async () => {
    const helm = await seedItem(sheet, 1, "Iron Helm", { slot: "head" });
    auth.userId = fx.dm;
    await equipItem(helm, formData({}));
    expect((await rowOf(helm))?.equipped).toBe(1);
  });

  it("refuses to strap body armour to a head, whatever the form says", async () => {
    // The row itself has no slot (stocked before the sheet recorded one), so
    // the only thing standing between a breastplate and a hat is its source.
    const plate = await seedItem(sheet, 1, "Breastplate", { srdIndex: "breastplate" });
    await equipItem(plate, formData({ slot: "head" }));
    const row = await rowOf(plate);
    expect(row?.equipped).toBe(0);
    expect(row?.slot).toBeNull();
  });

  it("places a piece by its source when the form names no slot", async () => {
    const plate = await seedItem(sheet, 1, "Breastplate", { srdIndex: "breastplate" });
    await equipItem(plate, formData({}));
    const row = await rowOf(plate);
    expect(row?.slot).toBe("armor");
    expect(row?.equipped).toBe(1);
  });

  it("keeps a shield in a hand and a sword in the weapon slot", async () => {
    const shield = await seedItem(sheet, 1, "Shield", { srdIndex: "shield" });
    const sword = await seedItem(sheet, 1, "Longsword", { srdIndex: "longsword" });
    await equipItem(shield, formData({ slot: "armor" }));
    await equipItem(sword, formData({ slot: "ring" }));
    expect((await rowOf(shield))?.equipped).toBe(0);
    expect((await rowOf(sword))?.equipped).toBe(0);

    await equipItem(shield, formData({}));
    await equipItem(sword, formData({}));
    expect((await rowOf(shield))?.slot).toBe("hands");
    expect((await rowOf(sword))?.slot).toBe("weapon");
  });

  it("moves a line its source placed differently than the row remembers", async () => {
    // A line stocked before the rule existed, sitting in the wrong square: the
    // source outranks it, and wearing it once puts it right.
    const armour = await seedItem(sheet, 1, "Leather Armor", {
      srdIndex: "leather-armor",
      slot: "head",
    });
    await equipItem(armour, formData({}));
    const row = await rowOf(armour);
    expect(row?.slot).toBe("armor");
    expect(row?.equipped).toBe(1);
  });

  it("holds a library entry to its category when its author named no slot", async () => {
    const forged = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Dwarven Mail",
      category: "armor",
    });
    const mail = await seedItem(sheet, 1, "Dwarven Mail", { worldItemId: forged });
    await equipItem(mail, formData({ slot: "boots" }));
    expect((await rowOf(mail))?.equipped).toBe(0);
    await equipItem(mail, formData({}));
    expect((await rowOf(mail))?.slot).toBe("armor");
  });

  it("lets a library entry's own slot outrank its category", async () => {
    // A homebrew shield: filed under armour, worn in a hand because its author
    // said so. The category rule must not overrule them.
    const forged = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Oaken Buckler",
      category: "armor",
      slot: "hands",
    });
    const buckler = await seedItem(sheet, 1, "Oaken Buckler", { worldItemId: forged });
    await equipItem(buckler, formData({ slot: "hands" }));
    expect((await rowOf(buckler))?.slot).toBe("hands");
    expect((await rowOf(buckler))?.equipped).toBe(1);
  });

  it("leaves a hand-typed line free to be worn anywhere", async () => {
    // No source ever spoke for it, so the player's word is the only word.
    const trinket = await seedItem(sheet, 1, "Grandmother's Charm");
    await equipItem(trinket, formData({ slot: "neck" }));
    expect((await rowOf(trinket))?.slot).toBe("neck");
  });

  it("unequipItem takes the piece off but keeps its slot", async () => {
    const helm = await seedItem(sheet, 1, "Iron Helm", { slot: "head", equipped: 1 });
    await unequipItem(helm);
    const row = await rowOf(helm);
    expect(row?.equipped).toBe(0);
    expect(row?.slot).toBe("head");
  });
});

describe("addItem takes a reference, never the numbers", () => {
  it("snapshots slot and bonuses off the named library entry", async () => {
    const forged = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Emberfang Dagger",
      slot: "weapon",
      statBonuses: JSON.stringify({ ac: 1, str: 2 }),
    });
    await addItem(sheet, formData({ name: "Emberfang Dagger", worldItemId: forged }));

    const [row] = await rowsOf(sheet);
    expect(row.worldItemId).toBe(forged);
    expect(row.slot).toBe("weapon");
    expect(sumStatBonuses([row.statBonuses])).toEqual({ ac: 1, str: 2 });
  });

  it("drops a library id belonging to a world this table does not play in", async () => {
    const ours = await seedWorldItem(fx.worldId, fx.dm, { slot: "head" });
    const theirWorld = await seedExtraWorld(fx.owner);
    const foreign = await seedWorldItem(theirWorld, fx.owner, {
      slot: "armor",
      statBonuses: JSON.stringify({ ac: 5 }),
    });
    await addItem(sheet, formData({ name: "Borrowed Plate", worldItemId: foreign }));

    const [row] = await rowsOf(sheet);
    // The line is still written — it just lands as a plain hand-typed item
    // rather than borrowing a stranger's stats.
    expect(row.name).toBe("Borrowed Plate");
    expect(row.worldItemId).toBeNull();
    expect(row.slot).toBeNull();
    expect(row.statBonuses).toBeNull();
    // The honest one from this world still attaches.
    await addItem(sheet, formData({ name: "Ours", worldItemId: ours }));
    expect((await rowsOf(sheet))[1].worldItemId).toBe(ours);
  });

  it("never takes bonuses straight off the form", async () => {
    await addItem(
      sheet,
      formData({ name: "Ring of Cheating", statBonuses: JSON.stringify({ ac: 10 }), slot: "ring" })
    );
    const [row] = await rowsOf(sheet);
    // The slot a player names is theirs to name; the numbers are not.
    expect(row.slot).toBe("ring");
    expect(row.statBonuses).toBeNull();
  });

  it("resolves an SRD index to its own slot, and a bad one to nothing", async () => {
    await addItem(sheet, formData({ name: "Shield", srdIndex: "shield" }));
    await addItem(sheet, formData({ name: "Nonsense", srdIndex: "not-a-real-item" }));

    const rows = await rowsOf(sheet);
    expect(rows[0].srdIndex).toBe("shield");
    // A shield is held, not worn on the body — the one guess the SRD allows.
    expect(rows[0].slot).toBe("hands");
    expect(rows[0].notes).toBeTruthy();
    expect(rows[1].srdIndex).toBeNull();
    expect(rows[1].slot).toBeNull();
  });
});

describe("sumStatBonuses", () => {
  it("adds the worn pieces together and drops what cancels out", () => {
    expect(
      sumStatBonuses([
        JSON.stringify({ ac: 2, str: 1 }),
        JSON.stringify({ ac: 1, str: -1 }),
        null,
        "not json at all",
      ])
    ).toEqual({ ac: 3 });
  });

  it("refuses a value no single item could have carried", () => {
    expect(sumStatBonuses([JSON.stringify({ ac: 99, dex: "3", cha: 2 })])).toEqual({ cha: 2 });
  });
});
