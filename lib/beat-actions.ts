"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, storyBeats, storyChapters } from "@/lib/db";
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

export async function getChapters(campaignId: string) {
  return db
    .select()
    .from(storyChapters)
    .where(eq(storyChapters.campaignId, campaignId))
    .orderBy(asc(storyChapters.position), asc(storyChapters.createdAt));
}

/** A chapter id from a form is only honoured if it belongs to this campaign. */
async function resolveChapterId(campaignId: string, raw: string) {
  if (!raw) return null;
  const chapter = await db.query.storyChapters.findFirst({
    where: and(eq(storyChapters.id, raw), eq(storyChapters.campaignId, campaignId)),
  });
  return chapter?.id ?? null;
}

// ---------- chapters ----------

export async function addChapter(campaignId: string, formData: FormData) {
  const user = await requireUser();
  if (!(await requireDm(campaignId, user.id))) return;
  const title = str(formData, "title");
  if (!title) return;

  const existing = await getChapters(campaignId);
  const position = existing.length ? existing[existing.length - 1].position + 1 : 1;
  await db.insert(storyChapters).values({
    id: nanoid(12),
    campaignId,
    title,
    position,
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${campaignId}`);
}

export async function renameChapter(chapterId: string, formData: FormData) {
  const user = await requireUser();
  const chapter = await db.query.storyChapters.findFirst({
    where: eq(storyChapters.id, chapterId),
  });
  if (!chapter) return;
  if (!(await requireDm(chapter.campaignId, user.id))) return;
  const title = str(formData, "title");
  if (!title) return;
  await db.update(storyChapters).set({ title }).where(eq(storyChapters.id, chapterId));
  revalidatePath(`/c/${chapter.campaignId}`);
}

/** Deleting a chapter never destroys prose — its beats fall back to unfiled. */
export async function deleteChapter(chapterId: string) {
  const user = await requireUser();
  const chapter = await db.query.storyChapters.findFirst({
    where: eq(storyChapters.id, chapterId),
  });
  if (!chapter) return;
  if (!(await requireDm(chapter.campaignId, user.id))) return;

  await db
    .update(storyBeats)
    .set({ chapterId: null })
    .where(eq(storyBeats.chapterId, chapterId));
  await db.delete(storyChapters).where(eq(storyChapters.id, chapterId));
  revalidatePath(`/c/${chapter.campaignId}`);
}

// ---------- beats ----------

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
    chapterId: await resolveChapterId(campaignId, str(formData, "chapterId")),
    title,
    narrative: str(formData, "narrative") || null,
    rollNote: str(formData, "rollNote") || null,
    kind: str(formData, "kind") === "plot" ? "plot" : "scene",
    position,
    createdAt: Date.now(),
  });
  revalidatePath(`/c/${campaignId}`);
}

export async function moveBeatToChapter(beatId: string, formData: FormData) {
  const user = await requireUser();
  const beat = await db.query.storyBeats.findFirst({ where: eq(storyBeats.id, beatId) });
  if (!beat) return;
  if (!(await requireDm(beat.campaignId, user.id))) return;

  const chapterId = await resolveChapterId(beat.campaignId, str(formData, "chapterId"));
  await db.update(storyBeats).set({ chapterId }).where(eq(storyBeats.id, beatId));
  revalidatePath(`/c/${beat.campaignId}`);
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
