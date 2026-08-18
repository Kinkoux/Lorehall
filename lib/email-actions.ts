"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, users } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { consumeEmailToken, retireEmailTokens } from "@/lib/email-tokens";
import {
  isEmailAddress,
  normalizeEmail,
  sendPasswordReset,
  sendVerification,
} from "@/lib/email";
import { getT } from "@/lib/locale";

/**
 * The address on an account, and the way back in when the password is gone.
 *
 * Two rules run through all of it. Nothing here ever reveals whether an
 * address belongs to an account — the forgot-password form answers the same
 * way whatever it finds. And nothing here fails because mail failed: an
 * address is saved whether or not the confirmation leaves the building.
 */

/** Forms here report either a complaint or a receipt, never both. */
export type MailFormState = { error?: string; notice?: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Same ceiling the register action uses; bcrypt reads 72 bytes regardless. */
const PASSWORD_MAX = 128;

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// ---------- the address on your own account ----------

/**
 * Add or change the address. A new one arrives unconfirmed — the badge on the
 * dashboard goes back to "unconfirmed" and a fresh link goes out — because the
 * only thing that proves an address is someone reading what we sent there.
 *
 * Re-submitting the address already on file is not a change and is not treated
 * as one; the resend button is what that person wanted.
 */
export async function setAccountEmail(
  _prev: MailFormState,
  formData: FormData
): Promise<MailFormState> {
  const user = await requireUser();
  const { t, locale } = await getT();

  // One bucket for both buttons on the card: a few links an hour to whatever
  // address this account names is generous for a person and thin for a relay.
  if (!(await checkRateLimit(`everify:u:${user.id}`, 5, HOUR))) {
    return { error: t("errors.auth.tooManyAttempts") };
  }

  const email = normalizeEmail(str(formData, "email"));
  if (!isEmailAddress(email)) return { error: t("errors.auth.emailInvalid") };

  if (user.email && normalizeEmail(user.email) === email) {
    return { notice: t("dashboard.account.unchanged") };
  }

  // CITEXT, so this compares the way people retype addresses.
  const claimed = await db.query.users.findFirst({
    where: and(eq(users.email, email), ne(users.id, user.id)),
  });
  if (claimed) return { error: t("errors.auth.emailTaken") };

  await db
    .update(users)
    .set({ email, emailVerifiedAt: null })
    .where(eq(users.id, user.id));
  await sendVerification(user.id, email, locale);

  revalidatePath("/dashboard");
  return { notice: t("dashboard.account.saved") };
}

/**
 * "Send it again" — for the link that never arrived, or arrived too late.
 * Takes nothing: the address is the one already on the account, and there is
 * no form field that could change which account that is.
 */
export async function resendVerification(): Promise<MailFormState> {
  const user = await requireUser();
  const { t, locale } = await getT();

  if (!(await checkRateLimit(`everify:u:${user.id}`, 5, HOUR))) {
    return { error: t("errors.auth.tooManyAttempts") };
  }
  if (!user.email) return { error: t("errors.auth.emailMissing") };
  if (user.emailVerifiedAt !== null) {
    return { notice: t("dashboard.account.alreadyVerified") };
  }

  await sendVerification(user.id, user.email, locale);
  return { notice: t("dashboard.account.resent") };
}

// ---------- the way back in ----------

/**
 * Ask for a reset link. The answer is the same sentence every time — link
 * sent, no link sent, address never seen before — because a form that
 * distinguishes them is a form that lists who has an account here.
 *
 * Two counters, because either one alone leaves an obvious way around it: how
 * many addresses one caller may probe, and how often one address may be made
 * to receive a link by anyone at all.
 */
export async function requestPasswordReset(
  _prev: MailFormState,
  formData: FormData
): Promise<MailFormState> {
  const { t, locale } = await getT();
  const email = normalizeEmail(str(formData, "email"));

  const [ipAllowed, emailAllowed] = await Promise.all([
    checkRateLimit(`pwreset:ip:${await clientIp()}`, 5, HOUR),
    checkRateLimit(`pwreset:e:${email}`, 3, HOUR),
  ]);
  if (!ipAllowed || !emailAllowed) {
    return { error: t("errors.auth.tooManyAttempts") };
  }

  // A malformed address says nothing about who has an account, so it is worth
  // pointing out rather than swallowing into the generic receipt.
  if (!isEmailAddress(email)) return { error: t("errors.auth.emailInvalid") };

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (user?.email) {
    await sendPasswordReset(user.id, user.email, locale);
  }
  return { notice: t("auth.forgot.sent") };
}

/**
 * Set the new password. The link is spent first — before the expensive hash —
 * so a dead link costs nothing, and the account's session version moves in the
 * same statement as the hash: whoever was signed in with the old password is
 * signed out everywhere, which is the point of the exercise when the reason
 * for the reset is that someone else knew it.
 */
export async function resetPassword(
  token: string,
  _prev: MailFormState,
  formData: FormData
): Promise<MailFormState> {
  const { t } = await getT();
  const password = formData.get("password");

  if (typeof password !== "string" || password.length < 6) {
    return { error: t("errors.auth.passwordTooShort") };
  }
  if (password.length > PASSWORD_MAX) {
    return { error: t("errors.auth.passwordTooLong") };
  }

  const userId = await consumeEmailToken(token, "reset");
  if (!userId) return { error: t("errors.auth.resetLinkInvalid") };

  await db
    .update(users)
    .set({
      passwordHash: await bcrypt.hash(password, 10),
      sessionVersion: sql`${users.sessionVersion} + 1`,
    })
    .where(eq(users.id, userId));
  // Any other reset link already in flight is now moot — and it would still
  // open the account it was minted for, so it does not get to stay live.
  await retireEmailTokens(userId, "reset");

  redirect("/login?reset=1");
}
