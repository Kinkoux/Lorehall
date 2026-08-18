import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Fixed-window attempt counter backed by the `auth_attempts` table.
 *
 * The whole thing is one statement: the row is created or bumped, and a
 * window whose deadline has already passed restarts at 1 in the same round
 * trip. Doing it in a single INSERT ... ON CONFLICT keeps concurrent
 * attempts from racing a read-then-write, and keeps the count shared across
 * every instance instead of living in one process's memory.
 *
 * Returns true while the caller is under the ceiling, false on the attempt
 * that goes past `max`. A database failure returns true — this is a brake,
 * and it must not become the reason nobody can sign in.
 */
export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const resetAt = now + windowMs;
  let allowed: boolean;
  try {
    const rows = await db.execute<{ count: number }>(sql`
      INSERT INTO auth_attempts (key, count, reset_at)
      VALUES (${key}, 1, ${resetAt}::bigint)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN auth_attempts.reset_at < ${now}::bigint THEN 1 ELSE auth_attempts.count + 1 END,
        reset_at = CASE WHEN auth_attempts.reset_at < ${now}::bigint THEN ${resetAt}::bigint ELSE auth_attempts.reset_at END
      RETURNING count
    `);
    const count = rows[0]?.count;
    allowed = typeof count !== "number" || count <= max;
  } catch (error) {
    console.error("checkRateLimit failed", error);
    return true;
  }
  await sweepExpired(now);
  return allowed;
}

/** Rows this old are long past their window and answer nothing. */
const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;
/** Roughly one attempt in fifty pays for the sweep — no cron, no scheduler. */
const SWEEP_ODDS = 0.02;

/**
 * A lapsed row restarts in place, so the table only grows by keys nobody uses
 * again — one-off IP buckets, mistyped usernames. Sweeping them on a small
 * fraction of attempts keeps the table from accumulating forever without
 * anything scheduled. A failure here is noise, never a failed sign-in.
 */
async function sweepExpired(now: number) {
  if (Math.random() >= SWEEP_ODDS) return;
  try {
    await db.execute(sql`DELETE FROM auth_attempts WHERE reset_at < ${now - SWEEP_AFTER_MS}::bigint`);
  } catch (error) {
    console.error("auth_attempts sweep failed", error);
  }
}
