import { eq } from "drizzle-orm";
import { db, worldItems } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getWorldMembership } from "@/lib/perms";
import { readItemFile } from "@/lib/storage";

/**
 * Serves world item art. The gate is the same one the world page uses —
 * membership of the world the item belongs to — because the library is
 * browsable by every player at that world's tables. Everything is a 404,
 * including auth and permission failures, so the URL leaks nothing about
 * what exists. The response is immutable: callers append ?v=<imageFile> so a
 * replacement lands on a different cache entry (this handler ignores it).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });

  const item = await db.query.worldItems.findFirst({ where: eq(worldItems.id, itemId) });
  if (!item?.imageFile) return new Response("Not found", { status: 404 });

  const membership = await getWorldMembership(item.worldId, user.id);
  if (!membership) return new Response("Not found", { status: 404 });

  const file = await readItemFile(item.imageFile);
  if (!file) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": item.imageMime ?? "application/octet-stream",
    "Cache-Control": "private, max-age=31536000, immutable",
    // Never let a browser re-interpret an upload as HTML/script.
    "X-Content-Type-Options": "nosniff",
  };
  if (file.contentLength) headers["Content-Length"] = file.contentLength;
  return new Response(file.body as BodyInit, { headers });
}
