import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const { db } = await import("./support/db");
  return { ...schema, db };
});

import { checkRateLimit } from "@/lib/rate-limit";
import { authAttempts } from "@/lib/db/schema";
import { applySchema, client, db, truncateAll } from "./support/db";

const WINDOW = 60_000;
const DAY = 24 * 60 * 60 * 1000;

/** The sweep fires on ~2% of attempts; the tests decide which side of that they are on. */
function rollDice(value: number) {
  vi.spyOn(Math, "random").mockReturnValue(value);
}

const NEVER_SWEEP = 0.99;
const ALWAYS_SWEEP = 0;

function freezeClock(at: number) {
  vi.spyOn(Date, "now").mockReturnValue(at);
}

async function readRow(key: string) {
  return db.query.authAttempts.findFirst({ where: eq(authAttempts.key, key) });
}

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  rollDice(NEVER_SWEEP);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkRateLimit", () => {
  it("allows every attempt up to the ceiling", async () => {
    const results = [
      await checkRateLimit("login:ip", 3, WINDOW),
      await checkRateLimit("login:ip", 3, WINDOW),
      await checkRateLimit("login:ip", 3, WINDOW),
    ];
    expect(results).toEqual([true, true, true]);
    expect((await readRow("login:ip"))?.count).toBe(3);
  });

  it("refuses the attempt that goes past the ceiling, and stays refused", async () => {
    for (let i = 0; i < 3; i += 1) await checkRateLimit("login:ip", 3, WINDOW);
    expect(await checkRateLimit("login:ip", 3, WINDOW)).toBe(false);
    expect(await checkRateLimit("login:ip", 3, WINDOW)).toBe(false);
    expect((await readRow("login:ip"))?.count).toBe(5);
  });

  it("restarts the window in place once resetAt has passed", async () => {
    const start = Date.now();
    freezeClock(start);
    for (let i = 0; i < 3; i += 1) await checkRateLimit("login:ip", 3, WINDOW);
    expect(await checkRateLimit("login:ip", 3, WINDOW)).toBe(false);

    // One millisecond past the deadline the row restarts at 1 rather than
    // being deleted — same row, fresh count.
    freezeClock(start + WINDOW + 1);
    expect(await checkRateLimit("login:ip", 3, WINDOW)).toBe(true);
    const row = await readRow("login:ip");
    expect(row?.count).toBe(1);
    expect(row?.resetAt).toBe(start + WINDOW + 1 + WINDOW);
  });

  it("counts keys independently", async () => {
    for (let i = 0; i < 3; i += 1) await checkRateLimit("login:1.2.3.4", 3, WINDOW);
    expect(await checkRateLimit("login:1.2.3.4", 3, WINDOW)).toBe(false);
    // A different bucket has not spent anything.
    expect(await checkRateLimit("login:5.6.7.8", 3, WINDOW)).toBe(true);
    expect((await readRow("login:5.6.7.8"))?.count).toBe(1);
    expect((await readRow("login:1.2.3.4"))?.count).toBe(4);
  });

  it("honours a per-call ceiling", async () => {
    expect(await checkRateLimit("join", 1, WINDOW)).toBe(true);
    expect(await checkRateLimit("join", 1, WINDOW)).toBe(false);
  });

  it("sweeps day-old rows when the dice say so, and leaves live ones alone", async () => {
    const now = Date.now();
    freezeClock(now);
    await db.insert(authAttempts).values([
      { key: "ancient", count: 9, resetAt: now - DAY - 60_000 },
      { key: "yesterdayish", count: 4, resetAt: now - DAY + 60_000 },
    ]);

    rollDice(ALWAYS_SWEEP);
    expect(await checkRateLimit("live", 5, WINDOW)).toBe(true);

    expect(await readRow("ancient")).toBeUndefined();
    expect((await readRow("yesterdayish"))?.count).toBe(4);
    expect((await readRow("live"))?.count).toBe(1);
  });

  it("leaves the table untouched when the dice say no", async () => {
    const now = Date.now();
    freezeClock(now);
    await db.insert(authAttempts).values({ key: "ancient", count: 9, resetAt: now - DAY * 3 });

    rollDice(NEVER_SWEEP);
    await checkRateLimit("live", 5, WINDOW);

    expect((await readRow("ancient"))?.count).toBe(9);
  });

  it("fails open when the statement itself fails — a brake must not lock the door", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await client.exec("ALTER TABLE auth_attempts RENAME TO auth_attempts_hidden");
    try {
      expect(await checkRateLimit("login:ip", 1, WINDOW)).toBe(true);
      expect(await checkRateLimit("login:ip", 1, WINDOW)).toBe(true);
      expect(logged).toHaveBeenCalled();
    } finally {
      await client.exec("ALTER TABLE auth_attempts_hidden RENAME TO auth_attempts");
    }
  });
});
