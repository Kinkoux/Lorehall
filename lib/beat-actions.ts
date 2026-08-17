"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, storyBeats } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireDm(campaignId: string, userId: string) {
  const access = await getCampaignAccess(campaignId, userId);
  return access?.isDm ? access : null;
}

export async function getBeats(campaignId: string) {
  return db
    .select()
    .from(storyBeats)
    .where(eq(storyBeats.campaignId, campaignId))
    .orderBy(asc(storyBeats.position), asc(storyBeats.createdAt));
}

export async function addBeat(campaignId: string, formData: FormData) {
  const user = await requireUser();
  if (!(await requireDm(campaignId, user.id))) return;
  const title = str(formData, "title");
  if (!title) return;

  const existing = await getBeats(campaignId);
  const position = existing.length ? existing[existing.length - 1].position + 1 : 1;
  await db.insert(storyBeats).values({
    id: nanoid(12),
    campaignId,
    title,
    narrative: str(formData, "narrative") || null,
    rollNote: str(formData, "rollNote") || null,
    position,
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${campaignId}`);
}

/** Making a beat "current" moves the previous current one to "done". */
export async function setBeatStatus(beatId: string, status: "pending" | "current" | "done") {
  const user = await requireUser();
  const beat = await db.query.storyBeats.findFirst({ where: eq(storyBeats.id, beatId) });
  if (!beat) return;
  if (!(await requireDm(beat.campaignId, user.id))) return;

  if (status === "current") {
    const beats = await getBeats(beat.campaignId);
    for (const other of beats) {
      if (other.id !== beatId && other.status === "current") {
        await db.update(storyBeats).set({ status: "done" }).where(eq(storyBeats.id, other.id));
      }
    }
  }
  await db.update(storyBeats).set({ status }).where(eq(storyBeats.id, beatId));
  revalidatePath(`/c/${beat.campaignId}`);
}

export async function deleteBeat(beatId: string) {
  const user = await requireUser();
  const beat = await db.query.storyBeats.findFirst({ where: eq(storyBeats.id, beatId) });
  if (!beat) return;
  if (!(await requireDm(beat.campaignId, user.id))) return;
  await db.delete(storyBeats).where(eq(storyBeats.id, beatId));
  revalidatePath(`/c/${beat.campaignId}`);
}
