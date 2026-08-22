import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { ITEM_CATEGORIES, localizedItemName, searchItems, srdItemArt } from "@/lib/srd-data";
import { EMPTY_ART } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import { LinkSpinner } from "@/components/LinkSpinner";
import { Pagination } from "@/components/Pagination";
import { BackLink, Button, Input } from "@/components/ui";
import { ActiveFilters, type FilterChip } from "../../ActiveFilters";
import { EmptyRow } from "../../EmptyRow";

const BASE_PATH = "/compendium/items";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("compendium.items.title") };
}

const LIMIT = 60;

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  const { t, locale } = await getT();
  const { q = "", cat = "", page: pageRaw = "1" } = await searchParams;
  const category = ITEM_CATEGORIES.some((c) => c === cat) ? cat : "";
  const results = searchItems(q, category);
  const totalPages = Math.max(1, Math.ceil(results.length / LIMIT));
  const page = Math.min(Math.max(Number.parseInt(pageRaw, 10) || 1, 1), totalPages);
  const shown = results.slice((page - 1) * LIMIT, page * LIMIT);

  // Chips re-enter the list at page 1, keeping the current name search.
  const chipHref = (value: string) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (value) query.set("cat", value);
    const qs = query.toString();
    return `${BASE_PATH}${qs ? `?${qs}` : ""}`;
  };
  // `inline-flex` and the gap are for the pending ring each chip carries.
  const chipClass = (value: string) =>
    value === category
      ? "inline-flex items-center gap-1.5 rounded-sm border border-gold-500 bg-gold-500/10 px-3 py-1.5 text-xs font-bold text-gold-300"
      : "inline-flex items-center gap-1.5 rounded-sm border border-ink-600 px-3 py-1.5 text-xs font-semibold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300";

  const chips: FilterChip[] = [
    q && { key: "q", label: t("compendium.filters.query", { q }) },
    category && {
      key: "cat",
      label: `${t("compendium.items.category")}: ${t(
        `compendium.items.categories.${category}`
      )}`,
    },
  ].filter(Boolean) as FilterChip[];

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/compendium">{t("compendium.title")}</BackLink>
        <h1 className="mt-2 mb-6 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("compendium.items.title")}
        </h1>

        {/* Narrow screens stack: the name box takes the full row and the
            button sits under it, instead of a 224px field marooned beside a
            wrapped submit. From `sm` up it is the old single line. */}
        <form className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Input
            name="q"
            defaultValue={q}
            aria-label={t("compendium.searchLabel")}
            placeholder={t("compendium.searchByName")}
            className="col-span-2 sm:!w-56"
          />
          {category && <input type="hidden" name="cat" value={category} />}
          <Button type="submit" className="col-span-2">
            {t("common.search")}
          </Button>
        </form>

        <nav
          aria-label={t("compendium.items.category")}
          className="mb-4 flex flex-wrap gap-1.5"
        >
          <Link href={chipHref("") as never} className={chipClass("")}>
            {t("compendium.items.allCategories")}
            <LinkSpinner />
          </Link>
          {ITEM_CATEGORIES.map((c) => (
            <Link key={c} href={chipHref(c) as never} className={chipClass(c)}>
              {t(`compendium.items.categories.${c}`)}
              <LinkSpinner />
            </Link>
          ))}
        </nav>

        <ActiveFilters
          basePath={BASE_PATH}
          params={{ q, cat: category }}
          chips={chips}
          heading={t("compendium.filters.active")}
          removeLabel={(label) => t("compendium.filters.remove", { label })}
          clearLabel={t("compendium.filters.clearAll")}
        />

        <p className="mb-4 text-sm text-parchment-500">
          {t("compendium.results", { n: results.length })}
        </p>

        <ul className="divide-y divide-ink-700 rounded-sm border border-ink-700 bg-ink-900/85">
          {shown.map((item) => {
            const name = localizedItemName(item, locale);
            const meta = [item.sub, item.damage, item.ac && `AC ${item.ac}`, item.cost]
              .filter(Boolean)
              .join(" · ");
            // What a phone gets room for: what it hits for, what it costs.
            const shortMeta = [item.damage, item.cost].filter(Boolean).join(" · ");
            return (
              <li key={item.index}>
                <Link
                  href={`/compendium/items/${item.index}`}
                  className="group flex items-center gap-3 px-4 py-2.5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={srdItemArt(item).thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-10 w-10 shrink-0 rounded-sm border border-ink-600 object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    {/* Same treatment as the spell list: the rarity is a chip,
                        so it never runs into the name as one word. */}
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-parchment-100 transition group-hover:text-gold-400">
                        {name}
                      </span>
                      {/* The SRD's own name, kept in sight: it is the one the
                          description below speaks, and the one every other
                          table at the game will say out loud. */}
                      {name !== item.name && (
                        <span className="text-xs text-parchment-500">{item.name}</span>
                      )}
                      {item.rarity && (
                        <span className="rounded-sm border border-amber-800/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                          {item.rarity}
                        </span>
                      )}
                    </span>
                    {/* The meta used to vanish below `sm` and take the row's
                        only fact with it. It moves under the name instead. */}
                    {shortMeta && (
                      <span className="mt-0.5 block text-xs text-parchment-500 sm:hidden">
                        {shortMeta}
                      </span>
                    )}
                  </span>
                  <span className="hidden text-xs text-parchment-500 sm:block">{meta}</span>
                </Link>
              </li>
            );
          })}
          {shown.length === 0 && (
            <EmptyRow
              art={EMPTY_ART.library}
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
          params={{ q, cat: category }}
        />
      </main>
    </>
  );
}
