import Link from "next/link";
import { makeT, type Locale } from "@/lib/i18n";

/**
 * The emblem above the auth cards. These pages render without the site
 * navigation, which left no way back to the landing page — the mark itself
 * is the way out.
 */
export function AuthMasthead({ locale }: { locale: Locale }) {
  const t = makeT(locale);
  return (
    <Link href="/" className="group mb-8 flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp" alt="" className="h-16 w-16 rounded-full" />
      <span className="font-display text-lg font-bold tracking-[0.25em] text-gold-400">
        LOREHALL
      </span>
      <span className="text-xs text-parchment-500 transition group-hover:text-gold-300">
        {t("auth.backHome")}
      </span>
    </Link>
  );
}
