import "server-only";
import { and, eq } from "drizzle-orm";
import {
  db,
  worlds,
  worldMembers,
  campaigns,
  campaignMembers,
  type CodexEntry,
} from "@/lib/db";

export async function getWorldMembership(worldId: string, userId: string) {
  return db.query.worldMembers.findFirst({
    where: and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)),
  });
}

/**
 * "DM powers" in a world = you own the world or you run at least one of its
 * campaigns. Grants access to dm-only codex entries and editing anything.
 */
export async function hasDmPowers(worldId: string, userId: string) {
  const world = await db.query.worlds.findFirst({ where: eq(worlds.id, worldId) });
  if (!world) return false;
  if (world.ownerId === userId) return true;
  const dmOf = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.worldId, worldId), eq(campaigns.dmUserId, userId)),
  });
  return Boolean(dmOf);
}

/**
 * Access bundle for campaign-scoped pages/actions. Two distinct gates:
 *
 * - `canView` — campaign members, the campaign's DM, and the world owner. The
 *   owner keeps a read-only window into every table running in their world.
 * - `canParticipate` — only people actually at this table: a real
 *   campaignMembers row, or the DM who runs it. Player-side writes (treasury,
 *   loot, sheets, initiative) gate on this, so a world owner who never joined
 *   cannot spend a party's gold in a campaign they only watch.
 *
 * One joined query — this helper runs on every campaign/session page and at
 * the top of most actions.
 */
export async function getCampaignAccess(campaignId: string, userId: string) {
  const rows = await db
    .select({ campaign: campaigns, world: worlds, membership: campaignMembers })
    .from(campaigns)
    .innerJoin(worlds, eq(campaigns.worldId, worlds.id))
    .leftJoin(
      campaignMembers,
      and(eq(campaignMembers.campaignId, campaigns.id), eq(campaignMembers.userId, userId))
    )
    .where(eq(campaigns.id, campaignId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const isDm = row.campaign.dmUserId === userId;
  return {
    campaign: row.campaign,
    world: row.world,
    membership: row.membership ?? null,
    isDm,
    canView: Boolean(row.membership) || isDm || row.world.ownerId === userId,
    canParticipate: Boolean(row.membership) || isDm,
  };
}

export async function canEditEntry(entry: CodexEntry, userId: string) {
  if (entry.createdBy === userId) return true;
  return hasDmPowers(entry.worldId, userId);
}
