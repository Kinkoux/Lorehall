import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const { db } = await import("./support/db");
  return { ...schema, db };
});

import {
  consumeEmailToken,
  issueEmailToken,
  peekEmailToken,
  retireEmailTokens,
  verifyEmailAddress,
} from "@/lib/email-tokens";
import { emailTokens, users } from "@/lib/db/schema";
import { applySchema, db, sqlState, truncateAll } from "./support/db";
import { seedUser } from "./support/seed";

const HOUR = 60 * 60 * 1000;

let userId: string;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  userId = await seedUser("reader");
});

const rowFor = (raw: string) =>
  db.query.emailTokens.findFirst({
    where: eq(emailTokens.tokenHash, createHash("sha256").update(raw).digest("hex")),
  });

async function capture(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  throw new Error("expected the write to be rejected, but it went through");
}

describe("what the database is given", () => {
  it("stores the hash and never the token itself", async () => {
    const raw = await issueEmailToken(userId, "verify");
    const stored = await db.select().from(emailTokens);
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(raw);
    expect(stored[0].tokenHash).toBe(createHash("sha256").update(raw).digest("hex"));
    // Nothing on the row can be turned back into the link that went out.
    expect(JSON.stringify(stored[0])).not.toContain(raw);
  });

  it("hands out a different token every time", async () => {
    const first = await issueEmailToken(userId, "verify");
    const second = await issueEmailToken(userId, "verify");
    expect(first).not.toBe(second);
  });

  it("dates a confirmation a day out and a reset an hour out", async () => {
    const now = Date.now();
    const verify = await rowFor(await issueEmailToken(userId, "verify"));
    const reset = await rowFor(await issueEmailToken(userId, "reset"));
    expect(verify?.expiresAt).toBeGreaterThan(now + 23 * HOUR);
    expect(reset?.expiresAt).toBeLessThanOrEqual(now + HOUR + 1_000);
    expect(reset?.expiresAt).toBeGreaterThan(now);
  });
});

describe("spending a link", () => {
  it("answers with the account, once", async () => {
    const raw = await issueEmailToken(userId, "reset");
    expect(await peekEmailToken(raw, "reset")).toBe(userId);
    expect(await consumeEmailToken(raw, "reset")).toBe(userId);
    // The second click — a forwarded mail, a double submit — finds nothing.
    expect(await consumeEmailToken(raw, "reset")).toBeNull();
    expect(await peekEmailToken(raw, "reset")).toBeNull();
  });

  it("refuses a token that has run out of time", async () => {
    const raw = await issueEmailToken(userId, "reset");
    await db
      .update(emailTokens)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(emailTokens.userId, userId));
    expect(await peekEmailToken(raw, "reset")).toBeNull();
    expect(await consumeEmailToken(raw, "reset")).toBeNull();
  });

  it("will not let a confirmation link stand in for a reset link", async () => {
    const raw = await issueEmailToken(userId, "verify");
    expect(await consumeEmailToken(raw, "reset")).toBeNull();
    // …and the confirmation is still unspent afterwards.
    expect(await consumeEmailToken(raw, "verify")).toBe(userId);
  });

  it("refuses a token nobody ever issued", async () => {
    expect(await consumeEmailToken("not-a-real-token", "verify")).toBeNull();
    expect(await consumeEmailToken("", "verify")).toBeNull();
  });

  it("retires the outstanding links of one kind and leaves the other alone", async () => {
    const staleVerify = await issueEmailToken(userId, "verify");
    const reset = await issueEmailToken(userId, "reset");
    await retireEmailTokens(userId, "verify");
    expect(await consumeEmailToken(staleVerify, "verify")).toBeNull();
    expect(await consumeEmailToken(reset, "reset")).toBe(userId);
  });
});

describe("confirming an address", () => {
  it("stamps the account and spends the link", async () => {
    const raw = await issueEmailToken(userId, "verify");
    expect(await verifyEmailAddress(raw)).toBe(true);
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user?.emailVerifiedAt).toBeTypeOf("number");
    // Following the same link again reports failure and changes nothing.
    expect(await verifyEmailAddress(raw)).toBe(false);
  });
});

describe("users_email_unique", () => {
  const withEmail = (id: string, email: string | null) =>
    db.insert(users).values({
      id,
      username: id,
      email,
      passwordHash: `hash-${id}`,
      createdAt: Date.now(),
    });

  it("refuses a second account on the same address, case included", async () => {
    await withEmail("ada", "ada@example.com");
    const error = await capture(() => withEmail("ada2", "ADA@example.com"));
    expect(sqlState(error)).toBe("23505");
  });

  it("puts no ceiling on accounts with no address at all", async () => {
    await withEmail("a", null);
    await withEmail("b", null);
    await withEmail("c", null);
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(4); // the three above plus the seeded reader
  });
});
