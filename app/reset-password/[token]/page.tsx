import Link from "next/link";
import { getT } from "@/lib/locale";
import { peekEmailToken } from "@/lib/email-tokens";
import { Card } from "@/components/ui";
import { ResetPasswordForm } from "./ResetPasswordForm";

/**
 * Landing page for a reset link. The token is only looked at here, never
 * spent — someone who followed a dead link should learn that before they have
 * chosen a password, and the action is what actually redeems it.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { t, locale } = await getT();
  const live = await peekEmailToken(token, "reset");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <h1 className="mb-4 text-center font-display text-2xl font-bold tracking-widest text-gold-400">
          {live ? t("auth.reset.title") : t("auth.reset.deadTitle")}
        </h1>
        {live ? (
          <>
            <p className="mb-5 text-sm text-parchment-500">{t("auth.reset.intro")}</p>
            <ResetPasswordForm token={token} locale={locale} />
          </>
        ) : (
          <>
            <p className="text-sm text-parchment-500">{t("auth.reset.deadBody")}</p>
            <p className="mt-4 text-center text-sm">
              <Link href="/forgot-password" className="text-gold-300 hover:underline">
                {t("auth.reset.requestNew")}
              </Link>
            </p>
          </>
        )}
      </Card>
    </main>
  );
}
