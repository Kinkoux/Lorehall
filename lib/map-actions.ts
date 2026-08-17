"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, campaignMaps, gameSessions } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getT } from "@/lib/locale";
import { deleteMapFile, putMapFile } from "@/lib/storage";
import type { FormState } from "@/lib/actions";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** The live table screen shows the active map, so map changes touch it too. */
async function revalidateMapPages(campaignId: string) {
  revalidatePath(`/c/${campaignId}`);
  const liveSessions = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.campaignId, campaignId), eq(gameSessions.status, "live")));
  for (const s of liveSessions) revalidatePath(`/s/${s.id}`);
}

export async function uploadMap(
  campaignId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getT();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return { error: t("errors.maps.dmOnly") };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: t("errors.maps.noFile") };
  if (file.size > MAX_BYTES) return { error: t("errors.maps.tooLarge") };
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return { error: t("errors.maps.badType") };

  const title =
    str(formData, "title") || file.name.replace(/\.[^.]+$/, "") || t("campaign.maps.untitled");
  const visibility = str(formData, "visibility") === "dm" ? ("dm" as const) : ("everyone" as const);
  const fileName = `${nanoid(16)}.${ext}`;

  await putMapFile(fileName, new Uint8Array(await file.arrayBuffer()), file.type);
  await db.insert(campaignMaps).values({
    id: nanoid(12),
    campaignId,
    title: title.slice(0, 120),
    fileName,
    mimeType: file.type,
    visibility,
    createdAt: Date.now(),
  });
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
  if (active) {
    await db
      .update(campaignMaps)
      .set({ isActive: 0 })
      .where(eq(campaignMaps.campaignId, map.campaignId));
  }
  await db
    .update(campaignMaps)
    .set({ isActive: active ? 1 : 0 })
    .where(eq(campaignMaps.id, mapId));
  await revalidateMapPages(map.campaignId);
}

/** Select-driven variant for the live session screen; empty mapId clears the table. */
export async function chooseActiveMap(campaignId: string, formData: FormData) {
  const user = await requireUser();
  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.isDm) return;
  const mapId = str(formData, "mapId");
  await db.update(campaignMaps).set({ isActive: 0 }).where(eq(campaignMaps.campaignId, campaignId));
  if (mapId) {
    const map = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) });
    if (map?.campaignId === campaignId) {
      await db.update(campaignMaps).set({ isActive: 1 }).where(eq(campaignMaps.id, mapId));
    }
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

export async function deleteMap(mapId: string) {
  const user = await requireUser();
  const map = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) });
  if (!map) return;
  const access = await getCampaignAccess(map.campaignId, user.id);
  if (!access?.isDm) return;
  await db.delete(campaignMaps).where(eq(campaignMaps.id, mapId));
  await deleteMapFile(map.fileName);
  await revalidateMapPages(map.campaignId);
}
