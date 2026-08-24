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

import { buildCharacter, upsertCharacter } from "@/lib/character-actions";
import { campaignEvents, characterSpellSlots, characters } from "@/lib/db/schema";
import { castingAbilityFor, CLASSES, spellcasting } from "@/lib/srd-classes";
import { SKILL_NAMES } from "@/lib/skill-index";
import { raceBySlug, RACES } from "@/lib/srd-races";
import { applySchema, db, truncateAll } from "./support/db";
import { REDIRECT_MESSAGE } from "./stubs/next-navigation";
import { formData, seedCharacter, seedWorld, type Fixture } from "./support/seed";

/**
 * Making a character in one form instead of on a blank sheet.
 *
 * The builder's whole claim is that it does the looking-up: pick Warlock and
 * the saves, the hit die, the pact slots and the spell save DC all follow
 * without anyone opening a book. Which means the interesting tests are not
 * "did the row get written" but "did it get written with the answers the book
 * would have given" — and, just as loudly, "did the player's own answer win
 * wherever they bothered to give one".
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

/** These actions end by redirecting, and `redirect()` ends them by throwing. */
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

/** The skill picker sends one field many times; the seed helper cannot. */
function builderForm(fields: Record<string, string>, skills: string[] = []) {
  const data = formData(fields);
  for (const skill of skills) data.append("skills", skill);
  return data;
}

const onRoster = () =>
  db
    .select()
    .from(characters)
    .where(and(eq(characters.userId, fx.player), isNull(characters.campaignId)));

const slotsOf = (characterId: string) =>
  db.select().from(characterSpellSlots).where(eq(characterSpellSlots.characterId, characterId));

describe("buildCharacter fills in what the book would", () => {
  it("makes a whole hero on the roster and lands on their sheet", async () => {
    const to = await landedOn(
      buildCharacter(
        builderForm(
          {
            name: "Ashen",
            klass: "warlock",
            subclass: "The Fiend",
            race: "tiefling",
            background: "Charlatan",
            alignment: "Chaotic Neutral",
            level: "3",
            str: "8",
            dex: "14",
            con: "14",
            intel: "12",
            wis: "10",
            cha: "16",
          },
          ["Deception", "Arcana"]
        )
      )
    );

    const [row] = await onRoster();
    expect(to).toBe(`/characters/${row.id}`);
    // No DM on the roster, so nobody to wait for.
    expect(row.approval).toBe("approved");
    // The slug the form posts becomes the name the book prints.
    expect(row.klass).toBe("Warlock");
    expect(row.subclass).toBe("The Fiend");
    expect(row.race).toBe("Tiefling");
    expect(row.speed).toBe(30);
    expect(row.background).toBe("Charlatan");
    expect(row.alignment).toBe("Chaotic Neutral");
    expect(row.level).toBe(3);
    expect(row.cha).toBe(16);
    expect(row.profSkills).toBe("Deception,Arcana");
  });

  it("takes the saving throws off the class, not off the player", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", klass: "rogue" })));
    expect((await onRoster())[0].profSaves).toBe("dex,intel");
  });

  it("says nothing about saves for a class no book speaks for", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", klass: "Blood Hunter" })));
    const [row] = await onRoster();
    // Carried exactly as typed, and left to the player to fill the rest in.
    expect(row.klass).toBe("Blood Hunter");
    expect(row.profSaves).toBeNull();
  });

  it("keeps a written class line whole rather than reading a slug out of it", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", klass: "Fighter (Champion)" })));
    const [row] = await onRoster();
    expect(row.klass).toBe("Fighter (Champion)");
    // Still recognised downstream — the saves came off the class regardless.
    expect(row.profSaves).toBe("str,con");
  });

  it("carries an unknown race as written and offers no speed for it", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", race: "Aarakocra" })));
    const [row] = await onRoster();
    expect(row.race).toBe("Aarakocra");
    expect(row.speed).toBeNull();
  });

  it("sieves the skill list down to skills that exist", async () => {
    await landedOn(
      buildCharacter(
        builderForm({ name: "Ashen", klass: "bard" }, ["Persuasion", "Bribery", "Stealth"])
      )
    );
    expect((await onRoster())[0].profSkills).toBe("Persuasion,Stealth");
  });

  it("clamps a level and the six scores into ranges a character could have", async () => {
    await landedOn(
      buildCharacter(builderForm({ name: "Ashen", level: "99", str: "40", dex: "1" }))
    );
    const [row] = await onRoster();
    expect(row.level).toBe(20);
    expect(row.str).toBe(20);
    expect(row.dex).toBe(3);
  });

  it("leaves a sheet with no scores blank rather than inventing zeroes", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", klass: "wizard" })));
    const [row] = await onRoster();
    expect(row.str).toBeNull();
    expect(row.con).toBeNull();
    expect(row.maxHp).toBeNull();
  });

  it("refuses a nameless hero", async () => {
    await buildCharacter(builderForm({ klass: "wizard" }));
    expect(await onRoster()).toHaveLength(0);
  });
});

