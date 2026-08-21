"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type MailFormState } from "@/lib/email-actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, Card, ErrorText, Input, Label } from "@/components/ui";
import { AuthMasthead } from "@/components/AuthMasthead";

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const t = makeT(locale);
  const [state, action, pending] = useActionState<MailFormState, FormData>(
    requestPasswordReset,
    {}
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <AuthMasthead locale={locale} />
      <Card className="w-full max-w-sm">
        <h1 className="mb-4 text-center font-display text-2xl font-bold tracking-widest text-gold-400">
          {t("auth.forgot.title")}
        </h1>
        <p className="mb-5 text-sm text-parchment-500">{t("auth.forgot.intro")}</p>
        <form action={action} className="space-y-4">
          <label className="block">
            <Label>{t("auth.forgot.email")}</Label>
            <Input
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              maxLength={254}
              placeholder={t("auth.forgot.emailPh")}
            />
          </label>
          <ErrorText>{state.error}</ErrorText>
          {state.notice && (
            <p className="rounded-sm border border-gold-500/60 bg-gold-500/10 px-3 py-2 text-sm text-gold-300">
              {state.notice}
            </p>
          )}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-parchment-500 hover:text-gold-300">
            {t("auth.forgot.backToLogin")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
