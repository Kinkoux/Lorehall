import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

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

import { addBeat, addChapter, deleteChapter, moveBeatToChapter } from "@/lib/beat-actions";
import { giveItem } from "@/lib/character-actions";
import { chooseActiveMap, setActiveMap } from "@/lib/map-actions";
import { adjustHp } from "@/lib/session-actions";
import {
  campaignEvents,
  campaignMaps,
  characterItems,
  characters,
  combatants,
  storyBeats,
  storyChapters,
} from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import {
  formData,
  seedBeat,
  seedCampaign,
  seedChapter,
  seedCharacter,
  seedCombatant,
  seedMap,
  seedSession,
  seedWorld,
  seedWorldItem,
  type Fixture,
} from "./support/seed";

let fx: Fixture;
/** A second table in the same world, run by the same DM. Its ids are valid — just not here. */
let elsewhere: string;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
  elsewhere = await seedCampaign(fx.worldId, fx.dm);
  auth.userId = fx.dm;
});

const beatsOf = (campaignId: string) =>
  db
    .select()
    .from(storyBeats)
    .where(eq(storyBeats.campaignId, campaignId))
    .orderBy(asc(storyBeats.position));

describe("resolveChapterId — a chapter id from a form is not a capability", () => {
  it("drops a chapter id that belongs to another campaign", async () => {
    const theirs = await seedChapter(elsewhere, 1);
    await addBeat(fx.campaignId, formData({ title: "Ambush", chapterId: theirs }));

    const beats = await beatsOf(fx.campaignId);
    expect(beats).toHaveLength(1);
    // The beat is still written — it just lands unfiled rather than inside a
    // chapter of a campaign the writer has no business filing into.
    expect(beats[0].chapterId).toBeNull();
  });

  it("honours a chapter id that does belong to this campaign", async () => {
    const ours = await seedChapter(fx.campaignId, 1);
    await addBeat(fx.campaignId, formData({ title: "Ambush", chapterId: ours }));

    const beats = await beatsOf(fx.campaignId);
    expect(beats[0].chapterId).toBe(ours);
  });

  it("drops an id that names no chapter at all", async () => {
    await addBeat(fx.campaignId, formData({ title: "Ambush", chapterId: "totally-made-up" }));
    expect((await beatsOf(fx.campaignId))[0].chapterId).toBeNull();
  });

  it("unfiles rather than re-files when moveBeatToChapter is handed a foreign chapter", async () => {
    const ours = await seedChapter(fx.campaignId, 1);
    const theirs = await seedChapter(elsewhere, 1);
    await addBeat(fx.campaignId, formData({ title: "Ambush", chapterId: ours }));
    const beat = (await beatsOf(fx.campaignId))[0];

    await moveBeatToChapter(beat.id, formData({ chapterId: theirs }));
    const after = await db.query.storyBeats.findFirst({ where: eq(storyBeats.id, beat.id) });
    expect(after?.chapterId).toBeNull();
  });

  it("leaves a chapter's beats behind when the chapter is deleted", async () => {
    const ours = await seedChapter(fx.campaignId, 1);
    await addBeat(fx.campaignId, formData({ title: "Ambush", chapterId: ours }));
    await deleteChapter(ours);

    const beats = await beatsOf(fx.campaignId);
    expect(beats).toHaveLength(1);
    expect(beats[0].chapterId).toBeNull();
    expect(await db.select().from(storyChapters)).toHaveLength(0);
  });
});

describe("DM-only story writes", () => {
  it("writes nothing when a player calls addBeat", async () => {
    auth.userId = fx.player;
    await addBeat(fx.campaignId, formData({ title: "I am the DM now" }));
    expect(await beatsOf(fx.campaignId)).toHaveLength(0);
  });

  it("writes nothing when a stranger calls addChapter", async () => {
    auth.userId = fx.stranger;
    await addChapter(fx.campaignId, formData({ title: "Prologue" }));
    expect(await db.select().from(storyChapters)).toHaveLength(0);
  });

  it("writes nothing when the world owner — who can only watch — calls addBeat", async () => {
    auth.userId = fx.owner;
    await addBeat(fx.campaignId, formData({ title: "Owner's cut" }));
    expect(await beatsOf(fx.campaignId)).toHaveLength(0);
  });

  it("ignores a beat id from another campaign in moveBeatToChapter", async () => {
    const ours = await seedChapter(fx.campaignId, 1);
    const theirBeat = await seedBeat(elsewhere, "pending", 1);
    await moveBeatToChapter(theirBeat, formData({ chapterId: ours }));
    const after = await db.query.storyBeats.findFirst({ where: eq(storyBeats.id, theirBeat) });
    // The chapter is in a campaign the beat does not live in, so it is dropped.
    expect(after?.chapterId).toBeNull();
  });
});

