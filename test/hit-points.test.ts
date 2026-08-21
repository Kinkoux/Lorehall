import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

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

import { hpCondition } from "@/lib/dnd";
import { adjustCharacterHp, longRest } from "@/lib/character-actions";
import { adjustHp, joinInitiative } from "@/lib/session-actions";
import { campaignMembers, characters, combatants } from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import {
  formData,
  seedCharacter,
  seedCombatant,
  seedSession,
  seedUser,
  seedWorld,
  type Fixture,
} from "./support/seed";

let fx: Fixture;
let sessionId: string;
let characterId: string;

const readCharacter = (id: string) =>
  db.query.characters.findFirst({ where: eq(characters.id, id) });
const readCombatant = (id: string) =>
  db.query.combatants.findFirst({ where: eq(combatants.id, id) });

/** The sheet's stored hit points, straight in — no action has an "set" op. */
const setCurrentHp = (id: string, currentHp: number | null) =>
  db.update(characters).set({ currentHp }).where(eq(characters.id, id));

/**
 * An initiative row that came from a sheet, which is what makes it a *player's*
 * row rather than a monster's. `seedCombatant` mints monsters (character_id
 * NULL) and that difference is the whole subject of these tests.
 */
let combatantSeq = 0;
async function seedLinkedCombatant(
  session: string,
  character: string,
  userId: string,
  hp: { hp: number; maxHp: number | null }
) {
  const id = `linked-${(combatantSeq += 1)}`;
  await db.insert(combatants).values({
    id,
    sessionId: session,
    name: "Vex",
    initiative: 15,
    hp: hp.hp,
    maxHp: hp.maxHp,
    userId,
    characterId: character,
    createdAt: Date.now(),
  });
  return id;
}

/** A second real player at the same table, for "not your row" checks. */
async function seedSecondPlayer() {
  const id = await seedUser("player2");
  await db.insert(campaignMembers).values({
    campaignId: fx.campaignId,
    userId: id,
    characterName: "Bram",
    joinedAt: Date.now(),
  });
  return id;
}

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
  characterId = await seedCharacter(fx.campaignId, fx.player, 20);
  sessionId = await seedSession(fx.campaignId);
  auth.userId = fx.player;
});

describe("hpCondition", () => {
  it("says nothing about a creature with no maximum", () => {
    expect(hpCondition(7, null)).toBeNull();
    expect(hpCondition(null, 20)).toBeNull();
    expect(hpCondition(7, 0)).toBeNull();
  });

  it("calls zero hit points down", () => {
    expect(hpCondition(0, 20)).toBe("down");
  });

  it("calls more than three quarters unscathed", () => {
    expect(hpCondition(20, 20)).toBe("unscathed");
    expect(hpCondition(16, 20)).toBe("unscathed");
  });

  it("calls exactly three quarters wounded", () => {
    expect(hpCondition(15, 20)).toBe("wounded");
  });

  it("keeps calling it wounded down to two fifths", () => {
    expect(hpCondition(8, 20)).toBe("wounded");
  });

  it("calls anything under two fifths badly wounded", () => {
    expect(hpCondition(7, 20)).toBe("badlyWounded");
    expect(hpCondition(1, 20)).toBe("badlyWounded");
  });
});

describe("adjustCharacterHp", () => {
  it("starts from the maximum when nobody has touched the sheet yet", async () => {
    await adjustCharacterHp(characterId, formData({ op: "damage", amount: "5" }));
    expect((await readCharacter(characterId))?.currentHp).toBe(15);
  });

  it("floors damage at zero", async () => {
    await adjustCharacterHp(characterId, formData({ op: "damage", amount: "99" }));
    expect((await readCharacter(characterId))?.currentHp).toBe(0);
  });

  it("caps healing at the sheet's own maximum", async () => {
    await setCurrentHp(characterId, 18);
    await adjustCharacterHp(characterId, formData({ op: "heal", amount: "50" }));
    expect((await readCharacter(characterId))?.currentHp).toBe(20);
  });

  it("starts a sheet with no maximum at zero", async () => {
    const noMax = await seedCharacter(fx.campaignId, fx.player, 0);
    await db.update(characters).set({ maxHp: null }).where(eq(characters.id, noMax));
    await adjustCharacterHp(noMax, formData({ op: "heal", amount: "5" }));
    expect((await readCharacter(noMax))?.currentHp).toBe(5);
  });

  it("fences a sheet with no maximum in at 9999", async () => {
    const noMax = await seedCharacter(fx.campaignId, fx.player, 0);
    await db.update(characters).set({ maxHp: null }).where(eq(characters.id, noMax));
    await setCurrentHp(noMax, 9998);
    await adjustCharacterHp(noMax, formData({ op: "heal", amount: "50" }));
    expect((await readCharacter(noMax))?.currentHp).toBe(9999);
  });

  it("lets the DM patch up a player's sheet", async () => {
    auth.userId = fx.dm;
    await adjustCharacterHp(characterId, formData({ op: "damage", amount: "4" }));
    expect((await readCharacter(characterId))?.currentHp).toBe(16);
  });

  it("refuses someone with no place at the table", async () => {
    auth.userId = fx.stranger;
    await adjustCharacterHp(characterId, formData({ op: "damage", amount: "4" }));
    expect((await readCharacter(characterId))?.currentHp).toBeNull();
  });

  it("ignores a negative amount", async () => {
    await adjustCharacterHp(characterId, formData({ op: "damage", amount: "-5" }));
    expect((await readCharacter(characterId))?.currentHp).toBeNull();
  });
});

