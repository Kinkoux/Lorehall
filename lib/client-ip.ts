import "server-only";
import { headers } from "next/headers";

/**
 * Caller's address, used only as a rate-limit key. Behind a proxy the
 * left-most x-forwarded-for entry is the client; "unknown" buckets everything
 * we cannot place together, which is the conservative direction here.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return h.get("x-real-ip")?.trim() || "unknown";
}
