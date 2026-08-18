"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, storyBeats, storyChapters } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getBeats, getChapters } from "@/lib/queries";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Server-side length ceiling — the client's maxlength is a suggestion. */
const cap = (s: string, n: number) => s.slice(0, n);

/** Postgres unique_violation — a double-click losing the race, not a bug. */
const isUniqueViolation = (e: unknown) => {
  // drizzle wraps driver errors; the SQLSTATE may sit on the error or its cause.
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

async function requireDm(campaignId: string, userId: string) {
  const access = await getCampaignAccess(campaignId, userId);
  return access?.isDm ? access : null;
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
    title: cap(title, 150),
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
  await db
    .update(storyChapters)
    .set({ title: cap(title, 150) })
    .where(eq(storyChapters.id, chapterId));
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

  // Unfiling the beats and dropping the chapter are one write: a failure
  // between them would leave beats pointing at a chapter that no longer exists.
  await db.transaction(async (tx) => {
    await tx
      .update(storyBeats)
      .set({ chapterId: null })
      .where(eq(storyBeats.chapterId, chapterId));
    await tx.delete(storyChapters).where(eq(storyChapters.id, chapterId));
  });
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
    title: cap(title, 150),
    narrative: cap(str(formData, "narrative"), 20_000) || null,
    rollNote: cap(str(formData, "rollNote"), 300) || null,
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

  try {
    // Retiring the old current beat and promoting the new one go in together,
    // so the campaign is never briefly showing two — which is also what
    // story_beats_one_current enforces from the database side.
    await db.transaction(async (tx) => {
      if (status === "current") {
        await tx
          .update(storyBeats)
          .set({ status: "done" })
          .where(
            and(
              eq(storyBeats.campaignId, beat.campaignId),
              eq(storyBeats.status, "current"),
              ne(storyBeats.id, beatId)
            )
          );
      }
      await tx.update(storyBeats).set({ status }).where(eq(storyBeats.id, beatId));
    });
  } catch (e) {
    // Another DM moved the bookmark in the same instant; theirs is the one
    // the table is on.
    if (!isUniqueViolation(e)) throw e;
  }
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
