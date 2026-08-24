import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

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

import {
  addItem,
  createCharacter,
  createUnboundCharacter,
  deleteRosterCharacter,
  rejectCharacter,
  upsertCharacter,
  useCharacterInCampaign,
} from "@/lib/character-actions";
import {
  campaignEvents,
  campaignMembers,
  campaigns,
  characterAbilities,
  characterItems,
  characterSpellSlots,
  characters,
} from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import { REDIRECT_MESSAGE } from "./stubs/next-navigation";
import {
  formData,
  seedAbility,
  seedCampaign,
  seedCharacter,
  seedItem,
  seedSpellSlot,
  seedWorld,
  seedWorldItem,
  type Fixture,
} from "./support/seed";

/**
 * A character that belongs to its player rather than to a table.
 *
 * The roster is the answer to two things one table-shaped model could never
 * hold: a hero invented on a Tuesday with nowhere to play yet, and a hero
 * whose campaign has ended and who should not end with it. Taking one to a
 * table copies it — the master stays on the roster, and the two sheets are
 * strangers from the moment the second exists. Everything below is a way of
 * asking whether that separation actually holds.
 */

let fx: Fixture;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
  auth.userId = fx.player;
});

/**
 * These actions end by redirecting, and `redirect()` ends them by throwing —
 * in Next as much as in the stub. The stub throws the destination along with
 * it, so a test can let the action run to completion *and* read where it was
 * sending the player.
 */
async function landedOn(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith(`${REDIRECT_MESSAGE}:`)) {
      return message.slice(REDIRECT_MESSAGE.length + 1);
    }
    throw e;
  }
  throw new Error("expected the action to redirect, but it returned");
}

/** Every character sitting at the shared fixture's table. */
const atTable = (campaignId = fx.campaignId) =>
  db.select().from(characters).where(eq(characters.campaignId, campaignId));

/** The roster: everything of this player's that belongs to no campaign. */
const onRoster = (userId = fx.player) =>
  db
    .select()
    .from(characters)
    .where(and(eq(characters.userId, userId), isNull(characters.campaignId)));

const copyOf = (masterId: string, campaignId = fx.campaignId) =>
  db.query.characters.findFirst({
    where: and(
      eq(characters.campaignId, campaignId),
      eq(characters.originCharacterId, masterId)
    ),
  });

/** A roster master with a name of its own, so a copy's is worth asserting. */
async function seedMaster(userId: string, name: string) {
  const id = await seedCharacter(null, userId);
  await db.update(characters).set({ name }).where(eq(characters.id, id));
  return id;
}

describe("createUnboundCharacter", () => {
  it("makes a sheet with no campaign, live from the start", async () => {
    const to = await landedOn(createUnboundCharacter(formData({ name: "Ashen" })));

    const [row] = await onRoster();
    expect(row.campaignId).toBeNull();
    expect(row.name).toBe("Ashen");
    // Approval is a DM's word, and the roster has no DM to wait for.
    expect(row.approval).toBe("approved");
    // Nothing was stamped from anything — this row is a master.
    expect(row.originCharacterId).toBeNull();
    expect(to).toBe(`/characters/${row.id}`);
  });

  it("writes no feed line — there is no campaign to write it in", async () => {
    await landedOn(createUnboundCharacter(formData({ name: "Ashen" })));
    expect(await db.select().from(campaignEvents)).toHaveLength(0);
  });

  it("refuses a nameless sheet", async () => {
    await createUnboundCharacter(formData({ name: "   " }));
    expect(await onRoster()).toHaveLength(0);
  });
});

