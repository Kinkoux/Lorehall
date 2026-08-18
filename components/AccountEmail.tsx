"use client";

import { useActionState } from "react";
import {
  resendVerification,
  setAccountEmail,
  type MailFormState,
} from "@/lib/email-actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, GhostButton, Input, Label } from "@/components/ui";

/**
 * The account's address, its standing, and the two things that can be done
 * about it. Both forms answer in the same shape — a complaint or a receipt —
 * and each keeps its own, so a resend does not wipe what the save just said.
 */
export function AccountEmail({
  email,
  verified,
  locale,
}: {
  email: string | null;
  verified: boolean;
  locale: Locale;
}) {
  const t = makeT(locale);
  const [saveState, saveAction, saving] = useActionState<MailFormState, FormData>(
    setAccountEmail,
    {}
  );
  // Wrapped rather than passed straight through: the action takes no input,
  // and useActionState would otherwise hand it a state and a FormData that it
  // has no business reading.
  const [resendState, resendAction, resending] = useActionState<MailFormState, FormData>(
    () => resendVerification(),
    {}
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-base text-parchment-100">
          {email ?? t("dashboard.account.none")}
        </span>
        {email && (
          <span
            className={`rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
              verified
                ? "border-emerald-700/60 bg-emerald-100/60 text-emerald-900"
                : "border-blood-500 bg-blood-500/15 text-blood-400"
            }`}
          >
            {verified ? t("dashboard.account.verified") : t("dashboard.account.unverified")}
          </span>
        )}
      </div>

      <form action={saveAction} className="space-y-2">
        <label className="block">
          <Label>{t("dashboard.account.email")}</Label>
          <Input
            name="email"
            type="email"
            required
            maxLength={254}
            defaultValue={email ?? ""}
            placeholder={t("dashboard.account.emailPh")}
          />
        </label>
        <ErrorText>{saveState.error}</ErrorText>
        <Notice>{saveState.notice}</Notice>
        <Button type="submit" disabled={saving}>
          {saving ? t("dashboard.account.saving") : t("dashboard.account.save")}
        </Button>
      </form>

      {email && !verified && (
        <form action={resendAction} className="space-y-2 border-t border-ink-700 pt-3">
          <GhostButton type="submit" disabled={resending}>
            {resending ? t("dashboard.account.resending") : t("dashboard.account.resend")}
          </GhostButton>
          <ErrorText>{resendState.error}</ErrorText>
          <Notice>{resendState.notice}</Notice>
        </form>
      )}

      <p className="text-xs text-parchment-500">{t("dashboard.account.hint")}</p>
    </div>
  );
}

function Notice({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p className="rounded-sm border border-gold-500/60 bg-gold-500/10 px-3 py-2 text-sm text-gold-300">
      {children}
    </p>
  );
}
