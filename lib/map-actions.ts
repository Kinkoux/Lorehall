"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, campaignMaps, gameSessions } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getT } from "@/lib/locale";
import { createMapUploadUrl, deleteMapFile, statMapFile } from "@/lib/storage";
import type { FormState } from "@/lib/actions";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
/**
 * The only key shape finalizeMapUpload accepts: exactly what requestMapUpload
 * mints. No slash can pass it, so a claimed key cannot reach out of the maps
 * area of the bucket (portraits/ shares it), and no path trick survives.
 */
const FILE_NAME_RE = /^[A-Za-z0-9_-]{16}\.(png|jpe?g|webp)$/;

/** Where the browser should put the file, and what to call it afterwards. */
type UploadTicket = { uploadUrl: string; fileName: string };

/** Postgres unique_violation — a double-click losing the race, not a bug. */
const isUniqueViolation = (e: unknown) => {
  // drizzle wraps driver errors; the SQLSTATE may sit on the error or its cause.
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
};

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Clamped integer from a form field; blank or unparsable falls back. */
function int(formData: FormData, key: string, min: number, max: number, fallback: number) {
  const raw = str(formData, key);
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** The live table screen shows the active map, so map changes touch it too. */
async function revalidateMapPages(campaignId: string, mapId?: string) {
  revalidatePath(`/c/${campaignId}`);
  if (mapId) revalidatePath(`/c/${campaignId}/m/${mapId}`);
  const liveSessions = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.campaignId, campaignId), eq(gameSessions.status, "live")));
  for (const s of liveSessions) revalidatePath(`/s/${s.id}`);
}

/**
 * Step one of an upload: the browser describes the file it wants to send and
 * gets back somewhere to put it. Only the description crosses the wire here —
 * the bytes go straight to Storage over the returned URL, because a request
 * body through the app server runs out of room well below the 10 MB map cap.
 */
export async function requestMapUpload(
  campaignId: string,
  formData: FormData
): Promise<FormState & { ticket?: UploadTicket }> {
  const user = await requireUser();
  const { t } = await getT();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return { error: t("errors.maps.dmOnly") };

  // Both are claims, not measurements — Storage is asked what really arrived
  // when the row is written. They still gate the URL: no point handing out an
  // upload slot for something this app would refuse to record.
  const size = Number(str(formData, "size"));
  if (!Number.isFinite(size) || size <= 0) return { error: t("errors.maps.noFile") };
  if (size > MAX_BYTES) return { error: t("errors.maps.tooLarge") };
  const ext = EXT_BY_MIME[str(formData, "type")];
  if (!ext) return { error: t("errors.maps.badType") };

  // Minted here and never accepted from the browser: the key is the one thing
  // step two has to take on trust, and a caller-chosen one could name any
  // object in the bucket.
  const fileName = `${nanoid(16)}.${ext}`;
  const uploadUrl = await createMapUploadUrl(fileName);
  // Only reachable with Storage unconfigured (local-disk mode), where there is
  // nowhere for the browser to upload to.
  if (!uploadUrl) return { error: t("errors.maps.uploadFailed") };
  return { ticket: { uploadUrl, fileName } };
}

/**
 * Step two: the bytes are already in Storage, so all that is left is the row.
 * Nothing from the browser is taken at face value — the key has to look like
 * one this server minted, and Storage is asked what actually sits under it
 * before a map is written down.
 */
export async function finalizeMapUpload(
  campaignId: string,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return { error: t("errors.maps.dmOnly") };

  const fileName = str(formData, "fileName");
  if (!FILE_NAME_RE.test(fileName)) return { error: t("errors.maps.uploadFailed") };

  const info = await statMapFile(fileName);
  if (!info || info.size <= 0 || info.size > MAX_BYTES || !EXT_BY_MIME[info.contentType]) {
    // Whatever is up there is not something this app will serve. No row will
    // point at it, so leaving it in the bucket only costs space — dropping it
    // is best effort, since the caller's error is the one worth reporting.
    if (info) {
      await deleteMapFile(fileName).catch((e) =>
        console.error("finalizeMapUpload: reject cleanup failed", e)
      );
    }
    return { error: t("errors.maps.uploadFailed") };
  }

  const title = str(formData, "title") || t("campaign.maps.untitled");
  const visibility = str(formData, "visibility") === "dm" ? ("dm" as const) : ("everyone" as const);
  try {
    await db.insert(campaignMaps).values({
      id: nanoid(12),
      campaignId,
      title: title.slice(0, 120),
      fileName,
      // Storage's own answer, not the type the browser announced in step one.
      mimeType: info.contentType,
      visibility,
      isActive: 0,
      createdAt: Date.now(),
    });
  } catch (e) {
    // Storage cannot join the transaction, so clean up by hand: with no row
    // pointing at it, the uploaded object is unreachable dead weight. A failed
    // cleanup is noted and dropped — the original error is the one to report.
    await deleteMapFile(fileName).catch((err) =>
      console.error("finalizeMapUpload: orphan cleanup failed", err)
    );
    throw e;
  }
  await revalidateMapPages(campaignId);
  return {};
}

