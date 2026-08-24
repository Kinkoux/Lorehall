import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";

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
  longRest,
  rejectCharacter,
  restoreSpellSlot,
  setSpellSlots,
  shortRest,
  spendSpellSlot,
  suggestFromClass,
} from "@/lib/character-actions";
import { suggestSlots } from "@/lib/spell-slots";
import { characterAbilities, characters, characterSpellSlots } from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import {
  formData,
  seedAbility,
  seedCharacter,
  seedSpellSlot,
  seedWorld,
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

/** The tracker's rows for a sheet, in the order the page draws them. */
const table = (characterId: string) =>
  db
    .select()
    .from(characterSpellSlots)
    .where(eq(characterSpellSlots.characterId, characterId))
    .orderBy(asc(characterSpellSlots.level));

const rowAt = (characterId: string, level: number) =>
  db.query.characterSpellSlots.findFirst({
    where: and(
      eq(characterSpellSlots.characterId, characterId),
      eq(characterSpellSlots.level, level)
    ),
  });

describe("suggestSlots", () => {
  it("gives a full caster the book's column", () => {
    expect(suggestSlots("Wizard", 5)).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 2 },
    ]);
    expect(suggestSlots("Cleric", 1)).toEqual([{ level: 1, total: 2 }]);
    expect(suggestSlots("Level 20 Druid", 20)).toHaveLength(9);
  });

  it("reads the class out of free text, in either language", () => {
    // The same needles the class plate matches on — one list, one answer.
    expect(suggestSlots("büyücü", 3)).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 2 },
    ]);
    expect(suggestSlots("OZAN", 1)).toEqual([{ level: 1, total: 2 }]);
  });

  it("starts a half caster at level 2, and never as far along", () => {
    // A paladin at level 1 is a caster with nothing yet — an empty table, not
    // "this class has no table", which is what null means.
    expect(suggestSlots("Paladin", 1)).toEqual([]);
    expect(suggestSlots("Ranger", 5)).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 2 },
    ]);
    expect(suggestSlots("Paladin", 20)).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 3 },
      { level: 4, total: 3 },
      { level: 5, total: 2 },
    ]);
  });

  it("writes a warlock's pact slots as one row at their own level", () => {
    expect(suggestSlots("Warlock", 5)).toEqual([{ level: 3, total: 2 }]);
    expect(suggestSlots("Warlock", 1)).toEqual([{ level: 1, total: 1 }]);
    expect(suggestSlots("Warlock", 11)).toEqual([{ level: 5, total: 3 }]);
    expect(suggestSlots("Warlock", 20)).toEqual([{ level: 5, total: 4 }]);
  });

  it("answers null for a class with no table, written or not", () => {
    expect(suggestSlots("Rune Cannoneer", 5)).toBeNull();
    expect(suggestSlots("Barbarian", 9)).toBeNull();
    expect(suggestSlots("Fighter", 9)).toBeNull();
    expect(suggestSlots(null, 5)).toBeNull();
    expect(suggestSlots("", 5)).toBeNull();
  });

  it("stops climbing past level 20", () => {
    expect(suggestSlots("Wizard", 30)).toEqual(suggestSlots("Wizard", 20));
  });
});

describe("setSpellSlots", () => {
  it("writes the levels it is given and drops the blanks", async () => {
    await setSpellSlots(sheet, formData({ level1: "4", level2: "3", level5: "" }));
    expect(await table(sheet)).toMatchObject([
      { level: 1, total: 4, used: 0 },
      { level: 2, total: 3, used: 0 },
    ]);
  });

  it("removes a level set back to zero", async () => {
    await seedSpellSlot(sheet, 1, 4);
    await seedSpellSlot(sheet, 2, 3);
    await setSpellSlots(sheet, formData({ level1: "4", level2: "0" }));
    expect(await table(sheet)).toHaveLength(1);
  });

  it("keeps what is already spent, and pulls it down with a smaller total", async () => {
    await seedSpellSlot(sheet, 1, 4, 3);
    await setSpellSlots(sheet, formData({ level1: "2" }));
    // Three slots were burned; the table now holds two, so two are burned.
    expect(await rowAt(sheet, 1)).toMatchObject({ total: 2, used: 2 });
  });

  it("clamps a typo instead of taking it", async () => {
    await setSpellSlots(sheet, formData({ level1: "99", level2: "-4" }));
    expect(await table(sheet)).toMatchObject([{ level: 1, total: 9 }]);
  });

  it("refuses a stranger reaching for someone else's slots", async () => {
    await seedSpellSlot(sheet, 1, 4);
    auth.userId = fx.stranger;
    await setSpellSlots(sheet, formData({ level1: "9" }));
    expect(await rowAt(sheet, 1)).toMatchObject({ total: 4 });
  });
});

