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

import { adjustItemQty, longRest, useAbility } from "@/lib/character-actions";
import { adjustHp } from "@/lib/session-actions";
import {
  campaignEvents,
  characterAbilities,
  characterItems,
  combatants,
} from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import {
  formData,
  seedAbility,
  seedCharacter,
  seedCombatant,
  seedItem,
  seedSession,
  seedWorld,
  type Fixture,
} from "./support/seed";

let fx: Fixture;
let characterId: string;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
  characterId = await seedCharacter(fx.campaignId, fx.player);
  auth.userId = fx.player;
});

const readItem = (id: string) =>
  db.query.characterItems.findFirst({ where: eq(characterItems.id, id) });
const readAbility = (id: string) =>
  db.query.characterAbilities.findFirst({ where: eq(characterAbilities.id, id) });
const readCombatant = (id: string) =>
  db.query.combatants.findFirst({ where: eq(combatants.id, id) });

describe("character_items.qty", () => {
  it("deletes the row when the last one comes off the pile", async () => {
    const itemId = await seedItem(characterId, 1);
    await adjustItemQty(itemId, -1);
    expect(await readItem(itemId)).toBeUndefined();
  });

  it("keeps the row when the pile is only reduced", async () => {
    const itemId = await seedItem(characterId, 3);
    await adjustItemQty(itemId, -1);
    expect((await readItem(itemId))?.qty).toBe(2);
  });

  it("deletes rather than going negative when the delta overshoots", async () => {
    const itemId = await seedItem(characterId, 2);
    await adjustItemQty(itemId, -5);
    expect(await readItem(itemId)).toBeUndefined();
  });

  it("clamps a runaway increment at LEAST(9999, ...)", async () => {
    const itemId = await seedItem(characterId, 9_000);
    await adjustItemQty(itemId, 5_000);
    expect((await readItem(itemId))?.qty).toBe(9_999);
  });

  it("counts two hands reaching for the pile at once", async () => {
    const itemId = await seedItem(characterId, 3);
    await Promise.all([adjustItemQty(itemId, -1), adjustItemQty(itemId, -1)]);
    // The arithmetic runs inside the UPDATE, so neither read-modify-write
    // overwrites the other.
    expect((await readItem(itemId))?.qty).toBe(1);
  });

  it("writes a feed entry naming the removal, not a quantity tweak", async () => {
    const itemId = await seedItem(characterId, 1);
    await adjustItemQty(itemId, -1);
    const events = await db
      .select()
      .from(campaignEvents)
      .where(eq(campaignEvents.campaignId, fx.campaignId));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("item");
    expect(JSON.parse(events[0].message).k).toBe("itemRemoved");
  });

  it("refuses a stranger reaching into someone else's inventory", async () => {
    const itemId = await seedItem(characterId, 3);
    auth.userId = fx.stranger;
    await adjustItemQty(itemId, -3);
    expect((await readItem(itemId))?.qty).toBe(3);
  });
});

describe("character_abilities.usesLeft", () => {
  it("spends one use", async () => {
    const abilityId = await seedAbility(characterId, 3, 3);
    await useAbility(abilityId);
    expect((await readAbility(abilityId))?.usesLeft).toBe(2);
  });

  it("floors at zero instead of going negative", async () => {
    const abilityId = await seedAbility(characterId, 3, 0);
    await useAbility(abilityId);
    await useAbility(abilityId);
    expect((await readAbility(abilityId))?.usesLeft).toBe(0);
  });

  it("refills every limited-use ability on a long rest", async () => {
    const spent = await seedAbility(characterId, 3, 0);
    const partial = await seedAbility(characterId, 5, 2);
    await longRest(characterId);
    expect((await readAbility(spent))?.usesLeft).toBe(3);
    expect((await readAbility(partial))?.usesLeft).toBe(5);
  });
});

describe("combatant hp clamps", () => {
  let sessionId: string;

  beforeEach(async () => {
    sessionId = await seedSession(fx.campaignId);
    auth.userId = fx.dm;
  });

  it("floors damage at zero", async () => {
    const id = await seedCombatant(sessionId, { hp: 4, maxHp: 20 });
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "99" }));
    expect((await readCombatant(id))?.hp).toBe(0);
  });

  it("chews through temp HP before it reaches HP", async () => {
    const id = await seedCombatant(sessionId, { hp: 10, maxHp: 20, tempHp: 6 });
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "4" }));
    const after = await readCombatant(id);
    expect(after?.tempHp).toBe(2);
    expect(after?.hp).toBe(10);
  });

  it("spills the remainder into HP once temp HP is gone", async () => {
    const id = await seedCombatant(sessionId, { hp: 10, maxHp: 20, tempHp: 3 });
    await adjustHp(sessionId, id, formData({ op: "damage", amount: "8" }));
    const after = await readCombatant(id);
    expect(after?.tempHp).toBe(0);
    expect(after?.hp).toBe(5);
  });

  it("caps healing at max HP", async () => {
    const id = await seedCombatant(sessionId, { hp: 18, maxHp: 20 });
    await adjustHp(sessionId, id, formData({ op: "heal", amount: "50" }));
    expect((await readCombatant(id))?.hp).toBe(20);
  });

  it("puts no ceiling on a creature that has no max HP", async () => {
    const id = await seedCombatant(sessionId, { hp: 7, maxHp: null });
    await adjustHp(sessionId, id, formData({ op: "heal", amount: "5" }));
    expect((await readCombatant(id))?.hp).toBe(12);
  });

  it("clears the death save pips when a creature comes back from zero", async () => {
    const id = await seedCombatant(sessionId, { hp: 0, maxHp: 20, deathFailures: 2 });
    await adjustHp(sessionId, id, formData({ op: "heal", amount: "3" }));
    const after = await readCombatant(id);
    expect(after?.hp).toBe(3);
    expect(after?.deathFailures).toBe(0);
  });

  it("replaces the temp HP pool rather than stacking it", async () => {
    const id = await seedCombatant(sessionId, { hp: 10, maxHp: 20, tempHp: 8 });
    await adjustHp(sessionId, id, formData({ op: "temp", amount: "3" }));
    expect((await readCombatant(id))?.tempHp).toBe(3);
  });
});
