import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { verifyEmailAddress } from "@/lib/email-tokens";
import { SiteHeader } from "@/components/SiteHeader";
import { Card } from "@/components/ui";

/**
 * The confirmation link's destination. There is nothing to submit here: the
 * proof is the link itself, so it is spent on arrival and the page only
 * reports what happened.
 *
 * Nothing about this may be cached — the answer depends on a row that this
 * very render changes, and the second visit is meant to say "spent".
 */
export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getT();
  const user = await getCurrentUser();
  const confirmed = await verifyEmailAddress(token);

  return (
    <>
      <SiteHeader user={user} />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-sm text-center">
          <h1 className="mb-3 font-display text-2xl font-bold tracking-widest text-gold-400">
            {confirmed ? t("auth.verify.okTitle") : t("auth.verify.failTitle")}
          </h1>
          <p className="text-sm text-parchment-500">
            {confirmed ? t("auth.verify.okBody") : t("auth.verify.failBody")}
          </p>
          <p className="mt-5 text-sm">
            <Link
              href={user ? "/dashboard" : "/login"}
              className="text-gold-300 hover:underline"
            >
              {user ? t("auth.verify.toDashboard") : t("auth.verify.toLogin")}
            </Link>
          </p>
        </Card>
      </main>
    </>
  );
}
