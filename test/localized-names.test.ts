import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  getItem,
  getMonster,
  localizedItemName,
  localizedMonsterName,
  searchItems,
  searchMonsters,
  type SrdItem,
} from "@/lib/srd-data";
import { searchItemsForCharacter } from "@/lib/search-actions";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { __clearCookies, __setCookie } from "./stubs/next-headers";
import { applySchema, truncateAll } from "./support/db";
import { seedCharacter, seedWorld, seedWorldItem, type Fixture } from "./support/seed";

/**
 * The compendium speaks English, and goes on doing so: the descriptions, the
 * stat blocks and every name ever *written down* — an inventory row, a
 * combatant, a log line — are the SRD's own. What a Turkish table gets is the
 * label it hunts by. So two things have to hold at once here: a Turkish reader
 * sees "Hançer", and the row they add still says "Dagger".
 */

const indexes = (rows: { index: string }[]) => rows.map((r) => r.index);

describe("localizedItemName", () => {
  it("answers in Turkish only for the Turkish locale", () => {
    const dagger = getItem("dagger")!;
    expect(localizedItemName(dagger, "tr")).toBe("Hançer");
    expect(localizedItemName(dagger, "en")).toBe("Dagger");
    // The index alone is enough — half the callers hold nothing else.
    expect(localizedItemName("dagger", "tr")).toBe("Hançer");
    expect(localizedItemName("dagger", "en")).toBe("Dagger");
  });

  it("falls back to the SRD's own name, and to the index it cannot place", () => {
    const dagger = getItem("dagger")!;
    // Every entry is translated today; an untranslated one must still read.
    const untranslated: SrdItem = { ...dagger, index: "no-such-index" };
    expect(localizedItemName(untranslated, "tr")).toBe("Dagger");
    expect(localizedItemName("no-such-index", "tr")).toBe("no-such-index");
  });
});

describe("localizedMonsterName", () => {
  it("names the ghoul in either language and falls back when it cannot", () => {
    const ghoul = getMonster("ghoul")!;
    expect(localizedMonsterName(ghoul, "tr")).toBe("Gulyabani");
    expect(localizedMonsterName(ghoul, "en")).toBe("Ghoul");
    expect(localizedMonsterName("ghoul", "tr")).toBe("Gulyabani");
    expect(localizedMonsterName({ ...ghoul, index: "nope" }, "tr")).toBe("Ghoul");
  });
});

describe("searching by either name", () => {
  it("finds the dagger under hançer, without losing it under dagger", () => {
    expect(indexes(searchItems("hançer", ""))).toContain("dagger");
    expect(indexes(searchItems("dagger", ""))).toContain("dagger");
    // The facets still stack: a Turkish needle narrows like an English one.
    expect(searchItems("hançer", "weapon").every((i) => i.category === "weapon")).toBe(true);
    expect(searchItems("hançer", "armor")).toEqual([]);
  });

  it("finds the ghoul under gulyabani, and answers nothing for neither", () => {
    expect(indexes(searchMonsters("gulyabani", ""))).toEqual(["ghoul"]);
    expect(indexes(searchMonsters("ghoul", ""))).toContain("ghoul");
    expect(searchMonsters("gulyabani", "5")).toEqual([]);
  });

  it("matches a dotted Turkish capital as the keyboard actually types it", () => {
    // "İksir".toLowerCase() keeps the dot as a combining mark; without the
    // fold, the "iksir" anyone types would match none of the 63 names holding
    // one. The English side is untouched by that folding.
    const potions = searchItems("iksir", "");
    expect(potions.length).toBeGreaterThan(0);
    expect(indexes(searchItems("potion", ""))).toContain("potion-of-healing");
  });
});

/**
 * The lookahead is the one surface where the two names have to travel
 * together: what the player reads is theirs, what the form carries is the
 * compendium's.
 */
describe("searchItemsForCharacter", () => {
  let fx: Fixture;
  let sheet: string;

  beforeAll(async () => {
    await applySchema();
  });

  beforeEach(async () => {
    await truncateAll();
    __clearCookies();
    fx = await seedWorld();
    sheet = await seedCharacter(fx.campaignId, fx.player);
    auth.userId = fx.player;
  });

  it("matches the Turkish name but still writes the English one into the form", async () => {
    __setCookie(LOCALE_COOKIE, "tr");
    const found = await searchItemsForCharacter(sheet, "hançer");
    const dagger = found.find((s) => s.ref === "dagger");
    expect(dagger).toBeDefined();
    expect(dagger!.name).toBe("Dagger");
    expect(dagger!.display).toBe("Hançer");
  });

  it("carries no second name for an English reader, or for a library entry", async () => {
    const forged = await seedWorldItem(fx.worldId, fx.dm, { name: "Emberfang Dagger" });
    // No locale cookie: English, where the display would only repeat the name.
    const found = await searchItemsForCharacter(sheet, "hançer");
    expect(found.find((s) => s.ref === "dagger")?.display).toBeUndefined();

    const library = await searchItemsForCharacter(sheet, "emberfang");
    expect(library.map((s) => s.ref)).toEqual([forged]);
    expect(library[0].display).toBeUndefined();
  });
});
