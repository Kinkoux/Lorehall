import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const { db } = await import("./support/db");
  return { ...schema, db };
});

import { canEditEntry, getCampaignAccess, getWorldMembership, hasDmPowers } from "@/lib/perms";
import { codexEntries, worlds } from "@/lib/db/schema";
import { applySchema, db, truncateAll } from "./support/db";
import { seedCampaign, seedCodexEntry, seedUser, seedWorld, type Fixture } from "./support/seed";

let fx: Fixture;

beforeAll(async () => {
  await applySchema();
});

beforeEach(async () => {
  await truncateAll();
  fx = await seedWorld();
});

async function loadEntry(entryId: string) {
  const entry = await db.query.codexEntries.findFirst({ where: eq(codexEntries.id, entryId) });
  if (!entry) throw new Error(`seeded codex entry ${entryId} went missing`);
  return entry;
}

describe("getCampaignAccess", () => {
  it("gives a campaign member view and participation, but not the DM's chair", async () => {
    const access = await getCampaignAccess(fx.campaignId, fx.player);
    expect(access).not.toBeNull();
    expect(access?.canView).toBe(true);
    expect(access?.canParticipate).toBe(true);
    expect(access?.isDm).toBe(false);
    expect(access?.membership).not.toBeNull();
  });

  it("gives the DM everything without a campaign_members row", async () => {
    const access = await getCampaignAccess(fx.campaignId, fx.dm);
    expect(access?.isDm).toBe(true);
    expect(access?.canView).toBe(true);
    expect(access?.canParticipate).toBe(true);
    // The DM runs the table without being a member of it.
    expect(access?.membership).toBeNull();
  });

  it("gives the world owner a read-only window into a table they never joined", async () => {
    const access = await getCampaignAccess(fx.campaignId, fx.owner);
    expect(access?.canView).toBe(true);
    expect(access?.canParticipate).toBe(false);
    expect(access?.isDm).toBe(false);
  });

  it("gives a stranger nothing", async () => {
    const access = await getCampaignAccess(fx.campaignId, fx.stranger);
    expect(access?.canView).toBe(false);
    expect(access?.canParticipate).toBe(false);
    expect(access?.isDm).toBe(false);
    expect(access?.membership).toBeNull();
  });

  it("returns null for a campaign id that does not exist", async () => {
    expect(await getCampaignAccess("no-such-campaign", fx.dm)).toBeNull();
  });

  it("does not leak membership across campaigns in the same world", async () => {
    const other = await seedCampaign(fx.worldId, fx.dm);
    const access = await getCampaignAccess(other, fx.player);
    // Same world, same player — but no seat at *this* table.
    expect(access?.canView).toBe(false);
    expect(access?.canParticipate).toBe(false);
  });
});

describe("hasDmPowers", () => {
  it("is true for the world owner", async () => {
    expect(await hasDmPowers(fx.worldId, fx.owner)).toBe(true);
  });

  it("is true for someone running a campaign in the world", async () => {
    expect(await hasDmPowers(fx.worldId, fx.dm)).toBe(true);
  });

  it("is false for a plain player and for a stranger", async () => {
    expect(await hasDmPowers(fx.worldId, fx.player)).toBe(false);
    expect(await hasDmPowers(fx.worldId, fx.stranger)).toBe(false);
  });

  it("is false for a world that does not exist", async () => {
    expect(await hasDmPowers("no-such-world", fx.owner)).toBe(false);
  });

  it("does not carry a DM's powers into a world they do not run", async () => {
    const outsider = await seedUser("outsider");
    await db.insert(worlds).values({
      id: "world-elsewhere",
      name: "Elsewhere",
      ownerId: outsider,
      createdAt: Date.now(),
    });
    expect(await hasDmPowers("world-elsewhere", fx.dm)).toBe(false);
  });
});

describe("getWorldMembership", () => {
  it("finds the row for a member and nothing for an outsider", async () => {
    const membership = await getWorldMembership(fx.worldId, fx.player);
    expect(membership?.role).toBe("member");
    expect(await getWorldMembership(fx.worldId, fx.stranger)).toBeUndefined();
  });
});

describe("canEditEntry", () => {
  it("lets the author edit their own entry without DM powers", async () => {
    const entry = await loadEntry(await seedCodexEntry(fx.worldId, fx.player));
    expect(await canEditEntry(entry, fx.player)).toBe(true);
  });

  it("lets the DM and the world owner edit someone else's entry, and refuses everyone else", async () => {
    const entry = await loadEntry(await seedCodexEntry(fx.worldId, fx.player));
    expect(await canEditEntry(entry, fx.dm)).toBe(true);
    expect(await canEditEntry(entry, fx.owner)).toBe(true);
    expect(await canEditEntry(entry, fx.stranger)).toBe(false);
  });
});
