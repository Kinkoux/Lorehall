"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/actions";
import { setLocale } from "@/lib/locale-actions";
import { makeT, type Locale } from "@/lib/i18n";
import { IconCompass } from "@/components/Icons";

export function Navbar({
  userName,
  locale,
}: {
  userName: string | null;
  locale: Locale;
}) {
  const pathname = usePathname();
  const t = makeT(locale);

  const links: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
    ...(userName
      ? [
          {
            href: "/dashboard",
            label: t("common.nav.dashboard"),
            match: (p: string) =>
              p.startsWith("/dashboard") || p.startsWith("/w/") || p.startsWith("/c/") || p.startsWith("/s/"),
          },
          {
            href: "/characters",
            label: t("common.nav.characters"),
            match: (p: string) => p.startsWith("/characters"),
          },
        ]
      : []),
    {
      href: "/compendium",
      label: t("common.nav.compendium"),
      match: (p: string) => p.startsWith("/compendium"),
    },
    {
      href: "/reference",
      label: t("common.nav.reference"),
      match: (p: string) => p.startsWith("/reference"),
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-600/70 bg-ink-900/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5">
        <Link
          href={userName ? "/dashboard" : "/"}
          className="flex items-center gap-2 font-display text-lg font-bold tracking-[0.25em] text-gold-400"
        >
          <IconCompass size={20} className="text-blood-400" />
          LOREHALL
        </Link>

        <div className="flex items-center gap-1 text-sm">
          {links.map((link) => {
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href as never}
                className={`border-b-2 px-2 py-1 transition ${
                  active
                    ? "border-blood-400 font-semibold text-parchment-100"
                    : "border-transparent text-parchment-500 hover:border-ink-600 hover:text-parchment-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm">
          <div
            className="flex overflow-hidden rounded-sm border border-ink-600 text-[11px] font-bold"
            role="group"
            aria-label={t("common.nav.language")}
          >
            {(["tr", "en"] as const).map((code) => (
              <form key={code} action={setLocale.bind(null, code)}>
                <button
                  type="submit"
                  disabled={locale === code}
                  className={`px-2 py-1 uppercase transition cursor-pointer disabled:cursor-default ${
                    locale === code
                      ? "bg-parchment-300 text-ink-900"
                      : "text-parchment-500 hover:text-parchment-100"
                  }`}
                >
                  {code}
                </button>
              </form>
            ))}
          </div>

          {userName ? (
            <>
              <span className="hidden text-parchment-300 sm:inline">{userName}</span>
              <form action={logout}>
                <button className="text-parchment-500 transition hover:text-gold-300 cursor-pointer">
                  {t("common.nav.signOut")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-parchment-300 transition hover:text-gold-300">
                {t("common.nav.signIn")}
              </Link>
              <Link
                href="/register"
                className="rounded-sm bg-gold-500 px-3 py-1.5 font-bold text-ink-900 transition hover:bg-gold-400"
              >
                {t("common.nav.join")}
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
