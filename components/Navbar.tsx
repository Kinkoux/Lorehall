"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { logout } from "@/lib/actions";
import { setLocale } from "@/lib/locale-actions";
import { makeT, type Locale } from "@/lib/i18n";
import { IconMenu } from "@/components/Icons";

export function Navbar({
  userName,
  locale,
}: {
  userName: string | null;
  locale: Locale;
}) {
  const pathname = usePathname();
  const t = makeT(locale);
  /**
   * The narrow-screen fold. It is a plain `<details>`, so it opens and closes
   * with no script at all; the ref only exists to fold it back up after a
   * link inside it is taken. The header lives in the layout, so a client-side
   * navigation leaves the same DOM node — and the same open panel — standing
   * over the page that was just loaded.
   */
  const menu = useRef<HTMLDetailsElement>(null);
  const closeMenu = () => menu.current?.removeAttribute("open");
  useEffect(closeMenu, [pathname]);

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

  /** One row of the folded menu — a full-width, thumb-sized target. */
  const MENU_ROW =
    "flex min-h-11 w-full items-center rounded-sm px-3 text-sm transition hover:bg-ink-800/60";

  return (
    <header className="sticky top-0 z-40 border-b border-ink-600/70 bg-ink-900/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 md:gap-x-6">
        <Link
          href={userName ? "/dashboard" : "/"}
          className="flex items-center gap-2 font-display text-base font-bold tracking-[0.2em] text-gold-400 md:text-lg md:tracking-[0.25em]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" className="h-7 w-7 rounded-full" />
          LOREHALL
        </Link>

        <div className="hidden items-center gap-1 text-sm md:flex">
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

          <div className="hidden items-center gap-3 md:flex">
            {userName ? (
              <>
                <span className="text-parchment-300">{userName}</span>
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

          <details ref={menu} className="relative md:hidden">
            <summary
              aria-label={t("common.nav.menu")}
              className="flex h-10 w-10 list-none items-center justify-center rounded-sm border border-ink-600 text-parchment-300 transition hover:border-gold-500 hover:text-gold-300 cursor-pointer [&::-webkit-details-marker]:hidden"
            >
              <IconMenu size={20} />
            </summary>
            <div className="absolute top-full right-0 z-50 mt-2 w-56 rounded-sm border border-ink-600 bg-ink-900 p-1.5 shadow-lg shadow-[#5e4420]/20">
              {userName && (
                <p className="px-3 pt-1 pb-2 text-xs text-parchment-500">{userName}</p>
              )}
              <ul>
                {links.map((link) => {
                  const active = link.match(pathname);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href as never}
                        onClick={closeMenu}
                        className={`${MENU_ROW} ${
                          active ? "font-semibold text-parchment-100" : "text-parchment-300"
                        }`}
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
                <li className="mt-1 border-t border-ink-600/60 pt-1">
                  {userName ? (
                    <form action={logout}>
                      <button
                        type="submit"
                        onClick={closeMenu}
                        className={`${MENU_ROW} text-parchment-500 cursor-pointer`}
                      >
                        {t("common.nav.signOut")}
                      </button>
                    </form>
                  ) : (
                    <Link
                      href="/login"
                      onClick={closeMenu}
                      className={`${MENU_ROW} text-parchment-300`}
                    >
                      {t("common.nav.signIn")}
                    </Link>
                  )}
                </li>
                {!userName && (
                  <li>
                    <Link
                      href="/register"
                      onClick={closeMenu}
                      className={`${MENU_ROW} font-bold text-gold-400`}
                    >
                      {t("common.nav.join")}
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          </details>
        </div>
      </nav>
    </header>
  );
}
