import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { SHELVES } from "@/components/shelves";
import { SectionTitle } from "@/components/ui";
import { IconCoin, IconCompass, IconDie, IconParty, IconQuill } from "@/components/Icons";

/**
 * A handful of the hall's plates, shown as a sampler in the hero. Beasts and
 * treasure alternate, because the two shelves were engraved by the same hand
 * and the strip is the only place on this page that says so.
 */
const HERO_PLATES = [
  "/monsters/ancient-red-dragon.webp",
  "/items/bag-of-holding.webp",
  "/monsters/lich.webp",
  "/items/vorpal-sword.webp",
  "/monsters/owlbear.webp",
] as const;

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const { t } = await getT();

  const features = [
    { icon: IconQuill, title: t("landing.features.codex.title"), body: t("landing.features.codex.body") },
    { icon: IconDie, title: t("landing.features.sessions.title"), body: t("landing.features.sessions.body") },
    { icon: IconParty, title: t("landing.features.characters.title"), body: t("landing.features.characters.body") },
    { icon: IconCoin, title: t("landing.features.dm.title"), body: t("landing.features.dm.body") },
  ];

  return (
    <>
      <SiteHeader user={null} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6">
        <section className="flex flex-col items-center py-20 text-center sm:py-28">
          <IconCompass size={44} className="mb-6 text-blood-400" />
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.35em] text-parchment-500">
            {t("landing.tagline")}
          </p>
          {/* Cinzel caps run wide, and letter-spacing multiplies with them:
              at the full 60px the wordmark measured ~396px, wider than a
              390px phone. It steps down instead of overflowing. */}
          <h1 className="font-display text-4xl font-bold tracking-[0.15em] text-gold-400 sm:text-6xl sm:tracking-[0.12em] md:text-7xl">
            LOREHALL
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-parchment-300">
            {t("landing.lede")}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="rounded-sm bg-gold-500 px-6 py-3 font-bold text-ink-900 transition hover:bg-gold-400"
            >
              {t("landing.ctaCreate")}
            </Link>
            <Link
              href="/login"
              className="rounded-sm border border-ink-600 px-6 py-3 font-semibold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300"
            >
              {t("landing.ctaSignIn")}
            </Link>
          </div>

          {/*
            The engraved plates are the best thing the hall owns, and the
            landing page used to show none of them. Five medallions, purely
            decorative — the compendium shelf below names what they are, so
            they carry no alt text and are hidden from the reading order. They
            shrink hard on a phone: five circles and four gaps have to clear a
            320px screen without pushing the page sideways.
          */}
          <ul
            aria-hidden
            className="mt-12 flex items-center justify-center gap-2 sm:gap-4 md:gap-6"
          >
            {HERO_PLATES.map((plate) => (
              <li
                key={plate}
                className="h-12 w-12 overflow-hidden rounded-full border border-ink-600 outline outline-1 outline-ink-700/50 outline-offset-2 sm:h-20 sm:w-20 md:h-24 md:w-24"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={plate}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </li>
            ))}
          </ul>
          {/* The one line on this page that claims the artwork out loud. */}
          <p className="mt-5 text-xs italic leading-relaxed text-parchment-500">
            {t("landing.plates")}
          </p>
        </section>

        <section className="border-t-2 border-double border-ink-600/70 py-14">
          <div className="mb-8">
            <SectionTitle centered>{t("landing.features.heading")}</SectionTitle>
          </div>
          <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {features.map((feature) => (
              <div key={feature.title} className="flex gap-4">
                <feature.icon size={26} className="mt-1 shrink-0 text-gold-400" />
                <div>
                  <h3 className="font-display text-base font-bold text-parchment-100">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-parchment-300">{feature.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t-2 border-double border-ink-600/70 py-14">
          <div className="mb-8">
            <SectionTitle centered>{t("landing.browse.heading")}</SectionTitle>
          </div>
          {/* No column of its own: the shelves hang off the same left edge as
              the feature grid above, so the page has one margin, not two. */}
          <ul>
            {SHELVES.map((shelf) => (
              <li key={shelf.href} className="border-b border-ink-600/50 last:border-b-0">
                <Link href={shelf.href as never} className="group flex items-center gap-4 py-5">
                  <shelf.icon size={24} className="shrink-0 text-blood-400" />
                  <div className="flex-1">
                    <p className="font-display text-lg font-bold text-parchment-100 transition group-hover:text-gold-400">
                      {t(shelf.titleKey)}
                      {shelf.count !== null && (
                        <span className="ml-2 font-sans text-sm font-normal text-parchment-500">
                          {shelf.count}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-parchment-500">{t(shelf.bodyKey)}</p>
                  </div>
                  <span className="font-display text-parchment-500 transition group-hover:translate-x-1 group-hover:text-gold-400">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <footer className="border-t border-ink-600/50 py-8 text-center text-xs leading-relaxed text-parchment-500">
          {t("landing.srdNote")}
        </footer>
      </main>
    </>
  );
}
