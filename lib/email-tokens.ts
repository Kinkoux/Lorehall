import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, emailTokens, users, type EmailTokenKind } from "@/lib/db";

/**
 * Mailed links, and the rules they live by.
 *
 * The token that goes out is 32 random bytes; what the database keeps is its
 * sha256. Nothing here can turn the stored row back into a working link, so a
 * leaked backup is not a set of skeleton keys — the message in the inbox is.
 *
 * Every link is single-use and time-boxed. Spending one is a single UPDATE
 * whose WHERE clause carries all of the conditions, so two clicks arriving at
 * once race inside the database and exactly one of them comes back with a row.
 */

const HOUR = 60 * 60 * 1000;

/** A confirmation can wait a day; a password reset should not. */
const TTL: Record<EmailTokenKind, number> = {
  verify: 24 * HOUR,
  reset: HOUR,
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Mint a link for `userId` and return the raw token — the only copy of it. */
export async function issueEmailToken(userId: string, kind: EmailTokenKind): Promise<string> {
  // base64url so the value drops straight into a path segment unescaped.
  const raw = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.insert(emailTokens).values({
    id: nanoid(12),
    userId,
    kind,
    tokenHash: hashToken(raw),
    expiresAt: now + TTL[kind],
    createdAt: now,
  });
  return raw;
}

/**
 * Retire whatever is still outstanding of one kind for one account. Asking for
 * a second reset link should put the first one out of use, and changing an
 * address should invalidate the confirmation sent to the old one.
 */
export async function retireEmailTokens(userId: string, kind: EmailTokenKind) {
  await db
    .update(emailTokens)
    .set({ usedAt: Date.now() })
    .where(
      and(
        eq(emailTokens.userId, userId),
        eq(emailTokens.kind, kind),
        isNull(emailTokens.usedAt)
      )
    );
}

/**
 * Is this link still good? Answers without spending it, so a page can show
 * "this link has expired" before asking anyone to type a new password.
 */
export async function peekEmailToken(
  raw: string,
  kind: EmailTokenKind
): Promise<string | null> {
  if (!raw) return null;
  const row = await db.query.emailTokens.findFirst({
    where: and(
      eq(emailTokens.tokenHash, hashToken(raw)),
      eq(emailTokens.kind, kind),
      isNull(emailTokens.usedAt),
      gt(emailTokens.expiresAt, Date.now())
    ),
  });
  return row?.userId ?? null;
}

/**
 * Spend the link. Returns the account it belonged to, or null if it was never
 * ours, has already been used, or has run out of time.
 */
export async function consumeEmailToken(
  raw: string,
  kind: EmailTokenKind
): Promise<string | null> {
  if (!raw) return null;
  const now = Date.now();
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailTokens.tokenHash, hashToken(raw)),
        eq(emailTokens.kind, kind),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, now)
      )
    )
    .returning({ userId: emailTokens.userId });
  return row?.userId ?? null;
}

/**
 * The whole of the confirmation flow: spend the link and stamp the account.
 * Lives here rather than in an action file because the verify page performs it
 * on arrival — there is no form, and nothing for the visitor to submit.
 */
export async function verifyEmailAddress(raw: string): Promise<boolean> {
  const userId = await consumeEmailToken(raw, "verify");
  if (!userId) return false;
  await db.update(users).set({ emailVerifiedAt: Date.now() }).where(eq(users.id, userId));
  return true;
}
