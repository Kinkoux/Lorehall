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

import { kickMember, readdMember } from "@/lib/actions";
import { campaignEvents, campaignMembers, worldMembers } from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import { formData, seedCharacter, seedUser, seedWorld, type Fixture } from "./support/seed";

let fx: Fixture;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
  auth.userId = fx.dm;
});

const membership = (userId: string) =>
  db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, fx.campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });

const worldRow = (userId: string) =>
  db.query.worldMembers.findFirst({
    where: and(eq(worldMembers.worldId, fx.worldId), eq(worldMembers.userId, userId)),
  });

const feed = () =>
  db.select().from(campaignEvents).where(eq(campaignEvents.campaignId, fx.campaignId));

/**
 * Re-adding is the undo for kickMember, so it inherits both of that action's
 * gates (only the DM, never onto their own roster) plus one of its own: the
 * target has to have left something behind. Without that last one, "re-add"
 * would be "add anyone", and the campaign's only front door is the join code.
 */
describe("readdMember", () => {
  it("is the DM's alone — a player cannot seat anyone", async () => {
    await seedCharacter(fx.campaignId, fx.stranger);
    auth.userId = fx.player;

    await readdMember(fx.campaignId, formData({ userId: fx.stranger }));

    expect(await membership(fx.stranger)).toBeUndefined();
    expect(await feed()).toHaveLength(0);
  });

  it("refuses a target with no character at this table", async () => {
    // A real account, and one the DM could name — but nothing of theirs was
    // ever at this table, so there is nothing to bring back.
    const ghost = await seedUser("ghost");

    await readdMember(fx.campaignId, formData({ userId: ghost }));

    expect(await membership(ghost)).toBeUndefined();
    expect(await feed()).toHaveLength(0);
  });

  it("seats the player again, names the row after their sheet, and re-enrols them in the world", async () => {
    // `stranger` never joined the world either — the way someone looks after
    // a kick that also predates their world membership.
    await seedCharacter(fx.campaignId, fx.stranger);
    expect(await worldRow(fx.stranger)).toBeUndefined();

    await readdMember(fx.campaignId, formData({ userId: fx.stranger }));

    const row = await membership(fx.stranger);
    expect(row).toBeTruthy();
    expect(row?.characterName).toBe("Vex");
    expect((await worldRow(fx.stranger))?.role).toBe("member");
  });

  it("writes one memberReadded line, with the player's name", async () => {
    await seedCharacter(fx.campaignId, fx.stranger);

    await readdMember(fx.campaignId, formData({ userId: fx.stranger }));

    const events = await feed();
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("character");
    expect(JSON.parse(events[0].message)).toEqual({
      k: "memberReadded",
      p: { name: "stranger" },
    });
    expect(events[0].actorId).toBe(fx.dm);
  });

  it("is idempotent — a second press adds no row and no line", async () => {
    await seedCharacter(fx.campaignId, fx.stranger);

    await readdMember(fx.campaignId, formData({ userId: fx.stranger }));
    await readdMember(fx.campaignId, formData({ userId: fx.stranger }));

    const rows = await db
      .select()
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, fx.campaignId),
          eq(campaignMembers.userId, fx.stranger)
        )
      );
    expect(rows).toHaveLength(1);
    expect(await feed()).toHaveLength(1);
  });

  it("closes the loop kickMember opens", async () => {
    await seedCharacter(fx.campaignId, fx.player);

    await kickMember(fx.campaignId, formData({ userId: fx.player }));
    expect(await membership(fx.player)).toBeUndefined();

    await readdMember(fx.campaignId, formData({ userId: fx.player }));
    expect(await membership(fx.player)).toBeTruthy();

    const kinds = (await feed()).map((e) => JSON.parse(e.message).k);
    expect(kinds).toContain("memberKicked");
    expect(kinds).toContain("memberReadded");
  });

  it("will not seat the DM on their own roster", async () => {
    // The DM runs the table without a membership row; a sheet of their own
    // does not turn this action into the way to grant one.
    await seedCharacter(fx.campaignId, fx.dm);

    await readdMember(fx.campaignId, formData({ userId: fx.dm }));

    expect(await membership(fx.dm)).toBeUndefined();
  });
});