describe("useCharacterInCampaign copies the sheet whole", () => {
  let master: string;

  beforeEach(async () => {
    master = await seedMaster(fx.player, "Ashen");
  });

  it("leaves the master on the roster, untouched", async () => {
    await landedOn(useCharacterInCampaign(master, fx.campaignId));

    const roster = await onRoster();
    expect(roster).toHaveLength(1);
    expect(roster[0].id).toBe(master);
    expect(roster[0].campaignId).toBeNull();
    // The copy is a second row, not a moved one.
    expect(await atTable()).toHaveLength(1);
  });

  it("carries the scalars over and remembers where it came from", async () => {
    await db
      .update(characters)
      .set({ klass: "Ranger", race: "Elf", level: 5, maxHp: 42, str: 14, notes: "keeps a wolf" })
      .where(eq(characters.id, master));

    const to = await landedOn(useCharacterInCampaign(master, fx.campaignId));

    const copy = await copyOf(master);
    expect(copy?.name).toBe("Ashen");
    expect(copy?.klass).toBe("Ranger");
    expect(copy?.race).toBe("Elf");
    expect(copy?.level).toBe(5);
    expect(copy?.maxHp).toBe(42);
    expect(copy?.str).toBe(14);
    expect(copy?.notes).toBe("keeps a wolf");
    expect(copy?.originCharacterId).toBe(master);
    expect(to).toBe(`/c/${fx.campaignId}/ch/${fx.player}?ch=${copy?.id}`);
  });

  it("carries columns nobody taught it about, which is the whole design", async () => {
    // Spreading the master instead of listing its columns is what makes the
    // rest of the printed sheet travel: not one line of the copy was changed
    // when subclass, speed and the personality boxes were added.
    await db
      .update(characters)
      .set({
        subclass: "College of Lore",
        background: "Sage",
        alignment: "Neutral Good",
        speed: 25,
        traits: "Hums while thinking.",
        ideals: "Knowledge is owed to everyone.",
        bonds: "The library that raised me.",
        flaws: "Cannot leave a riddle alone.",
      })
      .where(eq(characters.id, master));

    await landedOn(useCharacterInCampaign(master, fx.campaignId));

    const copy = await copyOf(master);
    expect(copy?.subclass).toBe("College of Lore");
    expect(copy?.background).toBe("Sage");
    expect(copy?.alignment).toBe("Neutral Good");
    expect(copy?.speed).toBe(25);
    expect(copy?.traits).toBe("Hums while thinking.");
    expect(copy?.ideals).toBe("Knowledge is owed to everyone.");
    expect(copy?.bonds).toBe("The library that raised me.");
    expect(copy?.flaws).toBe("Cannot leave a riddle alone.");
  });

  it("arrives rested and faceless", async () => {
    await db
      .update(characters)
      .set({ maxHp: 30, currentHp: 4, imageFile: "face.png", imageMime: "image/png" })
      .where(eq(characters.id, master));

    await landedOn(useCharacterInCampaign(master, fx.campaignId));

    const copy = await copyOf(master);
    // NULL reads as maxHp everywhere: the copy walks in at full health.
    expect(copy?.currentHp).toBeNull();
    // The portrait is one stored object; two rows naming it would let either
    // sheet's removal blank the other's face.
    expect(copy?.imageFile).toBeNull();
    expect(copy?.imageMime).toBeNull();
    // And the roster sheet kept both.
    const [kept] = await onRoster();
    expect(kept.currentHp).toBe(4);
    expect(kept.imageFile).toBe("face.png");
  });

  it("copies the inventory but cuts the library reference", async () => {
    const relic = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Emberfang Dagger",
      slot: "weapon",
      statBonuses: JSON.stringify({ str: 2 }),
    });
    await seedItem(master, 1, "Emberfang Dagger", {
      worldItemId: relic,
      slot: "weapon",
      equipped: 1,
      statBonuses: JSON.stringify({ str: 2 }),
      acBase: 12,
      acDex: "capped2",
    });
    await seedItem(master, 3, "Healing Potion", { srdIndex: "potion-of-healing" });

    await landedOn(useCharacterInCampaign(master, fx.campaignId));

    const copy = await copyOf(master);
    const lines = await db
      .select()
      .from(characterItems)
      .where(eq(characterItems.characterId, copy!.id));
    expect(lines).toHaveLength(2);

    const blade = lines.find((line) => line.name === "Emberfang Dagger")!;
    // A world's homebrew belongs to that world. The snapshot on the row is
    // what keeps the piece working at a table that cannot see the library.
    expect(blade.worldItemId).toBeNull();
    expect(blade.slot).toBe("weapon");
    expect(blade.equipped).toBe(1);
    expect(JSON.parse(blade.statBonuses!)).toEqual({ str: 2 });
    expect(blade.acBase).toBe(12);
    expect(blade.acDex).toBe("capped2");

    const potion = lines.find((line) => line.name === "Healing Potion")!;
    expect(potion.qty).toBe(3);
    // The compendium is the same book at every table, so that reference stays.
    expect(potion.srdIndex).toBe("potion-of-healing");

    // The master's own line still points at the library it was stamped from.
    const [original] = await db
      .select()
      .from(characterItems)
      .where(
        and(eq(characterItems.characterId, master), eq(characterItems.name, "Emberfang Dagger"))
      );
    expect(original.worldItemId).toBe(relic);
  });

  it("copies powers and slots with nothing spent", async () => {
    await seedAbility(master, 3, 1);
    await seedSpellSlot(master, 1, 4, 3);

    await landedOn(useCharacterInCampaign(master, fx.campaignId));

    const copy = await copyOf(master);
    const [ability] = await db
      .select()
      .from(characterAbilities)
      .where(eq(characterAbilities.characterId, copy!.id));
    expect(ability.usesMax).toBe(3);
    expect(ability.usesLeft).toBe(3);

    const [slot] = await db
      .select()
      .from(characterSpellSlots)
      .where(eq(characterSpellSlots.characterId, copy!.id));
    expect(slot.total).toBe(4);
    expect(slot.used).toBe(0);

    // The roster sheet is still as spent as it was.
    const [mine] = await db
      .select()
      .from(characterAbilities)
      .where(eq(characterAbilities.characterId, master));
    expect(mine.usesLeft).toBe(1);
  });

  it("names the party list after the first sheet a player brings", async () => {
    await landedOn(useCharacterInCampaign(master, fx.campaignId));
    const row = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, fx.campaignId),
        eq(campaignMembers.userId, fx.player)
      ),
    });
    expect(row?.characterName).toBe("Ashen");
  });

  it("writes one characterCreated line into the campaign's feed", async () => {
    await landedOn(useCharacterInCampaign(master, fx.campaignId));
    const events = await db
      .select()
      .from(campaignEvents)
      .where(eq(campaignEvents.campaignId, fx.campaignId));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].message)).toEqual({
      k: "characterCreated",
      p: { name: "Ashen" },
    });
  });
});

