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

import { levelUpCharacter } from "@/lib/character-actions";
import { campaignEvents, characters, characterSpellSlots } from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import {
  formData,
  seedCharacter,
  seedSpellSlot,
  seedWorld,
  type Fixture,
} from "./support/seed";

let fx: Fixture;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
  auth.userId = fx.player;
});

const readCharacter = (id: string) =>
  db.query.characters.findFirst({ where: eq(characters.id, id) });

const table = (characterId: string) =>
  db
    .select()
    .from(characterSpellSlots)
    .where(eq(characterSpellSlots.characterId, characterId))
    .orderBy(asc(characterSpellSlots.level));

/**
 * A sheet with the three columns this action reads: what it is, how far along,
 * and the Constitution the book's average is computed from. `seedCharacter`
 * has no opinion on the last two, so they are written straight in.
 */
async function seedLeveller(values: {
  klass?: string;
  level: number;
  maxHp?: number | null;
  currentHp?: number | null;
  con?: number | null;
  subclass?: string | null;
}) {
  const id = await seedCharacter(fx.campaignId, fx.player, values.maxHp ?? 20, {
    klass: values.klass,
    level: values.level,
  });
  await db
    .update(characters)
    .set({
      maxHp: values.maxHp === undefined ? 20 : values.maxHp,
      currentHp: values.currentHp ?? null,
      con: values.con ?? null,
      subclass: values.subclass ?? null,
    })
    .where(eq(characters.id, id));
  return id;
}

describe("levelUpCharacter", () => {
  it("moves the level, the maximum and the current hit points together", async () => {
    const sheet = await seedLeveller({
      klass: "Fighter",
      level: 3,
      maxHp: 28,
      currentHp: 11,
      con: 14,
    });
    await levelUpCharacter(sheet, formData({ hpGain: "6" }));
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(4);
    expect(row?.maxHp).toBe(34);
    expect(row?.currentHp).toBe(17);
  });

  it("offers the book's average when the box is left blank", async () => {
    // d10, Constitution 14: half the die rounded up is 6, plus a +2 modifier.
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, maxHp: 28, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "" }));
    expect((await readCharacter(sheet))?.maxHp).toBe(36);
  });

  it("leaves the hit points alone when there is no average to offer", async () => {
    const sheet = await seedLeveller({
      klass: "Rune Cannoneer",
      level: 3,
      maxHp: 28,
      currentHp: 11,
    });
    await levelUpCharacter(sheet, formData({ hpGain: "" }));
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(4);
    expect(row?.maxHp).toBe(28);
    expect(row?.currentHp).toBe(11);
  });

  it("leaves untouched hit points untouched", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, maxHp: 28, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6" }));
    expect((await readCharacter(sheet))?.currentHp).toBeNull();
  });

  it("writes a maximum onto a sheet that never had one", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, maxHp: null, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "7" }));
    expect((await readCharacter(sheet))?.maxHp).toBe(7);
  });

  it("stops at twentieth level", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 20, maxHp: 160, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6" }));
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(20);
    expect(row?.maxHp).toBe(160);
  });

  it("refuses someone with no place at the table", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3 });
    auth.userId = fx.stranger;
    await levelUpCharacter(sheet, formData({ hpGain: "6" }));
    expect((await readCharacter(sheet))?.level).toBe(3);
  });

  it("leaves a line in the campaign's feed", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6" }));
    const events = await db.select().from(campaignEvents);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("character");
    expect(JSON.parse(events[0].message)).toMatchObject({
      k: "leveledUp",
      p: { character: "Vex", n: 4 },
    });
  });
});

describe("levelUpCharacter · spell slots", () => {
  it("retunes the table to the new level and keeps the spent slots spent", async () => {
    const caster = await seedLeveller({ klass: "Wizard", level: 4, con: 12 });
    await seedSpellSlot(caster, 1, 4, 2);
    await seedSpellSlot(caster, 2, 3, 1);
    await levelUpCharacter(caster, formData({ hpGain: "4" }));
    expect(await table(caster)).toMatchObject([
      { level: 1, total: 4, used: 2 },
      { level: 2, total: 3, used: 1 },
      { level: 3, total: 2, used: 0 },
    ]);
  });

  it("leaves a class the tables do not speak for exactly as it was", async () => {
    const martial = await seedLeveller({ klass: "Barbarian", level: 3, con: 14 });
    await seedSpellSlot(martial, 4, 2, 1);
    await levelUpCharacter(martial, formData({ hpGain: "8" }));
    expect(await table(martial)).toMatchObject([{ level: 4, total: 2, used: 1 }]);
  });
});

describe("levelUpCharacter · subclass", () => {
  it("writes the path chosen on the way to fourth level", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6", subclass: "Battle Master" }));
    expect((await readCharacter(sheet))?.subclass).toBe("Battle Master");
  });

  it("writes it on the step that reaches third level", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 2, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6", subclass: "Champion" }));
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(3);
    expect(row?.subclass).toBe("Champion");
  });

  it("ignores a path posted before the class chooses one", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 1, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6", subclass: "Champion" }));
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(2);
    expect(row?.subclass).toBeNull();
  });

  it("never overwrites a path already written", async () => {
    const sheet = await seedLeveller({
      klass: "Fighter",
      level: 5,
      con: 14,
      subclass: "Champion",
    });
    await levelUpCharacter(sheet, formData({ hpGain: "6", subclass: "Battle Master" }));
    expect((await readCharacter(sheet))?.subclass).toBe("Champion");
  });

  it("prefers a path written by hand over the one the list offered", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14 });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", subclass: "Champion", subclassCustom: "Order of the Ash" })
    );
    expect((await readCharacter(sheet))?.subclass).toBe("Order of the Ash");
  });
});