describe("suggestFromClass", () => {
  it("overwrites the totals from the sheet's own class and level", async () => {
    const caster = await seedCharacter(fx.campaignId, fx.player, 20, {
      klass: "Wizard",
      level: 5,
    });
    await seedSpellSlot(caster, 1, 1, 1);
    await suggestFromClass(caster);
    expect(await table(caster)).toMatchObject([
      // The one spent slot is still spent — the button is not a rest.
      { level: 1, total: 4, used: 1 },
      { level: 2, total: 3, used: 0 },
      { level: 3, total: 2, used: 0 },
    ]);
  });

  it("leaves a class it cannot read alone rather than clearing it", async () => {
    const homebrew = await seedCharacter(fx.campaignId, fx.player, 20, {
      klass: "Rune Cannoneer",
      level: 7,
    });
    await seedSpellSlot(homebrew, 4, 2, 1);
    await suggestFromClass(homebrew);
    expect(await table(homebrew)).toMatchObject([{ level: 4, total: 2, used: 1 }]);
  });
});

describe("spendSpellSlot / restoreSpellSlot", () => {
  it("burns one, and stops at the last one", async () => {
    await seedSpellSlot(sheet, 1, 2);
    await spendSpellSlot(sheet, 1);
    expect((await rowAt(sheet, 1))?.used).toBe(1);
    await spendSpellSlot(sheet, 1);
    await spendSpellSlot(sheet, 1);
    expect((await rowAt(sheet, 1))?.used).toBe(2);
  });

  it("gives one back, and floors at nothing spent", async () => {
    await seedSpellSlot(sheet, 3, 2, 1);
    await restoreSpellSlot(sheet, 3);
    await restoreSpellSlot(sheet, 3);
    expect((await rowAt(sheet, 3))?.used).toBe(0);
  });

  it("counts two casts that land at the same instant", async () => {
    await seedSpellSlot(sheet, 1, 4);
    await Promise.all([spendSpellSlot(sheet, 1), spendSpellSlot(sheet, 1)]);
    // The arithmetic runs inside the UPDATE, so neither read-modify-write
    // overwrites the other.
    expect((await rowAt(sheet, 1))?.used).toBe(2);
  });

  it("touches nothing for a level the table could never hold", async () => {
    await seedSpellSlot(sheet, 1, 4);
    await spendSpellSlot(sheet, 0);
    await spendSpellSlot(sheet, 10);
    await spendSpellSlot(sheet, 1.5);
    expect((await rowAt(sheet, 1))?.used).toBe(0);
  });

  it("refuses a stranger, and lets the DM spend on a player's sheet", async () => {
    await seedSpellSlot(sheet, 2, 3);
    auth.userId = fx.stranger;
    await spendSpellSlot(sheet, 2);
    expect((await rowAt(sheet, 2))?.used).toBe(0);
    auth.userId = fx.dm;
    await spendSpellSlot(sheet, 2);
    expect((await rowAt(sheet, 2))?.used).toBe(1);
  });
});

