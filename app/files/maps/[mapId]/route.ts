import { eq } from "drizzle-orm";
import { db, campaignMaps } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { readMapFile } from "@/lib/storage";

/**
 * Serves uploaded map images. Everything is a 404 — including auth and
 * permission failures — so the URL leaks nothing about what exists.
 * The file name is a one-shot nanoid, so the response can be immutable.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mapId: string }> }
) {
  const { mapId } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const map = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) });
  if (!map) return new Response("Not found", { status: 404 });

  const access = await getCampaignAccess(map.campaignId, user.id);
  if (!access?.canView) return new Response("Not found", { status: 404 });
  if (map.visibility === "dm" && !access.isDm) return new Response("Not found", { status: 404 });

  const file = await readMapFile(map.fileName);
  if (!file) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": map.mimeType,
    "Cache-Control": "private, max-age=31536000, immutable",
    // Never let a browser re-interpret an upload as HTML/script.
    "X-Content-Type-Options": "nosniff",
  };
  if (file.contentLength) headers["Content-Length"] = file.contentLength;
  return new Response(file.body as BodyInit, { headers });
}
