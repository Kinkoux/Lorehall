// Server-side read helpers; not server actions.

import { asc, desc, eq } from "drizzle-orm";
import { db, combatants, storyBeats, storyChapters, type Combatant } from "@/lib/db";

export async function getBeats(campaignId: string) {
  return db
    .select()
    .from(storyBeats)
    .where(eq(storyBeats.campaignId, campaignId))
    .orderBy(asc(storyBeats.position), asc(storyBeats.createdAt));
}

export async function getChapters(campaignId: string) {
  return db
    .select()
    .from(storyChapters)
    .where(eq(storyChapters.campaignId, campaignId))
    .orderBy(asc(storyChapters.position), asc(storyChapters.createdAt));
}

/** Combatants in table order: highest initiative first, earliest added wins ties. */
export async function getTurnOrder(sessionId: string): Promise<Combatant[]> {
  return db
    .select()
    .from(combatants)
    .where(eq(combatants.sessionId, sessionId))
    .orderBy(desc(combatants.initiative), asc(combatants.createdAt));
}
