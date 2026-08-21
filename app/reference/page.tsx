import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { COMBAT_ACTIONS, CONDITIONS, SKILLS } from "@/lib/srd";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, SectionTitle } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("reference.metaTitle") };
}

const ABILITY_COLORS: Record<string, string> = {
  STR: "bg-red-100 text-red-900 border-red-700/50",
  DEX: "bg-emerald-100 text-emerald-900 border-emerald-700/50",
  INT: "bg-sky-100 text-sky-900 border-sky-700/50",
  WIS: "bg-purple-100 text-purple-900 border-purple-700/50",
  CHA: "bg-amber-100 text-amber-900 border-amber-700/50",
};

/** The jump bar's stops, in the order the page lays them out. */
const SECTIONS = [
  { id: "skills", key: "reference.skills" },
  { id: "conditions", key: "reference.conditions" },
  { id: "actions", key: "reference.combatActions" },
];

export default async function ReferencePage() {
  const user = await getCurrentUser();
  const { t, locale } = await getT();

  /*
   * The jump bar parks directly under the navbar, which is sticky at 0 and —
   * since it folds into a hamburger below md — stays a single ~53-61px row at
   * every width. A few pixels either way only slides the bar's top edge under
   * the navbar, which its padding absorbs.
   */
  const stickyTop = "top-14";

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("reference.title")}
        </h1>
        <p className="mt-1 mb-4 text-sm text-parchment-500">
          {t("reference.subtitle")}
        </p>

        <nav
          aria-label={t("reference.sections")}
          className={`sticky ${stickyTop} z-30 -mx-4 mb-8 overflow-x-auto border-y border-ink-600/70 bg-ink-900/90 px-4 py-2 backdrop-blur`}
        >
          <ul className="flex gap-1.5 whitespace-nowrap">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-block rounded-sm border border-ink-600 px-3 py-1.5 text-xs font-semibold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300"
                >
                  {t(section.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section id="skills" className="mb-10 scroll-mt-32">
          <SectionTitle>{t("reference.skills")}</SectionTitle>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {SKILLS.map((skill) => (
              <Card key={skill.name} className="py-4">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="font-display text-base font-bold text-parchment-100">
                    {skill.name}
                  </h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${ABILITY_COLORS[skill.ability]}`}
                  >
                    {skill.ability}
                  </span>
                </div>
                <p className="text-sm leading-snug text-parchment-300">
                  {skill.description[locale]}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section id="conditions" className="mb-10 scroll-mt-32">
          <SectionTitle>{t("reference.conditions")}</SectionTitle>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {CONDITIONS.map((condition) => (
              <Card key={condition.name} className="py-4">
                <h3 className="mb-1 font-display text-base font-bold text-blood-400">
                  {condition.name}
                </h3>
                <p className="text-sm leading-snug text-parchment-300">
                  {condition.description[locale]}
                </p>
              </Card>
            ))}
          </div>
        </section>

        <section id="actions" className="scroll-mt-32">
          <SectionTitle>{t("reference.combatActions")}</SectionTitle>
          <Card className="mt-4">
            <ul className="divide-y divide-ink-700">
              {COMBAT_ACTIONS.map((action) => (
                <li key={action.name} className="flex gap-4 py-2.5 first:pt-0 last:pb-0">
                  <span className="w-32 shrink-0 font-display text-sm font-bold text-gold-300">
                    {action.name}
                  </span>
                  <span className="text-sm text-parchment-300">
                    {action.description[locale]}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </main>
    </>
  );
}