describe("session and map ids are scoped before they are used", () => {
  it("refuses a combatant id that belongs to another session", async () => {
    const ourSession = await seedSession(fx.campaignId);
    const theirSession = await seedSession(elsewhere);
    const theirCombatant = await seedCombatant(theirSession, { hp: 10, maxHp: 10 });

    await adjustHp(ourSession, theirCombatant, formData({ op: "damage", amount: "9" }));

    const after = await db.query.combatants.findFirst({
      where: eq(combatants.id, theirCombatant),
    });
    expect(after?.hp).toBe(10);
  });

  it("refuses to put another campaign's map on this table", async () => {
    const ourMap = await seedMap(fx.campaignId, 1, "Ours");
    const theirMap = await seedMap(elsewhere, 1, "Theirs");

    await chooseActiveMap(fx.campaignId, formData({ mapId: theirMap }));

    const rows = await db.select().from(campaignMaps);
    const ours = rows.find((row) => row.id === ourMap);
    const theirs = rows.find((row) => row.id === theirMap);
    // Our table is cleared (the DM asked for a swap) but their map is untouched
    // and never becomes ours.
    expect(ours?.isActive).toBe(0);
    expect(theirs?.isActive).toBe(1);
    expect(theirs?.campaignId).toBe(elsewhere);
  });

  it("refuses a player putting a map on the table", async () => {
    const map = await seedMap(fx.campaignId, 0, "Ours");
    auth.userId = fx.player;
    await setActiveMap(map, true);
    const after = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, map) });
    expect(after?.isActive).toBe(0);
  });
});

describe("giveItem — the campaign is the capability, not the character id", () => {
  /** Everything anyone was handed, anywhere. */
  const allItems = () => db.select().from(characterItems);

  it("writes nothing when a player hands themselves treasure", async () => {
    const sheet = await seedCharacter(fx.campaignId, fx.player);
    auth.userId = fx.player;
    await giveItem(fx.campaignId, formData({ characterId: sheet, name: "Vorpal Sword" }));
    expect(await allItems()).toHaveLength(0);
  });

  it("refuses a sheet that sits at another table, even one the same DM runs", async () => {
    const theirs = await seedCharacter(elsewhere, fx.player);
    // The id is real and the caller does run that other campaign — but they
    // are not running *this* one's hand-over, and the two are not the same key.
    await giveItem(fx.campaignId, formData({ characterId: theirs, name: "Vorpal Sword" }));
    expect(await allItems()).toHaveLength(0);
  });

  it("refuses a sheet still waiting on the DM's nod", async () => {
    const sheet = await seedCharacter(fx.campaignId, fx.player);
    await db.update(characters).set({ approval: "pending" }).where(eq(characters.id, sheet));
    await giveItem(fx.campaignId, formData({ characterId: sheet, name: "Vorpal Sword" }));
    expect(await allItems()).toHaveLength(0);
  });

  it("re-reads an SRD reference server-side rather than trusting the form", async () => {
    const sheet = await seedCharacter(fx.campaignId, fx.player);
    await giveItem(
      fx.campaignId,
      // The quantity is past the form's own ceiling and the bonus is a field
      // the DM would have had to type by hand; neither survives the round trip.
      formData({ characterId: sheet, name: "Shield", srdIndex: "shield", qty: "5000", bonus_ac: "9" })
    );

    const [row] = await allItems();
    expect(row.characterId).toBe(sheet);
    expect(row.srdIndex).toBe("shield");
    // Slot and summary come from the compendium entry the index names.
    expect(row.slot).toBe("hands");
    expect(row.notes).toBeTruthy();
    expect(row.statBonuses).toBeNull();
    expect(row.qty).toBe(999);
  });

  it("carries a world library entry's own slot and bonuses onto the sheet", async () => {
    const sheet = await seedCharacter(fx.campaignId, fx.player);
    const relic = await seedWorldItem(fx.worldId, fx.dm, {
      name: "Emberfang Dagger",
      slot: "hands",
      statBonuses: JSON.stringify({ str: 2 }),
    });
    await giveItem(
      fx.campaignId,
      formData({ characterId: sheet, name: "Emberfang Dagger", worldItemId: relic })
    );

    const [row] = await allItems();
    expect(row.worldItemId).toBe(relic);
    expect(row.slot).toBe("hands");
    expect(JSON.parse(row.statBonuses ?? "{}")).toEqual({ str: 2 });
  });

  it("names the hand-over in the feed as its own kind of event", async () => {
    const sheet = await seedCharacter(fx.campaignId, fx.player);
    await giveItem(fx.campaignId, formData({ characterId: sheet, name: "Rope", qty: "2" }));

    const events = await db
      .select()
      .from(campaignEvents)
      .where(eq(campaignEvents.campaignId, fx.campaignId));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("item");
    expect(events[0].actorId).toBe(fx.dm);
    const { k, p } = JSON.parse(events[0].message);
    // Not "itemAdded": the feed should read as the DM handing it over.
    expect(k).toBe("itemGiven");
    expect(p).toMatchObject({ name: "Rope", n: 2, character: "Vex" });
  });
});