describe("adjustHp authority", () => {
  it("lets a player mark damage on their own character's row", async () => {
    const id = await seedLinkedCombatant(sessionId, characterId, fx.player, {
      hp: 20,
      maxHp: 20,
    });
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "6" }));
    expect((await readCombatant(id))?.hp).toBe(14);
  });

  it("refuses a player another player's row", async () => {
    const other = await seedSecondPlayer();
    const otherSheet = await seedCharacter(fx.campaignId, other, 20);
    const id = await seedLinkedCombatant(sessionId, otherSheet, other, {
      hp: 20,
      maxHp: 20,
    });
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "6" }));
    expect((await readCombatant(id))?.hp).toBe(20);
  });

  it("refuses a player a monster's row", async () => {
    const id = await seedCombatant(sessionId, { hp: 20, maxHp: 20 });
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "6" }));
    expect((await readCombatant(id))?.hp).toBe(20);
  });

  it("still lets the DM hit anything on the table", async () => {
    const id = await seedCombatant(sessionId, { hp: 20, maxHp: 20 });
    auth.userId = fx.dm;
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "6" }));
    expect((await readCombatant(id))?.hp).toBe(14);
  });
});

describe("combatant → sheet sync", () => {
  it("writes damage through to the character sheet", async () => {
    const id = await seedLinkedCombatant(sessionId, characterId, fx.player, {
      hp: 20,
      maxHp: 20,
    });
    auth.userId = fx.dm;
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "6" }));
    expect((await readCombatant(id))?.hp).toBe(14);
    expect((await readCharacter(characterId))?.currentHp).toBe(14);
  });

  it("writes healing through as the same number the row settled on", async () => {
    const id = await seedLinkedCombatant(sessionId, characterId, fx.player, {
      hp: 4,
      maxHp: 20,
    });
    await setCurrentHp(characterId, 4);
    await adjustHp(sessionId, id, formData({ op: "heal", amount: "50" }));
    expect((await readCombatant(id))?.hp).toBe(20);
    expect((await readCharacter(characterId))?.currentHp).toBe(20);
  });

  it("leaves the sheets alone when the row is a monster", async () => {
    const id = await seedCombatant(sessionId, { hp: 20, maxHp: 20 });
    auth.userId = fx.dm;
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "6" }));
    expect((await readCharacter(characterId))?.currentHp).toBeNull();
  });
});

describe("joinInitiative seeding", () => {
  const myRow = () =>
    db.query.combatants.findFirst({
      where: and(eq(combatants.sessionId, sessionId), eq(combatants.userId, fx.player)),
    });

  it("walks in at the hit points the sheet carries", async () => {
    await setCurrentHp(characterId, 7);
    await joinInitiative(sessionId, formData({ initiative: "12" }));
    const row = await myRow();
    expect(row?.hp).toBe(7);
    expect(row?.maxHp).toBe(20);
  });

  it("walks in at full health when nothing has touched the sheet", async () => {
    await joinInitiative(sessionId, formData({ initiative: "12" }));
    expect((await myRow())?.hp).toBe(20);
  });
});

describe("longRest", () => {
  it("puts the hit points back to the maximum", async () => {
    await setCurrentHp(characterId, 3);
    await longRest(characterId);
    expect((await readCharacter(characterId))?.currentHp).toBe(20);
  });
});