/** At most one map per campaign is "on the table" (mirrors story beats). */
export async function setActiveMap(mapId: string, active: boolean) {
  const user = await requireUser();
  const map = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) });
  if (!map) return;
  const access = await getCampaignAccess(map.campaignId, user.id);
  if (!access?.isDm) return;
  try {
    // Clearing the old pick and setting the new one are one write: between the
    // two statements the campaign would briefly have no map on the table, and
    // campaign_maps_one_active would reject a second one landing there.
    await db.transaction(async (tx) => {
      if (active) {
        await tx
          .update(campaignMaps)
          .set({ isActive: 0 })
          .where(eq(campaignMaps.campaignId, map.campaignId));
      }
      await tx
        .update(campaignMaps)
        .set({ isActive: active ? 1 : 0 })
        .where(eq(campaignMaps.id, mapId));
    });
  } catch (e) {
    // Another DM put a map on the table in the same instant; theirs stands.
    if (!isUniqueViolation(e)) throw e;
  }
  await revalidateMapPages(map.campaignId);
}

/** Select-driven variant for the live session screen; empty mapId clears the table. */
export async function chooseActiveMap(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return;
  const mapId = str(formData, "mapId");
  // A mapId from the form is forgeable, so the swap is only made once the map
  // is known to belong here — and then both writes go in together.
  const map = mapId
    ? await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) })
    : null;
  const target = map?.campaignId === campaignId ? map : null;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(campaignMaps)
        .set({ isActive: 0 })
        .where(eq(campaignMaps.campaignId, campaignId));
      if (target) {
        await tx.update(campaignMaps).set({ isActive: 1 }).where(eq(campaignMaps.id, target.id));
      }
    });
  } catch (e) {
    // Another DM chose a map at the same instant; theirs is the one on the table.
    if (!isUniqueViolation(e)) throw e;
  }
  await revalidateMapPages(campaignId);
}

export async function setMapVisibility(mapId: string, visibility: "everyone" | "dm") {
  const user = await requireUser();
  const map = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) });
  if (!map) return;
  const access = await getCampaignAccess(map.campaignId, user.id);
  if (!access?.isDm) return;
  await db.update(campaignMaps).set({ visibility }).where(eq(campaignMaps.id, mapId));
  await revalidateMapPages(map.campaignId);
}

/**
 * VTT square grid for one map. Sizes are pixels of the ORIGINAL image, so the
 * overlay lines up at any zoom; clearing the checkbox drops the grid entirely.
 */
export async function setMapGrid(mapId: string, formData: FormData) {
  const user = await requireUser();
  const map = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) });
  if (!map) return;
  const access = await getCampaignAccess(map.campaignId, user.id);
  if (!access?.isDm) return;

  const enabled = str(formData, "enabled") !== "";
  if (!enabled) {
    await db
      .update(campaignMaps)
      .set({ gridSize: null, gridOffsetX: 0, gridOffsetY: 0 })
      .where(eq(campaignMaps.id, mapId));
  } else {
    const size = int(formData, "size", 10, 1000, map.gridSize ?? 70);
    await db
      .update(campaignMaps)
      .set({
        gridSize: size,
        gridOffsetX: int(formData, "offsetX", 0, size, 0),
        gridOffsetY: int(formData, "offsetY", 0, size, 0),
      })
      .where(eq(campaignMaps.id, mapId));
  }
  await revalidateMapPages(map.campaignId, mapId);
}

export async function deleteMap(mapId: string) {
  const user = await requireUser();
  const map = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) });
  if (!map) return;
  const access = await getCampaignAccess(map.campaignId, user.id);
  if (!access?.isDm) return;
  // Row first, then the object: the reverse order can leave a row pointing at
  // a file that is already gone. A leftover object is the cheaper failure.
  await db.delete(campaignMaps).where(eq(campaignMaps.id, mapId));
  await deleteMapFile(map.fileName).catch((e) =>
    console.error("deleteMap: file delete failed", e)
  );
  await revalidateMapPages(map.campaignId);
}