describe("useCharacterInCampaign follows the campaign's own rules", () => {
  it("lets the first copy in and makes the second wait for the DM", async () => {
    const first = await seedMaster(fx.player, "Ashen");
    const second = await seedMaster(fx.player, "Bryn");

    await landedOn(useCharacterInCampaign(first, fx.campaignId));
    await landedOn(useCharacterInCampaign(second, fx.campaignId));

    expect((await copyOf(first))?.approval).toBe("approved");
    expect((await copyOf(second))?.approval).toBe("pending");
    // And the party list still reads the name of the one that was let in.
    const row = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, fx.campaignId),
        eq(campaignMembers.userId, fx.player)
      ),
    });
    expect(row?.characterName).toBe("Ashen");
  });

  it("is idempotent — a second press lands on the copy the first one made", async () => {
    const master = await seedMaster(fx.player, "Ashen");

    const first = await landedOn(useCharacterInCampaign(master, fx.campaignId));
    const again = await landedOn(useCharacterInCampaign(master, fx.campaignId));

    expect(again).toBe(first);
    expect(await atTable()).toHaveLength(1);
    // No second feed line either — nothing happened the second time.
    expect(
      await db.select().from(campaignEvents).where(eq(campaignEvents.campaignId, fx.campaignId))
    ).toHaveLength(1);
  });

  it("still allows a deliberate second copy of the same person elsewhere", async () => {
    // The same hero can be run at two tables; only one copy *per campaign* is
    // what idempotency means here.
    const master = await seedMaster(fx.player, "Ashen");
    const other = await seedCampaign(fx.worldId, fx.player);

    await landedOn(useCharacterInCampaign(master, fx.campaignId));
    await landedOn(useCharacterInCampaign(master, other));

    expect(await atTable()).toHaveLength(1);
    expect(await atTable(other)).toHaveLength(1);
    expect((await copyOf(master, other))?.originCharacterId).toBe(master);
  });

  it("lands on the winner's copy when two presses genuinely overlap", async () => {
    // The read that asks "have I already brought this one here?" and the write
    // that answers it are two steps, so two taps in the same instant can both
    // read "no" and both go on to write. That window cannot be opened from
    // outside — this database runs one statement at a time — so it is opened
    // here: the check is made to answer the way the losing press sees it, and
    // the winner's copy appears in the same breath.
    //
    // What the loser must not do is surface an error. The copy the player
    // asked for exists; landing on it is the whole answer.
    const master = await seedMaster(fx.player, "Ashen");
    const lookup = db.query.characters.findFirst.bind(db.query.characters);
    let reads = 0;
    const spy = vi
      .spyOn(db.query.characters, "findFirst")
      .mockImplementation((async (config: Parameters<typeof lookup>[0]) => {
        reads += 1;
        // 1 is the master lookup; 2 is the "already here?" check.
        if (reads !== 2) return lookup(config);
        await db.insert(characters).values({
          id: "winner",
          campaignId: fx.campaignId,
          userId: fx.player,
          name: "Ashen",
          originCharacterId: master,
          updatedAt: Date.now(),
        });
        return undefined;
      }) as typeof lookup);

    try {
      const to = await landedOn(useCharacterInCampaign(master, fx.campaignId));
      expect(to).toBe(`/c/${fx.campaignId}/ch/${fx.player}?ch=winner`);
    } finally {
      spy.mockRestore();
    }

    // One copy at the table, and the loser's half-written one rolled back with
    // its transaction rather than being left behind.
    expect(await atTable()).toHaveLength(1);
    expect(await onRoster()).toHaveLength(1);
    // And no second feed line: from the campaign's side nothing happened.
    expect(
      await db.select().from(campaignEvents).where(eq(campaignEvents.campaignId, fx.campaignId))
    ).toHaveLength(0);
  });
});