/**
 * The number a beginner cannot guess.
 *
 * Level 1 is the whole die; each level after it is the average roll rounded up
 * — the fixed-value option beside rolling — with Constitution applied once per
 * level, the first included.
 */
describe("buildCharacter's hit points", () => {
  const hpOf = async () => (await onRoster())[0].maxHp;

  it("gives a level 1 warlock with CON 14 the whole d8 plus the modifier", async () => {
    await landedOn(
      buildCharacter(builderForm({ name: "Ashen", klass: "warlock", level: "1", con: "14" }))
    );
    expect(await hpOf()).toBe(10); // 8 + 2
  });

  it("adds the average roll and the modifier for every level after the first", async () => {
    await landedOn(
      buildCharacter(builderForm({ name: "Ashen", klass: "warlock", level: "5", con: "14" }))
    );
    expect(await hpOf()).toBe(38); // 8+2 + 4 × (5 + 2)
  });

  it("counts a d12 and a penalty the same way", async () => {
    await landedOn(
      buildCharacter(builderForm({ name: "Ashen", klass: "barbarian", level: "3", con: "8" }))
    );
    expect(await hpOf()).toBe(23); // 12-1 + 2 × (7 - 1)
  });

  it("never argues with a number the player typed", async () => {
    await landedOn(
      buildCharacter(
        builderForm({ name: "Ashen", klass: "warlock", level: "5", con: "14", maxHp: "31" })
      )
    );
    expect(await hpOf()).toBe(31);
  });

  it("stays blank when there is no class to read a die off", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", con: "14", level: "5" })));
    expect(await hpOf()).toBeNull();
  });
});

describe("buildCharacter seeds the spell slot tracker", () => {
  it("deals a level 3 wizard the table's four and two", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", klass: "wizard", level: "3" })));
    const [row] = await onRoster();
    const slots = await slotsOf(row.id);
    expect(slots.map((s) => [s.level, s.total, s.used])).toEqual([
      [1, 4, 0],
      [2, 2, 0],
    ]);
  });

  it("folds a warlock's pact magic into the one row it is", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", klass: "warlock", level: "5" })));
    const [row] = await onRoster();
    expect(await slotsOf(row.id)).toMatchObject([{ level: 3, total: 2 }]);
  });

  it("writes no tracker at all for a class that casts nothing", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", klass: "barbarian", level: "5" })));
    const [row] = await onRoster();
    expect(await slotsOf(row.id)).toHaveLength(0);
  });

  it("gives a level 1 paladin an empty tracker rather than a wrong one", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", klass: "paladin", level: "1" })));
    const [row] = await onRoster();
    expect(await slotsOf(row.id)).toHaveLength(0);
  });
});

