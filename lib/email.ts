import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { makeT, type Locale } from "@/lib/i18n";
import { issueEmailToken, retireEmailTokens } from "@/lib/email-tokens";

/**
 * Outgoing mail: confirmation links and password resets, nothing else.
 *
 * The whole layer is optional. With no SMTP settings in the environment the
 * app still registers accounts and still changes addresses — it simply never
 * sends anything, and every caller carries on as if the message had left.
 * That is deliberate: a mail server that is down, misconfigured or absent
 * must not be able to stop someone joining a table.
 */

/** Server-side ceiling on an address; RFC 5321 puts the path at 256 octets. */
export const EMAIL_MAX = 254;

/**
 * Deliberately loose: one @, no spaces, a dot in the domain. Anything
 * stricter starts rejecting addresses that genuinely deliver, and the real
 * proof of an address is the link we mail to it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Trim, lower-case and cap. The column is CITEXT, so case is cosmetic. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, EMAIL_MAX);
}

export function isEmailAddress(value: string): boolean {
  return value.length <= EMAIL_MAX && EMAIL_PATTERN.test(value);
}

/**
 * Where the links in a message point. Vercel gives every deployment its own
 * hostname, so the production one is named rather than guessed; APP_URL
 * overrides it for previews and local runs.
 */
export function appUrl(): string {
  return (process.env.APP_URL ?? "https://lorehall.vercel.app").replace(/\/+$/, "");
}

type Smtp = { host: string; port: number; user: string; pass: string; from: string };

function smtpSettings(): Smtp | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM;
  if (!host || !user || !pass || !from) return null;
  if (!Number.isInteger(port) || port <= 0) return null;
  return { host, port, user, pass, from };
}

/** True when every SMTP setting is present; false means "send nothing". */
export function isEmailConfigured(): boolean {
  return smtpSettings() !== null;
}

// Cached on globalThis for the same reason the database pool is: dev-mode HMR
// would otherwise open a fresh connection pool on every reload.
const globalForMail = globalThis as unknown as { __lorehallMailer?: Transporter };

function transport(settings: Smtp): Transporter {
  globalForMail.__lorehallMailer ??= nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    // 465 is implicit TLS; 587 and 25 start in the clear and upgrade.
    secure: settings.port === 465,
    auth: { user: settings.user, pass: settings.pass },
  });
  return globalForMail.__lorehallMailer;
}

/**
 * Hand one message to the mail server. Returns whether it was accepted, but
 * the answer is advisory: no caller is expected to fail because of it. A
 * missing configuration is a logged no-op, and a refusal from the server is
 * logged and swallowed — the account was still created, the address was still
 * saved, and the owner can ask for another link.
 */
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<boolean> {
  const settings = smtpSettings();
  if (!settings) {
    console.warn(`E-posta yapılandırılmadı (SMTP_*) — "${subject}" gönderilmedi.`);
    return false;
  }
  try {
    await transport(settings).sendMail({ from: settings.from, to, subject, text, html });
    return true;
  } catch (error) {
    console.error("sendMail failed", error);
    return false;
  }
}

/**
 * The body of every message we send: a line of explanation, the link on its
 * own, and how long it lasts. Nothing here is user-supplied — the strings come
 * from the dictionary and the URL is ours — so the HTML needs no escaping.
 */
function compose(intro: string, link: string, note: string) {
  return {
    text: `${intro}\n\n${link}\n\n${note}`,
    html:
      `<p>${intro}</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p style="color:#6b6255;font-size:13px">${note}</p>`,
  };
}

/**
 * Mint a confirmation link for an account and post it. Sent at registration
 * and again whenever the address changes or the owner asks for another; each
 * one puts the previous confirmation out of use, so only the newest link in
 * the newest inbox works.
 *
 * With no SMTP settings this does nothing at all — no token is written either,
 * since a token nobody can receive is only a row waiting to expire. Failures
 * are logged and swallowed: the caller's own work has already succeeded.
 */
export async function sendVerification(
  userId: string,
  to: string,
  locale: Locale
): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn("E-posta yapılandırılmadı (SMTP_*) — doğrulama bağlantısı gönderilmedi.");
    return false;
  }
  const t = makeT(locale);
  try {
    await retireEmailTokens(userId, "verify");
    const token = await issueEmailToken(userId, "verify");
    const { text, html } = compose(
      t("auth.mail.verify.intro"),
      `${appUrl()}/verify/${token}`,
      t("auth.mail.verify.note")
    );
    return await sendMail(to, t("auth.mail.verify.subject"), text, html);
  } catch (error) {
    console.error("sendVerification failed", error);
    return false;
  }
}

/**
 * Mint a password-reset link and post it. The previous one stops working, so
 * asking twice does not leave two live doors into the account.
 */
export async function sendPasswordReset(
  userId: string,
  to: string,
  locale: Locale
): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn("E-posta yapılandırılmadı (SMTP_*) — sıfırlama bağlantısı gönderilmedi.");
    return false;
  }
  const t = makeT(locale);
  try {
    await retireEmailTokens(userId, "reset");
    const token = await issueEmailToken(userId, "reset");
    const { text, html } = compose(
      t("auth.mail.reset.intro"),
      `${appUrl()}/reset-password/${token}`,
      t("auth.mail.reset.note")
    );
    return await sendMail(to, t("auth.mail.reset.subject"), text, html);
  } catch (error) {
    console.error("sendPasswordReset failed", error);
    return false;
  }
}
