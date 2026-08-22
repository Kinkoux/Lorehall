import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import {
  searchSpells,
  SPELL_CLASSES,
  SPELL_SCHOOLS,
  SUBCLASS_FILTERS,
} from "@/lib/srd-data";
import { EMPTY_ART, schoolArtThumb } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import { Pagination } from "@/components/Pagination";
import { BackLink, Button, Input, Select } from "@/components/ui";
import { ActiveFilters, type FilterChip } from "../../ActiveFilters";
import { EmptyRow } from "../../EmptyRow";

const BASE_PATH = "/compendium/spells";

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

  const chips: FilterChip[] = [
    q && { key: "q", label: t("compendium.filters.query", { q }) },
    level && {
      key: "level",
      label:
        level === "0"
          ? t("compendium.spells.cantrip")
          : `${t("compendium.spells.level")}: ${level}`,
    },
    klass && { key: "klass", label: `${t("compendium.spells.class")}: ${klass}` },
    school && { key: "school", label: `${t("compendium.spells.school")}: ${school}` },
    activeSubclass && {
      key: "subclass",
      label: `${t("compendium.spells.subclass")}: ${activeSubclass.label}`,
    },
  ].filter(Boolean) as FilterChip[];

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/compendium">{t("compendium.title")}</BackLink>
        <h1 className="mt-2 mb-6 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("compendium.spells.title")}
        </h1>

        <form className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input
            name="q"
            defaultValue={q}
            aria-label={t("compendium.searchLabel")}
            placeholder={t("compendium.searchByName")}
            className="col-span-2 sm:!w-52"
          />
          <Select
            name="level"
            defaultValue={level}
            aria-label={t("compendium.spells.level")}
            className="sm:!w-32"
          >
            <option value="">{t("compendium.spells.anyLevel")}</option>
            <option value="0">{t("compendium.spells.cantrip")}</option>
            {Array.from({ length: 9 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {t("compendium.spells.level")} {i + 1}
              </option>
            ))}
          </Select>
          <Select
            name="klass"
            defaultValue={klass}
            aria-label={t("compendium.spells.class")}
            className="sm:!w-36"
          >
            <option value="">{t("compendium.spells.anyClass")}</option>
            {SPELL_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select
            name="school"
            defaultValue={school}
            aria-label={t("compendium.spells.school")}
            className="sm:!w-40"
          >
            <option value="">{t("compendium.spells.anySchool")}</option>
            {SPELL_SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            name="subclass"
            defaultValue={subclass}
            aria-label={t("compendium.spells.subclass")}
            className="sm:!w-52"
          >
            <option value="">{t("compendium.spells.anySubclass")}</option>
            {SUBCLASS_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
          <Button type="submit">{t("common.search")}</Button>
        </form>

        <ActiveFilters
          basePath={BASE_PATH}
          params={{ q, level, klass, school, subclass }}
          chips={chips}
          heading={t("compendium.filters.active")}
          removeLabel={(label) => t("compendium.filters.remove", { label })}
          clearLabel={t("compendium.filters.clearAll")}
        />

        <p className="mb-1 text-sm text-parchment-500">
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
                {/* The 96px cut: the mark is drawn 40px wide, which a doubled
                    screen
                    wants 80 pixels for. The full plate is 512px and near 45KB,
                    and a page of sixty rows shows eight different schools —
                    most of a third of a megabyte, spent on detail no row is
                    large enough to show. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={schoolArtThumb(spell.school)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-10 w-10 shrink-0 rounded-sm border border-ink-600 object-cover"
                />
                <span className="w-14 shrink-0 text-xs font-bold text-gold-300">
                  {spell.level === 0 ? t("compendium.spells.cantrip") : `${spell.level}`}
                </span>
                {/* The marks are chips, not suffixes: run against the name they
                    read as one word ("Dancing Lightsconc"). */}
                <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-parchment-100 transition group-hover:text-gold-400">
                    {spell.name}
                  </span>
                  {spell.concentration && (
                    <span
                      title={t("compendium.spells.concentration")}
                      className="rounded-sm border border-amber-800/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800"
                    >
                      {t("compendium.spells.concShort")}
                    </span>
                  )}
                  {spell.ritual && (
                    <span
                      title={t("compendium.spells.ritual")}
                      className="rounded-sm border border-purple-800/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-800"
                    >
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
            <EmptyRow
              art={EMPTY_ART.spells}
              message={t("compendium.noResults")}
              clearHref={chips.length > 0 ? BASE_PATH : null}
              clearLabel={t("compendium.emptyClear")}
            />
          )}
        </ul>
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath={BASE_PATH}
          params={{ q, level, klass, school, subclass }}
        />
      </main>
    </>
  );
}