describe("buildCharacter aimed at a table", () => {
  const atTable = () =>
    db.select().from(characters).where(eq(characters.campaignId, fx.campaignId));

  it("walks the hero in and lands on the campaign's sheet", async () => {
    const to = await landedOn(
      buildCharacter(
        builderForm({ name: "Ashen", campaignId: fx.campaignId, klass: "cleric", level: "2" })
      )
    );

    const [row] = await atTable();
    expect(to).toBe(`/c/${fx.campaignId}/ch/${fx.player}?ch=${row.id}`);
    expect(row.approval).toBe("approved");
    expect(row.profSaves).toBe("wis,cha");
    expect(await slotsOf(row.id)).toMatchObject([{ level: 1, total: 3 }]);
  });

  it("obeys the admission rule the other doors obey", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", campaignId: fx.campaignId })));
    await landedOn(buildCharacter(builderForm({ name: "Bryn", campaignId: fx.campaignId })));

    const rows = await atTable();
    expect(rows.find((row) => row.name === "Ashen")?.approval).toBe("approved");
    expect(rows.find((row) => row.name === "Bryn")?.approval).toBe("pending");
  });

  it("writes one characterCreated line into the feed", async () => {
    await landedOn(buildCharacter(builderForm({ name: "Ashen", campaignId: fx.campaignId })));
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

  it("will not seat a hero at a table the player does not sit at", async () => {
    auth.userId = fx.stranger;

    await buildCharacter(
      builderForm({ name: "Ashen", campaignId: fx.campaignId, klass: "wizard" })
    );

    expect(await atTable()).toHaveLength(0);
    // And nothing landed on the stranger's roster either — the refusal is
    // total, not a redirect somewhere friendlier.
    const mine = await db
      .select()
      .from(characters)
      .where(eq(characters.userId, fx.stranger));
    expect(mine).toHaveLength(0);
  });
});

/**
 * The rest of the printed sheet, saved from a form that may not carry all of
 * it. A field that is present and blank is a deletion; a field that is not
 * there at all is silence, and silence must not delete anything.
 */
describe("upsertCharacter and the sheet's new boxes", () => {
  let sheet: string;

  beforeEach(async () => {
    sheet = await seedCharacter(null, fx.player);
  });

  const rowOf = () => db.query.characters.findFirst({ where: eq(characters.id, sheet) });

  it("writes the archetype, the origins and the four personality lines", async () => {
    await upsertCharacter(
      null,
      fx.player,
      formData({
        characterId: sheet,
        name: "Vex",
        subclass: "College of Lore",
        background: "Sage",
        alignment: "Neutral Good",
        speed: "25",
        traits: "Hums while thinking.",
        ideals: "Knowledge is owed to everyone.",
        bonds: "The library that raised me.",
        flaws: "Cannot leave a riddle alone.",
      })
    );

    const row = await rowOf();
    expect(row?.subclass).toBe("College of Lore");
    expect(row?.background).toBe("Sage");
    expect(row?.alignment).toBe("Neutral Good");
    expect(row?.speed).toBe(25);
    expect(row?.traits).toBe("Hums while thinking.");
    expect(row?.ideals).toBe("Knowledge is owed to everyone.");
    expect(row?.bonds).toBe("The library that raised me.");
    expect(row?.flaws).toBe("Cannot leave a riddle alone.");
  });

  it("leaves a field alone when the form never carried it", async () => {
    await upsertCharacter(
      null,
      fx.player,
      formData({ characterId: sheet, name: "Vex", subclass: "Thief", traits: "Counts doors." })
    );

    // An older screen with none of the new boxes on it saves the name and
    // says nothing about the rest.
    await upsertCharacter(null, fx.player, formData({ characterId: sheet, name: "Vex the Quick" }));

    const row = await rowOf();
    expect(row?.name).toBe("Vex the Quick");
    expect(row?.subclass).toBe("Thief");
    expect(row?.traits).toBe("Counts doors.");
  });

  it("clears a field the form carried empty — that is a player saying no", async () => {
    await upsertCharacter(
      null,
      fx.player,
      formData({ characterId: sheet, name: "Vex", subclass: "Thief" })
    );
    await upsertCharacter(
      null,
      fx.player,
      formData({ characterId: sheet, name: "Vex", subclass: "" })
    );

    expect((await rowOf())?.subclass).toBeNull();
  });

  it("keeps a speed inside the range legs come in", async () => {
    await upsertCharacter(
      null,
      fx.player,
      formData({ characterId: sheet, name: "Vex", speed: "9999" })
    );
    expect((await rowOf())?.speed).toBe(120);
  });
});

/**
 * The two numbers at the top of a caster's sheet — pure arithmetic, so no
 * database is involved and none of it is ever written down.
 */
describe("spellcasting", () => {
  const scores = { str: 8, dex: 14, con: 12, intel: 18, wis: 10, cha: 11 };

  it("reads a level 5 wizard's save DC and attack bonus off INT", () => {
    // Proficiency 3 + INT modifier 4.
    expect(spellcasting("Wizard", 5, scores)).toEqual({ ability: "intel", dc: 15, attack: 7 });
  });

  it("has nothing to say about a barbarian", () => {
    expect(spellcasting("Barbarian", 5, scores)).toBeNull();
    expect(castingAbilityFor("Barbarian")).toBeNull();
  });

  it("has nothing to say about a class it does not know", () => {
    expect(spellcasting("Blood Hunter", 5, scores)).toBeNull();
  });

  it("has nothing to say while the casting score is still blank", () => {
    // What the character builder holds for most of the time a player spends in
    // it: a class chosen, and three of the six numbers written down. A DC of
    // 8 + proficiency + mod(undefined) would be NaN drawn as a fact.
    const halfWritten = { str: 8, dex: 14, con: 12, intel: null, wis: 10, cha: null };
    expect(spellcasting("Wizard", 5, halfWritten)).toBeNull();
    expect(spellcasting("Warlock", 5, halfWritten)).toBeNull();
    // The ability it does not cast with may be as blank as it likes.
    expect(spellcasting("Wizard", 5, { ...halfWritten, intel: 18 })).toEqual({
      ability: "intel",
      dc: 15,
      attack: 7,
    });
  });

  it("reads the class out of a written line, in either language", () => {
    expect(castingAbilityFor("Level 3 Cleric")).toBe("wis");
    expect(castingAbilityFor("kara büyücü")).toBe("cha");
  });

  it("stays silent for the martial subclasses that cast at level 3", () => {
    // Eldritch Knight and Arcane Trickster are subclasses, not classes: a save
    // DC on every champion's sheet would be worse than none.
    expect(CLASSES.fighter.castingAbility).toBeNull();
    expect(CLASSES.rogue.castingAbility).toBeNull();
  });
});

describe("the SRD tables themselves", () => {
  it("counts the nine peoples and what each was born with", () => {
    const known = new Set(RACES.map((race) => race.slug));
    expect(known.size).toBe(9);
    expect(raceBySlug("Half-Elf")?.name).toBe("Half-Elf");
    // Two free +1s the player places; this table only counts them.
    expect(raceBySlug("half-elf")?.floatingAsi).toBe(2);
    expect(raceBySlug("dwarf")?.asi).toEqual({ con: 2 });
    expect(raceBySlug("nowhere")).toBeNull();
  });

  it("answers to a written race name as well as to a slug", () => {
    // The sheet's `race` column is free text, and the two spellings coincide
    // for all nine — which is exactly why the display name is entered as a key
    // in its own right rather than left to the coincidence.
    for (const race of RACES) {
      expect(raceBySlug(race.slug)).toBe(race);
      expect(raceBySlug(race.name)).toBe(race);
      expect(raceBySlug(`  ${race.name.toUpperCase()}  `)).toBe(race);
    }
    expect(raceBySlug("")).toBeNull();
    expect(raceBySlug(null)).toBeNull();
  });

  it("keeps every class's skill list inside the compendium's own", () => {
    // The twelve `from` lists are written by hand because the book rules them
    // by hand; this is the alarm that goes off when one of them drifts. A name
    // that is not spelled exactly as lib/skill-index.ts spells it becomes a
    // proficiency stored in the CSV and rendered on no sheet.
    const known = new Set(SKILL_NAMES);
    for (const [slug, info] of Object.entries(CLASSES)) {
      for (const skill of info.skillChoices.from) {
        expect(known, `${slug} offers an unknown skill: ${skill}`).toContain(skill);
      }
    }
    expect(known.size).toBe(18);
  });

  it("gives every class a die, two saves and a subclass", () => {
    for (const info of Object.values(CLASSES)) {
      expect([6, 8, 10, 12]).toContain(info.hitDie);
      expect(info.saves).toHaveLength(2);
      expect(info.srdSubclass.length).toBeGreaterThan(0);
      expect(info.skillChoices.from.length).toBeGreaterThanOrEqual(info.skillChoices.n);
    }
  });
});