/**
 * The one rule three doors into a campaign share: the player's first sheet at
 * a table is live and lends the party list its name, and everything after it
 * waits for the DM. Written out three times, it had already drifted — the
 * sheet form renamed the party list on *every* save, so a DM tidying up a
 * pending second character relabelled the player in the party.
 */
describe("the admission rule", () => {
  const memberRow = () =>
    db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, fx.campaignId),
        eq(campaignMembers.userId, fx.player)
      ),
    });

  it("lets the first quick-created sheet in and makes the second wait", async () => {
    await landedOn(createCharacter(formData({ campaignId: fx.campaignId, name: "Ashen" })));
    await landedOn(createCharacter(formData({ campaignId: fx.campaignId, name: "Bryn" })));

    const rows = await atTable();
    expect(rows.find((row) => row.name === "Ashen")?.approval).toBe("approved");
    expect(rows.find((row) => row.name === "Bryn")?.approval).toBe("pending");
    expect((await memberRow())?.characterName).toBe("Ashen");
  });

  it("carries a rename into the party list for the player's only sheet", async () => {
    await landedOn(createCharacter(formData({ campaignId: fx.campaignId, name: "Ashen" })));
    const [sheet] = await atTable();

    await upsertCharacter(
      fx.campaignId,
      fx.player,
      formData({ characterId: sheet.id, name: "Ashen the Grey" })
    );

    expect((await memberRow())?.characterName).toBe("Ashen the Grey");
  });

  it("does not let a second sheet's save rename the player in the party", async () => {
    await landedOn(createCharacter(formData({ campaignId: fx.campaignId, name: "Ashen" })));
    await landedOn(createCharacter(formData({ campaignId: fx.campaignId, name: "Bryn" })));
    const second = (await atTable()).find((row) => row.name === "Bryn")!;

    await upsertCharacter(
      fx.campaignId,
      fx.player,
      formData({ characterId: second.id, name: "Bryn the Bold" })
    );

    // The sheet took the new name; the party list is still named after the
    // character that was actually let in.
    const rows = await atTable();
    expect(rows.find((row) => row.id === second.id)?.name).toBe("Bryn the Bold");
    expect((await memberRow())?.characterName).toBe("Ashen");
  });

  it("applies the same rule to a sheet arriving from the roster", async () => {
    await landedOn(createCharacter(formData({ campaignId: fx.campaignId, name: "Ashen" })));
    const master = await seedMaster(fx.player, "Bryn");

    await landedOn(useCharacterInCampaign(master, fx.campaignId));

    expect((await copyOf(master))?.approval).toBe("pending");
    expect((await memberRow())?.characterName).toBe("Ashen");
  });
});

