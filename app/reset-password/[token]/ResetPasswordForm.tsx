"use client";

import { useActionState } from "react";
import { resetPassword, type MailFormState } from "@/lib/email-actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, Label } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

export function ResetPasswordForm({ token, locale }: { token: string; locale: Locale }) {
  const t = makeT(locale);
  // The link is bound to the action rather than posted as a field: it never
  // becomes part of the form the browser can be talked into replaying.
  const [state, action, pending] = useActionState<MailFormState, FormData>(
    resetPassword.bind(null, token),
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <Label>{t("auth.reset.password")}</Label>
        <PasswordInput
          locale={locale}
          name="password"
          required
          autoFocus
          minLength={6}
          maxLength={128}
          autoComplete="new-password"
        />
        <span className="mt-1 block text-xs text-parchment-500">{t("auth.reset.hint")}</span>
      </label>
      <ErrorText>{state.error}</ErrorText>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("auth.reset.submitting") : t("auth.reset.submit")}
      </Button>
      <p className="text-xs text-parchment-500">{t("auth.reset.signsOut")}</p>
    </form>
  );
}
