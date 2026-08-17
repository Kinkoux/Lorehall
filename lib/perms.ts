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
 * Access bundle for campaign-scoped pages/actions. `canView` covers campaign
 * members, the campaign's DM, and the world owner.
 */
export async function getCampaignAccess(campaignId: string, userId: string) {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!campaign) return null;
  const world = await db.query.worlds.findFirst({ where: eq(worlds.id, campaign.worldId) });
  if (!world) return null;
  const membership = await db.query.campaignMembers.findFirst({
    where: and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)),
  });
  const isDm = campaign.dmUserId === userId;
  return {
    campaign,
    world,
    membership: membership ?? null,
    isDm,
    canView: Boolean(membership) || isDm || world.ownerId === userId,
  };
}

export async function canEditEntry(entry: CodexEntry, userId: string) {
  if (entry.createdBy === userId) return true;
  return hasDmPowers(entry.worldId, userId);
}
