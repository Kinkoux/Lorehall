import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { SectionTitle } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("legal.metaTitle") };
}

/**
 * The colophon. Public by design — a notice nobody can reach without an
 * account is not a notice — so the page asks who the reader is only to keep
 * the navbar honest, and never turns anyone away.
 */

/** The plain sections, in reading order. Fan content is set apart below. */
const SECTIONS = ["srd", "noncommercial", "independence", "art"] as const;

const REPO_URL = "https://github.com/Kinkoux/Lorehall";

export default async function LegalPage() {
  const user = await getCurrentUser();
  const { t } = await getT();

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("legal.title")}
        </h1>
        <p className="mt-1 mb-10 text-sm text-parchment-500">{t("legal.subtitle")}</p>

        {/*
          The required notice leads, and is quoted rather than paraphrased:
          Wizards asks for these words, so they are set as a block, in English,
          in both locales. The gloss underneath is what changes language.
        */}
        <section className="mb-10">
          <SectionTitle>{t("legal.fan.heading")}</SectionTitle>
          <blockquote
            lang="en"
            className="mt-4 border-l-2 border-blood-400/70 py-1 pl-4 text-sm leading-relaxed text-parchment-200"
          >
            {t("legal.fan.policy")}
          </blockquote>
          <p className="mt-4 text-sm leading-relaxed text-parchment-300">{t("legal.fan.body")}</p>
        </section>

        {SECTIONS.map((section) => (
          <section key={section} className="mb-10">
            <SectionTitle>{t(`legal.${section}.heading`)}</SectionTitle>
            <p className="mt-4 text-sm leading-relaxed text-parchment-300">
              {t(`legal.${section}.body`)}
            </p>
          </section>
        ))}

        <section className="mb-10">
          <SectionTitle>{t("legal.contact.heading")}</SectionTitle>
          <p className="mt-4 text-sm leading-relaxed text-parchment-300">
            {t("legal.contact.body")}
          </p>
          <p className="mt-3 text-sm">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-gold-400 underline decoration-ink-600 transition hover:text-gold-300"
            >
              {t("legal.contact.repoLabel")}
            </a>
          </p>
        </section>
      </main>
    </>
  );
}