/**
 * The sheet form's save, aimed at the roster.
 *
 * Its create path exists for the one campaign case it was written for: a
 * player who has no sheet at this table yet, where "the sheet this user has
 * here" is a question with one answer. On the roster it has none — a player
 * may keep any number of characters — and the lookup would land on whichever
 * row came back first.
 */
describe("upsertCharacter on the roster", () => {
  it("refuses a save that names no sheet, rather than writing over one", async () => {
    const first = await seedMaster(fx.player, "Ashen");
    const second = await seedMaster(fx.player, "Bryn");

    await upsertCharacter(null, fx.player, formData({ name: "Ghost" }));

    const roster = await onRoster();
    expect(roster).toHaveLength(2);
    expect(roster.find((row) => row.id === first)?.name).toBe("Ashen");
    expect(roster.find((row) => row.id === second)?.name).toBe("Bryn");
  });

  it("still saves a roster sheet that names itself", async () => {
    const master = await seedMaster(fx.player, "Ashen");

    await upsertCharacter(
      null,
      fx.player,
      formData({ characterId: master, name: "Ashen the Grey", level: "7" })
    );

    const [row] = await onRoster();
    expect(row.name).toBe("Ashen the Grey");
    expect(row.level).toBe(7);
  });
});

/**
 * Striking a roster character out.
 *
 * The roster is where a character is kept, so deleting one is the rarest thing
 * this app does and the only thing on that page that cannot be undone. What
 * makes it safe to offer at all is that it reaches exactly one row and its
 * ledgers: a copy already being played somewhere is a different character now,
 * and it survives its master by construction.
 */
describe("deleteRosterCharacter", () => {
  let master: string;

  beforeEach(async () => {
    master = await seedMaster(fx.player, "Ashen");
  });

  it("takes the sheet and everything written on it", async () => {
    await seedItem(master, 2, "Healing Potion");
    await seedAbility(master, 3, 1);
    await seedSpellSlot(master, 1, 4, 2);

    const to = await landedOn(deleteRosterCharacter(master));

    expect(to).toBe("/characters");
    expect(await onRoster()).toHaveLength(0);
    expect(
      await db.select().from(characterItems).where(eq(characterItems.characterId, master))
    ).toHaveLength(0);
    expect(
      await db.select().from(characterAbilities).where(eq(characterAbilities.characterId, master))
    ).toHaveLength(0);
    expect(
      await db.select().from(characterSpellSlots).where(eq(characterSpellSlots.characterId, master))
    ).toHaveLength(0);
  });

  it("is not somebody else's to strike out", async () => {
    auth.userId = fx.stranger;
    await deleteRosterCharacter(master);
    expect(await onRoster()).toHaveLength(1);
  });

  it("is not the DM's either — a roster sheet answers to its player alone", async () => {
    auth.userId = fx.dm;
    await deleteRosterCharacter(master);
    expect(await onRoster()).toHaveLength(1);
  });

  it("cannot reach a sheet that has sat down at a table", async () => {
    // That one leaves by the DM's door (rejectCharacter), not this one.
    const played = await seedCharacter(fx.campaignId, fx.player);
    await deleteRosterCharacter(played);
    expect(await atTable()).toHaveLength(1);
  });

  it("leaves the copy at its table, playing on without its origin", async () => {
    await landedOn(useCharacterInCampaign(master, fx.campaignId));
    const copy = await copyOf(master);

    await landedOn(deleteRosterCharacter(master));

    const survivor = await db.query.characters.findFirst({
      where: eq(characters.id, copy!.id),
    });
    expect(survivor).toBeDefined();
    expect(survivor?.campaignId).toBe(fx.campaignId);
    // Descent is a memory, and the memory is all that is cleared.
    expect(survivor?.originCharacterId).toBeNull();
  });
});

