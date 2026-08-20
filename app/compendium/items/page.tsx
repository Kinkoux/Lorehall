import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { ITEM_CATEGORIES, searchItems } from "@/lib/srd-data";
import { categoryArt } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import { Pagination } from "@/components/Pagination";
import { BackLink, Button, Input } from "@/components/ui";

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
  const { t } = await getT();
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
    return `/compendium/items${qs ? `?${qs}` : ""}`;
  };
  const chipClass = (value: string) =>
    value === category
      ? "rounded-sm border border-gold-500 bg-gold-500/10 px-3 py-1.5 text-xs font-bold text-gold-300"
      : "rounded-sm border border-ink-600 px-3 py-1.5 text-xs font-semibold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300";

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/compendium">{t("compendium.title")}</BackLink>
        <h1 className="mt-2 mb-6 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("compendium.items.title")}
        </h1>

        <form className="mb-4 flex flex-wrap gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder={t("compendium.searchByName")}
            className="!w-56"
          />
          {category && <input type="hidden" name="cat" value={category} />}
          <Button type="submit">{t("common.search")}</Button>
        </form>

        <nav className="mb-6 flex flex-wrap gap-1.5">
          <Link href={chipHref("") as never} className={chipClass("")}>
            {t("compendium.items.allCategories")}
          </Link>
          {ITEM_CATEGORIES.map((c) => (
            <Link key={c} href={chipHref(c) as never} className={chipClass(c)}>
              {t(`compendium.items.categories.${c}`)}
            </Link>
          ))}
        </nav>

        <p className="mb-4 text-xs text-parchment-500">
          {t("compendium.results", { n: results.length })}
        </p>

        <ul className="divide-y divide-ink-700 rounded-sm border border-ink-700 bg-ink-900/85">
          {shown.map((item) => (
            <li key={item.index}>
              <Link
                href={`/compendium/items/${item.index}`}
                className="group flex items-center gap-3 px-4 py-2.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={categoryArt(item.category)}
                  alt=""
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-sm border border-ink-600 object-cover"
                />
                <span className="flex-1 font-semibold text-parchment-100 transition group-hover:text-gold-400">
                  {item.name}
                  {item.rarity && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-amber-800">
                      {item.rarity}
                    </span>
                  )}
                </span>
                <span className="hidden text-xs text-parchment-500 sm:block">
                  {[item.sub, item.damage, item.ac && `AC ${item.ac}`, item.cost]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-4 py-6 text-sm text-parchment-500">{t("compendium.noResults")}</li>
          )}
        </ul>
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/compendium/items"
          params={{ q, cat: category }}
        />
      </main>
    </>
  );
}
