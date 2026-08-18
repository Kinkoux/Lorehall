"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, Card, ErrorText, Input, Label } from "@/components/ui";
import { PasswordInput } from "@/components/PasswordInput";

export function LoginForm({ locale, resetDone = false }: { locale: Locale; resetDone?: boolean }) {
  const t = makeT(locale);
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-2xl font-bold tracking-widest text-gold-400">
          {t("auth.login.title")}
        </h1>
        {resetDone && (
          <p className="mb-4 rounded-sm border border-gold-500/60 bg-gold-500/10 px-3 py-2 text-sm text-gold-300">
            {t("auth.login.resetDone")}
          </p>
        )}
        <form action={action} className="space-y-4">
          <label className="block">
            <Label>{t("auth.login.username")}</Label>
            <Input name="username" required autoComplete="username" autoFocus />
          </label>
          <label className="block">
            <Label>{t("auth.login.password")}</Label>
            <PasswordInput
              locale={locale}
              name="password"
              required
              autoComplete="current-password"
            />
          </label>
          <ErrorText>{state.error}</ErrorText>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-parchment-500 hover:text-gold-300">
            {t("auth.login.forgot")}
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-parchment-500">
          {t("auth.login.newHere")}{" "}
          <Link href="/register" className="text-gold-300 hover:underline">
            {t("auth.login.createAccount")}
          </Link>
        </p>
      </Card>
    </main>
  );
}
