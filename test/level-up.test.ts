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
import {
  campaignEvents,
  characterAbilities,
  characters,
  characterSpellSlots,
} from "@/lib/db/schema";
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
  /** The other five, for the improvement tests; blank unless written. */
  scores?: Partial<Record<"str" | "dex" | "intel" | "wis" | "cha", number>>;
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
      ...values.scores,
    })
    .where(eq(characters.id, id));
  return id;
}

/** The powers list, which is where a feat lands. */
const powers = (characterId: string) =>
  db.select().from(characterAbilities).where(eq(characterAbilities.characterId, characterId));

/** The one line the feed was left, parsed back into its key and params. */
async function feedLine() {
  const events = await db.select().from(campaignEvents);
  expect(events).toHaveLength(1);
  return JSON.parse(events[0].message) as { k: string; p: Record<string, string | number> };
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

/**
 * The fifth thing a level-up can do: spend two ability points, or take a feat
 * instead. Both are gifts with a ceiling on them and a level they are given
 * at, and both are posted on a form whose other half is always present — so
 * what is guarded here is mostly what does *not* happen: a point over twenty,
 * a point into a blank column, an improvement claimed at a level that carries
 * none, a half-feat's +1 spent on an ability the feat never offered.
 */
describe("levelUpCharacter · ability points", () => {
  it("puts both points into one ability when one is picked twice", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14, scores: { dex: 14 } });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "asi", asiA: "dex", asiB: "dex" })
    );
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(4);
    expect(row?.dex).toBe(16);
  });

  it("splits them when two are picked", async () => {
    const sheet = await seedLeveller({
      klass: "Fighter",
      level: 3,
      con: 13,
      scores: { str: 12 },
    });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "asi", asiA: "str", asiB: "con" })
    );
    const row = await readCharacter(sheet);
    expect(row?.str).toBe(13);
    expect(row?.con).toBe(14);
  });

  it("reaches twenty and stops there", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14, scores: { dex: 19 } });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "asi", asiA: "dex", asiB: "dex" })
    );
    expect((await readCharacter(sheet))?.dex).toBe(20);
    // And the feed says one point, because one point is what happened.
    expect(await feedLine()).toMatchObject({ k: "leveledUpAsi", p: { gain: "+1 DEX" } });
  });

  it("levels anyway when nothing can be raised", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14, scores: { dex: 20 } });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "asi", asiA: "dex", asiB: "dex" })
    );
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(4);
    expect(row?.dex).toBe(20);
    // No improvement to report, so the plain line is the one left behind.
    expect((await feedLine()).k).toBe("leveledUp");
  });

  it("writes nothing into a score nobody has filled in", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14 });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "asi", asiA: "cha", asiB: "con" })
    );
    const row = await readCharacter(sheet);
    expect(row?.cha).toBeNull();
    expect(row?.con).toBe(15);
    expect(await feedLine()).toMatchObject({ k: "leveledUpAsi", p: { gain: "+1 CON" } });
  });

  it("ignores an ability the six columns do not answer to", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14 });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "asi", asiA: "luck", asiB: "" })
    );
    expect((await readCharacter(sheet))?.con).toBe(14);
  });

  it("ignores the whole question at a level that carries no improvement", async () => {
    // Fifth is nobody's improvement level, fighter included.
    const sheet = await seedLeveller({ klass: "Fighter", level: 4, con: 14, scores: { dex: 14 } });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "asi", asiA: "dex", asiB: "dex" })
    );
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(5);
    expect(row?.dex).toBe(14);
  });

  it("gives the fighter the extra one at sixth", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 5, con: 14, scores: { str: 15 } });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "asi", asiA: "str", asiB: "str" })
    );
    expect((await readCharacter(sheet))?.str).toBe(17);
  });

  it("gives the rogue theirs at tenth and not at sixth", async () => {
    const early = await seedLeveller({ klass: "Rogue", level: 5, con: 14, scores: { dex: 15 } });
    await levelUpCharacter(early, formData({ advance: "asi", asiA: "dex", asiB: "dex" }));
    expect((await readCharacter(early))?.dex).toBe(15);

    const tenth = await seedLeveller({ klass: "Rogue", level: 9, con: 14, scores: { dex: 15 } });
    await levelUpCharacter(tenth, formData({ advance: "asi", asiA: "dex", asiB: "dex" }));
    expect((await readCharacter(tenth))?.dex).toBe(17);
  });

  it("holds a class the book never heard of to the common five", async () => {
    const sheet = await seedLeveller({ klass: "Rune Cannoneer", level: 3, scores: { wis: 10 } });
    await levelUpCharacter(sheet, formData({ advance: "asi", asiA: "wis", asiB: "wis" }));
    expect((await readCharacter(sheet))?.wis).toBe(12);
  });

  it("spends nothing when the fold was left where it starts", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14, scores: { dex: 14 } });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "skip", asiA: "dex", asiB: "dex" })
    );
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(4);
    expect(row?.dex).toBe(14);
    expect(await powers(sheet)).toHaveLength(0);
  });
});