describe("longRest", () => {
  it("unseals every spell slot alongside the limited-use abilities", async () => {
    const ability = await seedAbility(sheet, 3, 0);
    await seedSpellSlot(sheet, 1, 4, 4);
    await seedSpellSlot(sheet, 2, 3, 1);
    await longRest(sheet);
    expect(await table(sheet)).toMatchObject([
      { level: 1, used: 0 },
      { level: 2, used: 0 },
    ]);
    // Both halves are the same rest — the abilities still refill.
    const refilled = await db.query.characterAbilities.findFirst({
      where: eq(characterAbilities.id, ability),
    });
    expect(refilled?.usesLeft).toBe(3);
  });

  it("leaves someone else's rest alone", async () => {
    await seedSpellSlot(sheet, 1, 4, 4);
    auth.userId = fx.stranger;
    await longRest(sheet);
    expect((await rowAt(sheet, 1))?.used).toBe(4);
  });
});

/**
 * The hour by the fire, which in 5e is a warlock's refill and nobody else's.
 */
describe("shortRest", () => {
  const warlock = () =>
    seedCharacter(fx.campaignId, fx.player, 20, { klass: "Warlock (Fiend)", level: 5 });

  it("gives a warlock every pact slot back", async () => {
    const pact = await warlock();
    await seedSpellSlot(pact, 3, 2, 2);
    await shortRest(pact);
    expect((await rowAt(pact, 3))?.used).toBe(0);
  });

  it("finds the class inside whatever the player wrote", async () => {
    const written = await seedCharacter(fx.campaignId, fx.player, 20, {
      klass: "Level 3 WARLOCK of the Great Old One",
      level: 3,
    });
    await seedSpellSlot(written, 2, 2, 1);
    await shortRest(written);
    expect((await rowAt(written, 2))?.used).toBe(0);
  });

  it("hands nothing back to a class the rule does not speak for", async () => {
    // A wizard's slots are a long rest's business, and a homebrew name is not
    // a warlock however many pacts its player has narrated.
    for (const klass of ["Wizard", "Barbarian", "Rune Cannoneer"]) {
      const other = await seedCharacter(fx.campaignId, fx.player, 20, { klass, level: 5 });
      await seedSpellSlot(other, 1, 4, 3);
      await shortRest(other);
      expect((await rowAt(other, 1))?.used, klass).toBe(3);
    }
    // A sheet that never named a class is one of those too.
    const blank = await seedCharacter(fx.campaignId, fx.player);
    await seedSpellSlot(blank, 1, 2, 2);
    await shortRest(blank);
    expect((await rowAt(blank, 1))?.used).toBe(2);
  });

  it("leaves the hit points and the limited-use abilities where they are", async () => {
    const pact = await warlock();
    const ability = await seedAbility(pact, 3, 0);
    await seedSpellSlot(pact, 3, 2, 2);
    await db.update(characters).set({ currentHp: 4 }).where(eq(characters.id, pact));
    await shortRest(pact);
    // Only the slots. Hit dice are spent by choice and one at a time, and
    // "recharges on a short rest" is a per-feature sentence the sheet has no
    // column for.
    expect(
      (
        await db.query.characterAbilities.findFirst({
          where: eq(characterAbilities.id, ability),
        })
      )?.usesLeft
    ).toBe(0);
    expect(
      (await db.query.characters.findFirst({ where: eq(characters.id, pact) }))?.currentHp
    ).toBe(4);
  });

  it("refuses a stranger, and lets the DM call the rest", async () => {
    const pact = await warlock();
    await seedSpellSlot(pact, 3, 2, 2);
    auth.userId = fx.stranger;
    await shortRest(pact);
    expect((await rowAt(pact, 3))?.used).toBe(2);
    auth.userId = fx.dm;
    await shortRest(pact);
    expect((await rowAt(pact, 3))?.used).toBe(0);
  });
});

describe("rejectCharacter", () => {
  it("takes the slot table down with the sheet", async () => {
    await seedSpellSlot(sheet, 1, 4, 2);
    // A rejected sheet is one the DM never let in; its rows go with it, and
    // the foreign key would refuse the delete if they did not.
    await db
      .update(characters)
      .set({ approval: "pending" })
      .where(eq(characters.id, sheet));
    auth.userId = fx.dm;
    await rejectCharacter(sheet);
    expect(await table(sheet)).toHaveLength(0);
  });
});
