"use client";

import Link from "next/link";
import { useActionState } from "react";
import { register, type FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, Card, ErrorText, Input, Label } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthMasthead } from "@/components/AuthMasthead";

export function RegisterForm({ locale }: { locale: Locale }) {
  const t = makeT(locale);
  const [state, action, pending] = useActionState<FormState, FormData>(register, {});

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <AuthMasthead locale={locale} />
      <Card className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-2xl font-bold tracking-widest text-gold-400">
          {t("auth.register.title")}
        </h1>
        <form action={action} className="space-y-4">
          <label className="block">
            <Label>{t("auth.register.username")}</Label>
            <Input
              name="username"
              required
              autoComplete="username"
              autoFocus
              pattern="[A-Za-z0-9_]{3,20}"
              title={t("auth.register.usernameHint")}
            />
          </label>
          <label className="block">
            <Label>{t("auth.register.displayName")}</Label>
            <Input name="displayName" placeholder={t("auth.register.optionalPh")} />
          </label>
          <label className="block">
            <Label>{t("auth.register.email")}</Label>
            <Input
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              placeholder={t("auth.register.emailPh")}
            />
            <span className="mt-1 block text-xs text-parchment-500">
              {t("auth.register.emailHint")}
            </span>
          </label>
          <label className="block">
            <Label>{t("auth.register.password")}</Label>
            <PasswordInput
              locale={locale}
              name="password"
              required
              minLength={6}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <ErrorText>{state.error}</ErrorText>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t("auth.register.submitting") : t("auth.register.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-parchment-500">
          {t("auth.register.haveAccount")}{" "}
          <Link href="/login" className="text-gold-300 hover:underline">
            {t("auth.register.signIn")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
