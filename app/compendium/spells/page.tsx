import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import {
  searchSpells,
  SPELL_CLASSES,
  SPELL_SCHOOLS,
  SUBCLASS_FILTERS,
} from "@/lib/srd-data";
import { SiteHeader } from "@/components/SiteHeader";
import { SchoolSigil } from "@/components/Icons";
import { Pagination } from "@/components/Pagination";
import { BackLink, Button, Input, Select } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("compendium.spells.title") };
}

const LIMIT = 60;

export default async function SpellsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    level?: string;
    klass?: string;
    school?: string;
    subclass?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const { t } = await getT();
  const {
    q = "",
    level = "",
    klass = "",
    school = "",
    subclass = "",
    page: pageRaw = "1",
  } = await searchParams;
  const results = searchSpells(q, level, klass, school, subclass);
  const totalPages = Math.max(1, Math.ceil(results.length / LIMIT));
  const page = Math.min(Math.max(Number.parseInt(pageRaw, 10) || 1, 1), totalPages);
  const shown = results.slice((page - 1) * LIMIT, page * LIMIT);
  const activeSubclass = SUBCLASS_FILTERS.find((f) => f.key === subclass);

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/compendium">{t("compendium.title")}</BackLink>
        <h1 className="mt-2 mb-6 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("compendium.spells.title")}
        </h1>

        <form className="mb-6 flex flex-wrap gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder={t("compendium.searchByName")}
            className="!w-52"
          />
          <Select name="level" defaultValue={level} className="!w-32">
            <option value="">{t("compendium.spells.anyLevel")}</option>
            <option value="0">{t("compendium.spells.cantrip")}</option>
            {Array.from({ length: 9 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {t("compendium.spells.level")} {i + 1}
              </option>
            ))}
          </Select>
          <Select name="klass" defaultValue={klass} className="!w-36">
            <option value="">{t("compendium.spells.anyClass")}</option>
            {SPELL_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select name="school" defaultValue={school} className="!w-40">
            <option value="">{t("compendium.spells.anySchool")}</option>
            {SPELL_SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select name="subclass" defaultValue={subclass} className="!w-52">
            <option value="">{t("compendium.spells.anySubclass")}</option>
            {SUBCLASS_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
          <Button type="submit">{t("common.search")}</Button>
        </form>

        <p className="mb-1 text-xs text-parchment-500">
          {t("compendium.results", { n: results.length })}
        </p>
        {activeSubclass?.kind === "rule" && (
          <p className="mb-4 text-xs italic text-parchment-500">
            {t("compendium.spells.ruleBasedNote", { label: activeSubclass.label })}
          </p>
        )}

        <ul className="mt-3 divide-y divide-ink-700 rounded-sm border border-ink-700 bg-ink-900/85">
          {shown.map((spell) => (
            <li key={spell.index}>
              <Link
                href={`/compendium/spells/${spell.index}`}
                className="group flex items-center gap-3 px-4 py-2.5"
              >
                <SchoolSigil
                  school={spell.school}
                  size={18}
                  className="shrink-0 text-blood-400/80"
                />
                <span className="w-14 shrink-0 text-xs font-bold text-gold-300">
                  {spell.level === 0 ? t("compendium.spells.cantrip") : `${spell.level}`}
                </span>
                <span className="flex-1 font-semibold text-parchment-100 transition group-hover:text-gold-400">
                  {spell.name}
                  {spell.concentration && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-amber-800">
                      {t("compendium.spells.concShort")}
                    </span>
                  )}
                  {spell.ritual && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-purple-800">
                      {t("compendium.spells.ritualShort")}
                    </span>
                  )}
                </span>
                <span className="hidden text-xs text-parchment-500 sm:block">
                  {spell.school} · {spell.classes.join(", ")}
                </span>
              </Link>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-4 py-6 text-sm text-parchment-500">
              {t("compendium.noResults")}
            </li>
          )}
        </ul>
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/compendium/spells"
          params={{ q, level, klass, school, subclass }}
        />
      </main>
    </>
  );
}
