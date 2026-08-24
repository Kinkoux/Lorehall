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

import { addItem, equipItem, setItemStats, unequipItem } from "@/lib/character-actions";
import { characterItems } from "@/lib/db/schema";
import { effectiveAc, loadWornFor, wornSetFor } from "@/lib/armor";
import { abilityScore } from "@/lib/dnd";
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

    await equipItem(fresh, {}, formData({}));

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
    await equipItem(heirloom, {}, formData({ slot: "ring" }));
    const row = await rowOf(heirloom);
    expect(row?.slot).toBe("ring");
    expect(row?.equipped).toBe(1);
  });

  it("refuses a slot name that is not one of the eight", async () => {
    const heirloom = await seedItem(sheet, 1, "Grandfather's Signet");
    await equipItem(heirloom, {}, formData({ slot: "tail" }));
    const row = await rowOf(heirloom);
    expect(row?.equipped).toBe(0);
    expect(row?.slot).toBeNull();
  });

  it("ignores a form slot for a piece that already knows where it goes", async () => {
    const boots = await seedItem(sheet, 1, "Striding Boots", { slot: "boots" });
    await equipItem(boots, {}, formData({ slot: "head" }));
    const row = await rowOf(boots);
    expect(row?.slot).toBe("boots");
    expect(await wornIn(sheet, "head")).toHaveLength(0);
  });

  it("writes nothing when another player reaches for someone else's sheet", async () => {
    const helm = await seedItem(sheet, 1, "Iron Helm", { slot: "head" });
    auth.userId = fx.stranger;
    const state = await equipItem(helm, {}, formData({}));
    expect((await rowOf(helm))?.equipped).toBe(0);
    // Refusing and doing nothing used to look identical from the sheet.
    expect(state.error).toBeTruthy();
  });

  it("lets the DM equip a piece on a player's sheet", async () => {
    const helm = await seedItem(sheet, 1, "Iron Helm", { slot: "head" });
    auth.userId = fx.dm;
    await equipItem(helm, {}, formData({}));
    expect((await rowOf(helm))?.equipped).toBe(1);
  });

  it("refuses to strap body armour to a head, whatever the form says", async () => {
    // The row itself has no slot (stocked before the sheet recorded one), so
    // the only thing standing between a breastplate and a hat is its source.
    const plate = await seedItem(sheet, 1, "Breastplate", { srdIndex: "breastplate" });
    const state = await equipItem(plate, {}, formData({ slot: "head" }));
    const row = await rowOf(plate);
    expect(row?.equipped).toBe(0);
    expect(row?.slot).toBeNull();
    expect(state.error).toBeTruthy();
  });

  it("places a piece by its source when the form names no slot", async () => {
    const plate = await seedItem(sheet, 1, "Breastplate", { srdIndex: "breastplate" });
    await equipItem(plate, {}, formData({}));
    const row = await rowOf(plate);
    expect(row?.slot).toBe("armor");
    expect(row?.equipped).toBe(1);
  });

  it("keeps a shield in a hand and a sword in the weapon slot", async () => {
    const shield = await seedItem(sheet, 1, "Shield", { srdIndex: "shield" });
    const sword = await seedItem(sheet, 1, "Longsword", { srdIndex: "longsword" });
    await equipItem(shield, {}, formData({ slot: "armor" }));
    await equipItem(sword, {}, formData({ slot: "ring" }));
    expect((await rowOf(shield))?.equipped).toBe(0);
    expect((await rowOf(sword))?.equipped).toBe(0);

    await equipItem(shield, {}, formData({}));
    await equipItem(sword, {}, formData({}));
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
    await equipItem(armour, {}, formData({}));
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
    await equipItem(mail, {}, formData({ slot: "boots" }));
    expect((await rowOf(mail))?.equipped).toBe(0);
    await equipItem(mail, {}, formData({}));
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
    await equipItem(buckler, {}, formData({ slot: "hands" }));
    expect((await rowOf(buckler))?.slot).toBe("hands");
    expect((await rowOf(buckler))?.equipped).toBe(1);
  });

  it("leaves a hand-typed line free to be worn anywhere", async () => {
    // No source ever spoke for it, so the player's word is the only word.
    const trinket = await seedItem(sheet, 1, "Grandmother's Charm");
    await equipItem(trinket, {}, formData({ slot: "neck" }));
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

  it("stamps an SRD line with what the curated reading of its prose grants", async () => {
    await addItem(sheet, formData({ name: "Amulet of Health", srdIndex: "amulet-of-health" }));
    await addItem(sheet, formData({ name: "Ring of Protection", srdIndex: "ring-of-protection" }));
    // Read by name rather than by reference — the phone-shaped path — lands
    // the same numbers.
    await addItem(sheet, formData({ name: "gauntlets of ogre power" }));

    const rows = await rowsOf(sheet);
    // The amulet states a score rather than adding to one.
    expect(sumStatBonuses([rows[0].statBonuses])).toEqual({ floors: { con: 19 } });
    // The ring's +1 is counted once: the curated entry answers, and the prose
    // parser behind it never gets a turn.
    expect(sumStatBonuses([rows[1].statBonuses])).toEqual({ ac: 1 });
    expect(sumStatBonuses([rows[2].statBonuses])).toEqual({ floors: { str: 19 } });
  });

  it("stamps nothing for a bonus that comes with a condition attached", async () => {
    // "+2 bonus to AC if you are wearing no armor and using no shield" — a
    // sentence the model cannot hold, so the line carries no numbers at all.
    await addItem(sheet, formData({ name: "Bracers of Defense", srdIndex: "bracers-of-defense" }));
    await addItem(sheet, formData({ name: "Longsword", srdIndex: "longsword" }));
    const rows = await rowsOf(sheet);
    expect(rows[0].statBonuses).toBeNull();
    expect(rows[1].statBonuses).toBeNull();
  });

  it("keeps a stated score the line editor posts back alongside the flat bonuses", async () => {
    await addItem(sheet, formData({ name: "Amulet of Health", srdIndex: "amulet-of-health" }));
    const [row] = await rowsOf(sheet);
    // The editor's floor fields arrive filled in from the line, so an ordinary
    // save carries them back unchanged while the flat bonuses are rewritten.
    await setItemStats(row.id, {}, formData({ slot: "neck", bonus_ac: "1", floor_con: "19" }));
    expect(sumStatBonuses([(await rowOf(row.id))?.statBonuses])).toEqual({
      ac: 1,
      floors: { con: 19 },
    });
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

/**
 * The line editor. Nothing it writes is trusted: the source still decides the
 * slot, the numbers are clamped, and a form nobody is allowed to submit writes
 * nothing at all.
 */
describe("setItemStats", () => {
  it("writes the base, the DEX rule and the bonuses onto the line", async () => {
    const mail = await seedItem(sheet, 1, "Adamantine Armor", { slot: "armor" });
    await setItemStats(
      mail,
      {},
      formData({ slot: "armor", acBase: "16", acDex: "capped2", bonus_ac: "1", bonus_str: "2" })
    );
    const row = await rowOf(mail);
    expect(row?.acBase).toBe(16);
    expect(row?.acDex).toBe("capped2");
    expect(sumStatBonuses([row?.statBonuses])).toEqual({ ac: 1, str: 2 });
  });

  it("clamps a base and a bonus that no piece of gear could carry", async () => {
    const cheat = await seedItem(sheet, 1, "Plate of Nonsense", { slot: "armor" });
    await setItemStats(cheat, {}, formData({ slot: "armor", acBase: "99", bonus_ac: "50" }));
    expect((await rowOf(cheat))?.acBase).toBe(30);
    expect(sumStatBonuses([(await rowOf(cheat))?.statBonuses])).toEqual({ ac: 10 });

    await setItemStats(cheat, {}, formData({ slot: "armor", acBase: "-5", bonus_dex: "-40" }));
    expect((await rowOf(cheat))?.acBase).toBe(0);
    expect(sumStatBonuses([(await rowOf(cheat))?.statBonuses])).toEqual({ dex: -10 });
  });

  it("writes the scores the line states, and they reach the sheet as floors", async () => {
    const gloves = await seedItem(sheet, 1, "Gauntlets of Ogre Power", {
      slot: "hands",
      equipped: 1,
    });
    await setItemStats(
      gloves,
      {},
      formData({ slot: "hands", floor_str: "21", floor_con: "19", bonus_ac: "1" })
    );
    const worn = sumStatBonuses([(await rowOf(gloves))?.statBonuses]);
    expect(worn).toEqual({ ac: 1, floors: { str: 21, con: 19 } });
    // The point of a floor, and the reason it is not a flat bonus: it states
    // the score rather than adding to it, and does nothing at all to a
    // character who is already stronger than the sentence.
    expect(abilityScore(8, worn.str ?? 0, worn.floors?.str)).toBe(21);
    expect(abilityScore(22, worn.str ?? 0, worn.floors?.str)).toBe(22);
  });

  it("clamps a floor to a score a creature could have", async () => {
    const stone = await seedItem(sheet, 1, "Ioun Stone", { slot: "head" });
    await setItemStats(stone, {}, formData({ slot: "head", floor_wis: "99", floor_dex: "-4" }));
    expect(sumStatBonuses([(await rowOf(stone))?.statBonuses])).toEqual({
      floors: { wis: 30, dex: 1 },
    });
  });

  it("leaves the floors key out entirely when every floor field is blank", async () => {
    const ring = await seedItem(sheet, 1, "Plain Ring", { slot: "ring" });
    await setItemStats(
      ring,
      {},
      formData({ slot: "ring", bonus_ac: "1", floor_str: "", floor_cha: "" })
    );
    // The stored JSON is the flat half and nothing else — no empty `floors`
    // object riding along for a line that states no score.
    expect((await rowOf(ring))?.statBonuses).toBe(JSON.stringify({ ac: 1 }));
    // And a form blank end to end is a plain item again, not an item granting
    // an empty promise.
    await setItemStats(ring, {}, formData({ slot: "ring" }));
    expect((await rowOf(ring))?.statBonuses).toBeNull();
  });

  it("takes a cleared floor field as the deletion it now is", async () => {
    // The behaviour that changed with the floor fields: the form used to be
    // silent about floors and the action carried the stored one through. The
    // form states them now, so a player who empties the box means it.
    const amulet = await seedItem(sheet, 1, "Amulet of Health", {
      slot: "neck",
      statBonuses: JSON.stringify({ floors: { con: 19 } }),
    });
    await setItemStats(amulet, {}, formData({ slot: "neck", bonus_ac: "1" }));
    expect(sumStatBonuses([(await rowOf(amulet))?.statBonuses])).toEqual({ ac: 1 });
  });

  it("refuses a DEX rule that is not one of the three, and blanks that say nothing", async () => {
    const mail = await seedItem(sheet, 1, "Star Mail", { slot: "armor" });
    await setItemStats(mail, {}, formData({ slot: "armor", acDex: "sideways", acBase: "" }));
    const row = await rowOf(mail);
    expect(row?.acDex).toBeNull();
    expect(row?.acBase).toBeNull();
    // Every bonus blank is a plain item again — NULL, not an empty object.
    expect(row?.statBonuses).toBeNull();
  });

  it("holds a line to the slot its source insists on", async () => {
    // The very case this feature exists for: SRD magic armour, which states
    // its class in prose. Its slot is still not the player's to move.
    const plate = await seedItem(sheet, 1, "Adamantine Armor", {
      srdIndex: "adamantine-armor",
    });
    await setItemStats(plate, {}, formData({ slot: "head", acBase: "16" }));
    const row = await rowOf(plate);
    expect(row?.slot).toBe("armor");
    expect(row?.acBase).toBe(16);
  });

  it("lets a line with no source be moved, and blank means carried", async () => {
    const charm = await seedItem(sheet, 1, "Grandmother's Charm", { slot: "ring" });
    await setItemStats(charm, {}, formData({ slot: "neck" }));
    expect((await rowOf(charm))?.slot).toBe("neck");
    await setItemStats(charm, {}, formData({ slot: "" }));
    expect((await rowOf(charm))?.slot).toBeNull();
  });

  it("takes a worn piece off when its square changes, and leaves it on when it does not", async () => {
    const helm = await seedItem(sheet, 1, "Iron Helm", { slot: "head", equipped: 1 });
    // Same square: still worn, and the new numbers are in play immediately.
    await setItemStats(helm, {}, formData({ slot: "head", bonus_ac: "1" }));
    expect((await rowOf(helm))?.equipped).toBe(1);

    await setItemStats(helm, {}, formData({ slot: "ring" }));
    const row = await rowOf(helm);
    expect(row?.slot).toBe("ring");
    // A helm cannot still be the worn head once it has become a ring.
    expect(row?.equipped).toBe(0);
    expect(await wornIn(sheet, "head")).toHaveLength(0);
  });

  it("writes nothing when someone else reaches for the sheet, and everything for the DM", async () => {
    const helm = await seedItem(sheet, 1, "Iron Helm", { slot: "head" });
    auth.userId = fx.stranger;
    await setItemStats(helm, {}, formData({ slot: "head", acBase: "20" }));
    expect((await rowOf(helm))?.acBase).toBeNull();

    auth.userId = fx.dm;
    await setItemStats(helm, {}, formData({ slot: "head", acBase: "20" }));
    expect((await rowOf(helm))?.acBase).toBe(20);
  });
});

describe("loadWornFor", () => {
  it("answers for a whole party in one query, gear and sums together", async () => {
    const other = await seedCharacter(fx.campaignId, fx.dm);
    await seedItem(sheet, 1, "Adamantine Armor", {
      slot: "armor",
      equipped: 1,
      srdIndex: "adamantine-armor",
      acBase: 16,
      acDex: "none",
    });
    await seedItem(sheet, 1, "Ring of Protection", {
      slot: "ring",
      equipped: 1,
      statBonuses: JSON.stringify({ ac: 1, dex: 2 }),
    });
    // Carried, not worn: it belongs to neither answer.
    await seedItem(sheet, 1, "Spare Shield", { slot: "hands", srdIndex: "shield" });
    await seedItem(other, 1, "Iron Helm", { slot: "head", equipped: 1 });

    const loaded = await loadWornFor([sheet, other, "nobody"]);
    const gear = wornSetFor(loaded, sheet);
    expect(gear.worn).toHaveLength(2);
    expect(gear.bonuses).toEqual({ ac: 1, dex: 2 });
    expect(wornSetFor(loaded, other).worn).toHaveLength(1);
    // A character with nothing on is an empty answer, never undefined.
    expect(wornSetFor(loaded, "nobody")).toEqual({ worn: [], bonuses: {} });

    // And the whole point: the list page's armour class agrees with the sheet.
    const ac = effectiveAc({ armorClass: null, dex: 16 }, gear.worn, gear.bonuses);
    expect(ac.value).toBe(17); // 16 typed base + 1 from the ring
  });

  it("takes the bonuses off the library entry for a line stocked before snapshots", async () => {
    const forged = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Cloak of the Fox",
      slot: "neck",
      statBonuses: JSON.stringify({ dex: 2 }),
    });
    await seedItem(sheet, 1, "Cloak of the Fox", {
      slot: "neck",
      equipped: 1,
      worldItemId: forged,
    });
    expect(wornSetFor(await loadWornFor([sheet]), sheet).bonuses).toEqual({ dex: 2 });
  });

  it("asks nothing at all when there is nobody to ask about", async () => {
    expect(await loadWornFor([])).toEqual(new Map());
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
