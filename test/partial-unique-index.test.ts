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

import { setActiveMap } from "@/lib/map-actions";
import { setBeatStatus } from "@/lib/beat-actions";
import { campaignMaps, characters, combatants, gameSessions, storyBeats } from "@/lib/db/schema";
import { applySchema, db, sqlState, truncateAll } from "./support/db";
import {
  seedBeat,
  seedCampaign,
  seedCharacter,
  seedCombatant,
  seedMap,
  seedSession,
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
  auth.userId = fx.dm;
});

const activeMaps = (campaignId: string) =>
  db
    .select()
    .from(campaignMaps)
    .where(and(eq(campaignMaps.campaignId, campaignId), eq(campaignMaps.isActive, 1)));

const currentBeats = (campaignId: string) =>
  db
    .select()
    .from(storyBeats)
    .where(and(eq(storyBeats.campaignId, campaignId), eq(storyBeats.status, "current")));

async function capture(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  throw new Error("expected the write to be rejected, but it went through");
}

describe("campaign_maps_one_active", () => {
  it("rejects a second map on the table with SQLSTATE 23505", async () => {
    await seedMap(fx.campaignId, 1, "First");
    const error = await capture(() => seedMap(fx.campaignId, 1, "Second"));
    expect(sqlState(error)).toBe("23505");
  });

  it("rejects promoting a second map by UPDATE too, not just INSERT", async () => {
    await seedMap(fx.campaignId, 1, "First");
    const bench = await seedMap(fx.campaignId, 0, "Bench");
    const error = await capture(() =>
      db.update(campaignMaps).set({ isActive: 1 }).where(eq(campaignMaps.id, bench))
    );
    expect(sqlState(error)).toBe("23505");
  });

  it("puts no ceiling on maps that are off the table", async () => {
    await seedMap(fx.campaignId, 0, "A");
    await seedMap(fx.campaignId, 0, "B");
    await seedMap(fx.campaignId, 0, "C");
    expect(await activeMaps(fx.campaignId)).toHaveLength(0);
  });

  it("is scoped per campaign — another table may have its own map out", async () => {
    const other = await seedCampaign(fx.worldId, fx.dm);
    await seedMap(fx.campaignId, 1, "Ours");
    await seedMap(other, 1, "Theirs");
    expect(await activeMaps(fx.campaignId)).toHaveLength(1);
    expect(await activeMaps(other)).toHaveLength(1);
  });

  it("lets setActiveMap swap the map on the table in one write", async () => {
    await seedMap(fx.campaignId, 1, "Old");
    const fresh = await seedMap(fx.campaignId, 0, "New");
    await setActiveMap(fresh, true);
    const active = await activeMaps(fx.campaignId);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(fresh);
  });

  it("lets setActiveMap clear the table", async () => {
    const only = await seedMap(fx.campaignId, 1, "Old");
    await setActiveMap(only, false);
    expect(await activeMaps(fx.campaignId)).toHaveLength(0);
  });
});

describe("story_beats_one_current", () => {
  it("rejects a second current beat with SQLSTATE 23505", async () => {
    await seedBeat(fx.campaignId, "current", 1);
    const error = await capture(() => seedBeat(fx.campaignId, "current", 2));
    expect(sqlState(error)).toBe("23505");
  });

  it("puts no ceiling on pending or done beats", async () => {
    await seedBeat(fx.campaignId, "pending", 1);
    await seedBeat(fx.campaignId, "pending", 2);
    await seedBeat(fx.campaignId, "done", 3);
    await seedBeat(fx.campaignId, "done", 4);
    expect(await currentBeats(fx.campaignId)).toHaveLength(0);
  });

  it("lets setBeatStatus move the bookmark, retiring the previous beat", async () => {
    const first = await seedBeat(fx.campaignId, "current", 1);
    const second = await seedBeat(fx.campaignId, "pending", 2);
    await setBeatStatus(second, "current");

    const current = await currentBeats(fx.campaignId);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe(second);
    const retired = await db.query.storyBeats.findFirst({ where: eq(storyBeats.id, first) });
    expect(retired?.status).toBe("done");
  });

  it("is scoped per campaign", async () => {
    const other = await seedCampaign(fx.worldId, fx.dm);
    await seedBeat(fx.campaignId, "current", 1);
    await seedBeat(other, "current", 1);
    expect(await currentBeats(fx.campaignId)).toHaveLength(1);
    expect(await currentBeats(other)).toHaveLength(1);
  });
});

describe("the other guarded indexes from the bootstrap", () => {
  it("uniq_live_session: a campaign holds at most one live session", async () => {
    await seedSession(fx.campaignId);
    const error = await capture(() => seedSession(fx.campaignId));
    expect(sqlState(error)).toBe("23505");
    // An ended session does not occupy the slot.
    await db.update(gameSessions).set({ status: "ended" }).where(eq(gameSessions.status, "live"));
    await expect(seedSession(fx.campaignId)).resolves.toBeTypeOf("string");
  });

  it("uniq_combatant_player: one seat per player, unlimited monsters", async () => {
    const sessionId = await seedSession(fx.campaignId);
    await db.insert(combatants).values({
      id: "c-player",
      sessionId,
      name: "Vex",
      initiative: 15,
      userId: fx.player,
      createdAt: Date.now(),
    });
    const error = await capture(() =>
      db.insert(combatants).values({
        id: "c-player-again",
        sessionId,
        name: "Vex again",
        initiative: 9,
        userId: fx.player,
        createdAt: Date.now(),
      })
    );
    expect(sqlState(error)).toBe("23505");
    // user_id IS NULL rows are outside the index — the DM can add a horde.
    await seedCombatant(sessionId, { hp: 7, maxHp: 7 });
    await seedCombatant(sessionId, { hp: 7, maxHp: 7 });
    const rows = await db.select().from(combatants).where(eq(combatants.sessionId, sessionId));
    expect(rows).toHaveLength(3);
  });

  it("characters_one_copy_per_campaign: one stamp of a master per table", async () => {
    const master = await seedCharacter(null, fx.player);
    const stamp = (id: string, campaignId: string) =>
      db.insert(characters).values({
        id,
        campaignId,
        userId: fx.player,
        name: "Ashen",
        originCharacterId: master,
        updatedAt: Date.now(),
      });

    await stamp("copy-here", fx.campaignId);
    const error = await capture(() => stamp("copy-here-again", fx.campaignId));
    expect(sqlState(error)).toBe("23505");

    // The same hero at a second table is a second pair, and allowed: that is
    // what copying a roster character is for.
    const other = await seedCampaign(fx.worldId, fx.dm);
    await expect(stamp("copy-elsewhere", other)).resolves.toBeDefined();

    // origin_character_id IS NULL rows are outside the index entirely — a
    // player may keep any number of sheets they wrote at the table itself.
    await seedCharacter(fx.campaignId, fx.player);
    await seedCharacter(fx.campaignId, fx.player);
  });
});

describe("how a unique violation actually reaches the caller", () => {
  it("arrives wrapped: the SQLSTATE hangs off `cause`, not off the error itself", async () => {
    await seedBeat(fx.campaignId, "current", 1);
    const error = await capture(() => seedBeat(fx.campaignId, "current", 2));
    // drizzle-orm >= 0.44 wraps every driver error in DrizzleQueryError, so the
    // `e.code === "23505"` guards in lib/*-actions.ts never see the code they
    // are looking for. Pinning the shape here so the day that changes is loud.
    expect((error as { code?: string }).code).toBeUndefined();
    expect((error as { cause?: { code?: string } }).cause?.code).toBe("23505");
    expect(sqlState(error)).toBe("23505");
  });
});