describe("levelUpCharacter · feats", () => {
  it("writes the feat onto the powers list as a feat", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6", advance: "feat", feat: "f-alert" }));
    expect(await powers(sheet)).toMatchObject([
      { name: "Alert", kind: "feat", srdIndex: "f-alert", notes: null, usesMax: null },
    ]);
    expect(await feedLine()).toMatchObject({ k: "leveledUpFeat", p: { name: "Alert", n: 4 } });
  });

  it("takes the half-feat's point along with it", async () => {
    const sheet = await seedLeveller({
      klass: "Fighter",
      level: 3,
      con: 14,
      scores: { wis: 12 },
    });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "feat", feat: "f-observant", featAsi: "wis" })
    );
    expect((await readCharacter(sheet))?.wis).toBe(13);
  });

  it("refuses a point the feat never offered", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14, scores: { str: 12 } });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "feat", feat: "f-observant", featAsi: "str" })
    );
    const row = await readCharacter(sheet);
    expect(row?.str).toBe(12);
    expect(await powers(sheet)).toHaveLength(1);
  });

  it("gives a feat that raises nothing no point at all", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14, scores: { dex: 12 } });
    await levelUpCharacter(
      sheet,
      formData({ hpGain: "6", advance: "feat", feat: "f-alert", featAsi: "dex" })
    );
    expect((await readCharacter(sheet))?.dex).toBe(12);
  });

  it("prefers a feat written by hand, and references nothing for it", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14 });
    await levelUpCharacter(
      sheet,
      formData({
        hpGain: "6",
        advance: "feat",
        feat: "f-alert",
        featCustom: "Oathkeeper of the Ash",
        featAsi: "con",
      })
    );
    expect(await powers(sheet)).toMatchObject([
      { name: "Oathkeeper of the Ash", kind: "feat", srdIndex: null },
    ]);
    // A feat this app knows nothing about grants nothing this app can apply.
    expect((await readCharacter(sheet))?.con).toBe(14);
  });

  it("takes no feat when the branch was ticked and nothing chosen", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 3, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6", advance: "feat" }));
    expect(await powers(sheet)).toHaveLength(0);
    expect((await readCharacter(sheet))?.level).toBe(4);
  });

  it("ignores a feat posted at a level that carries no improvement", async () => {
    const sheet = await seedLeveller({ klass: "Fighter", level: 4, con: 14 });
    await levelUpCharacter(sheet, formData({ hpGain: "6", advance: "feat", feat: "f-lucky" }));
    expect(await powers(sheet)).toHaveLength(0);
  });

  it("keeps the whole step or none of it", async () => {
    // The row and the level are one write: a character holding a feat they
    // never levelled into is a sheet somebody has to repair.
    const sheet = await seedLeveller({ klass: "Rogue", level: 9, con: 14, scores: { dex: 15 } });
    await levelUpCharacter(sheet, formData({ advance: "feat", feat: "f-resilient", featAsi: "dex" }));
    const row = await readCharacter(sheet);
    expect(row?.level).toBe(10);
    expect(row?.dex).toBe(16);
    expect(await powers(sheet)).toHaveLength(1);
  });
});