describe("useCharacterInCampaign refuses what is not the player's to take", () => {
  it("will not stamp somebody else's roster character", async () => {
    const master = await seedMaster(fx.player, "Ashen");
    auth.userId = fx.stranger;

    await useCharacterInCampaign(master, fx.campaignId);

    expect(await atTable()).toHaveLength(0);
  });

  it("will not carry one into a campaign the player does not sit at", async () => {
    auth.userId = fx.stranger;
    const master = await seedMaster(fx.stranger, "Ashen");

    await useCharacterInCampaign(master, fx.campaignId);

    expect(await atTable()).toHaveLength(0);
    // The master is untouched, still waiting on the roster.
    expect(await onRoster(fx.stranger)).toHaveLength(1);
  });

  it("will not stamp a sheet that already belongs to a table", async () => {
    // Only a master is copyable; a sheet already in play is not a template.
    const played = await seedCharacter(fx.campaignId, fx.player);
    const other = await seedCampaign(fx.worldId, fx.player);

    await useCharacterInCampaign(played, other);

    expect(await atTable(other)).toHaveLength(0);
  });
});

describe("a roster sheet stands on its own", () => {
  let master: string;

  beforeEach(async () => {
    master = await seedMaster(fx.player, "Ashen");
  });

  it("takes compendium gear, and logs it nowhere", async () => {
    await addItem(master, formData({ name: "Leather Armor", qty: "1" }));

    const [line] = await db
      .select()
      .from(characterItems)
      .where(eq(characterItems.characterId, master));
    // The SRD is the same book at every table, so it answers here too.
    expect(line.srdIndex).toBe("leather-armor");
    expect(line.slot).toBe("armor");
    // No campaign, no feed — and no foreign key to violate reaching for one.
    expect(await db.select().from(campaignEvents)).toHaveLength(0);
  });

  it("draws nothing from a world library it does not belong to", async () => {
    const relic = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Emberfang Dagger",
      slot: "weapon",
      statBonuses: JSON.stringify({ str: 2 }),
    });

    await addItem(master, formData({ name: "Emberfang Dagger", worldItemId: relic }));

    const [line] = await db
      .select()
      .from(characterItems)
      .where(eq(characterItems.characterId, master));
    expect(line.name).toBe("Emberfang Dagger");
    expect(line.worldItemId).toBeNull();
    expect(line.statBonuses).toBeNull();
    expect(line.slot).toBeNull();
  });

  it("answers to its owner alone — no DM inherits it", async () => {
    auth.userId = fx.dm;
    await addItem(master, formData({ name: "Leather Armor" }));
    expect(
      await db.select().from(characterItems).where(eq(characterItems.characterId, master))
    ).toHaveLength(0);
  });

  it("survives a rejection aimed at it", async () => {
    // A DM's reject *deletes*. Even with the row forced into the state that
    // action looks for, a sheet at no table is not theirs to turn away.
    await db.update(characters).set({ approval: "pending" }).where(eq(characters.id, master));
    auth.userId = fx.dm;

    await rejectCharacter(master);

    expect(await onRoster()).toHaveLength(1);
  });
});

/**
 * The hub shows both piles, and the join is the whole reason it can. An inner
 * join answers only for sheets with a campaign row to match — which is every
 * sheet except the ones the roster exists for — so it would hide the pile
 * silently and look, from the page's side, like an empty roster.
 */
describe("the character hub's own query", () => {
  it("returns roster sheets alongside the played ones", async () => {
    const master = await seedMaster(fx.player, "Ashen");
    const played = await seedCharacter(fx.campaignId, fx.player);

    const rows = await db
      .select({ character: characters, campaign: campaigns })
      .from(characters)
      .leftJoin(campaigns, eq(characters.campaignId, campaigns.id))
      .where(eq(characters.userId, fx.player));

    expect(rows).toHaveLength(2);
    // The roster row comes back with nothing on the campaign side, which is
    // exactly how the page tells the two piles apart.
    expect(rows.find((row) => row.character.id === master)?.campaign).toBeNull();
    expect(rows.find((row) => row.character.id === played)?.campaign?.id).toBe(fx.campaignId);
  });
});
