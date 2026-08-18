import { eq } from "drizzle-orm";
import { db, characters } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { readPortraitFile } from "@/lib/storage";

/**
 * Serves uploaded character portraits. Everything is a 404 — including auth
 * and permission failures — so the URL leaks nothing about what exists.
 * The response is immutable: callers append ?v=<imageFile> so a re-upload
 * lands on a different cache entry (this handler ignores the parameter).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ characterId: string }> }
) {
  const { characterId } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character?.imageFile) return new Response("Not found", { status: 404 });

  const access = await getCampaignAccess(character.campaignId, user.id);
  if (!access?.canView) return new Response("Not found", { status: 404 });
  // Pending sheets are private to their owner and the DM — so is the face.
  if (
    character.approval === "pending" &&
    !access.isDm &&
    character.userId !== user.id
  ) {
    return new Response("Not found", { status: 404 });
  }

  const file = await readPortraitFile(character.imageFile);
  if (!file) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": character.imageMime ?? "application/octet-stream",
    "Cache-Control": "private, max-age=31536000, immutable",
    // Never let a browser re-interpret an upload as HTML/script.
    "X-Content-Type-Options": "nosniff",
  };
  if (file.contentLength) headers["Content-Length"] = file.contentLength;
  return new Response(file.body as BodyInit, { headers });
}
