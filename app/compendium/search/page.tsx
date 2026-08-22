import type { ReactNode } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import {
  getMonsterArt,
  localizedItemName,
  localizedMonsterName,
  searchItems,
  searchMonsters,
  searchSpells,
  srdItemArt,
} from "@/lib/srd-data";
import { schoolArtThumb } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import { IconClaw } from "@/components/Icons";
import { BackLink, Button, Input, SectionTitle } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("compendium.search.title") };
}

/** How much of each collection the hub shows before handing off to its list. */
const PREVIEW = 10;

/** One result line, in the same language the three lists speak. */
function ResultRow({
  href,
  art,
  badge,
  name,
  original,
  meta,
}: {
  href: string;
  art: ReactNode;
  badge?: ReactNode;
  name: string;
  /** The SRD's own name, when `name` above it is a translation of it. */
  original?: string | null;
  meta: string;
}) {
  return (
    <li>
      <Link href={href as never} className="group flex items-center gap-3 px-4 py-2.5">
        {art}
        {badge && <span className="w-14 shrink-0 text-xs font-bold">{badge}</span>}
        <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-parchment-100 transition group-hover:text-gold-400">
            {name}
          </span>
          {original && original !== name && (
            <span className="text-xs text-parchment-500">{original}</span>
          )}
        </span>
        <span className="hidden text-xs text-parchment-500 sm:block">{meta}</span>
      </Link>
    </li>
  );
}

function Thumb({ src }: { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="h-10 w-10 shrink-0 rounded-sm border border-ink-600 object-cover"
    />
  );
}

/**
 * One collection's slice of the results: heading with its own count, the first
 * few rows, and — when there are more — a link into that collection's list
 * carrying the same query, where the full set lives with its own filters.
 */
function ResultGroup({
  heading,
  total,
  seeAllHref,
  seeAllLabel,
  children,
}: {
  heading: string;
  total: number;
  seeAllHref: string;
  seeAllLabel: string;
  children: ReactNode;
}) {
  if (total === 0) return null;
  return (
    <section className="mb-8">
      <SectionTitle>
        {heading} · {total}
      </SectionTitle>
      <ul className="mt-3 divide-y divide-ink-700 rounded-sm border border-ink-700 bg-ink-900/85">
        {children}
      </ul>
      {total > PREVIEW && (
        <p className="mt-2 text-right">
          <Link
            href={seeAllHref as never}
            className="text-xs font-semibold text-parchment-500 underline underline-offset-2 transition hover:text-gold-300"
          >
            {seeAllLabel}
          </Link>
        </p>
      )}
    </section>
  );
}

export default async function CompendiumSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  const { t, locale } = await getT();
  const { q = "" } = await searchParams;
  const needle = q.trim();

  // One box, three collections: each list's own name search, run together.
  const spells = needle ? searchSpells(needle, "", "") : [];
  const monsters = needle ? searchMonsters(needle, "") : [];
  const items = needle ? searchItems(needle, "") : [];
  const total = spells.length + monsters.length + items.length;
  const forQuery = `?q=${encodeURIComponent(needle)}`;

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/compendium">{t("compendium.title")}</BackLink>
        <h1 className="mt-2 mb-6 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("compendium.search.title")}
        </h1>

        <form className="mb-6 flex flex-wrap gap-2">
          <Input
            name="q"
            defaultValue={q}
            aria-label={t("compendium.search.label")}
            placeholder={t("compendium.search.placeholder")}
            className="!w-72 max-w-full"
          />
          <Button type="submit">{t("common.search")}</Button>
        </form>

        {!needle ? (
          <p className="text-sm text-parchment-500">{t("compendium.search.prompt")}</p>
        ) : total === 0 ? (
          <p className="text-sm text-parchment-500">
            {t("compendium.search.empty", { q: needle })}
          </p>
        ) : (
          <>
            <p className="mb-6 text-sm text-parchment-500">
              {t("compendium.search.heading", { q: needle })} ·{" "}
              {t("compendium.results", { n: total })}
            </p>

            <ResultGroup
              heading={t("compendium.spells.title")}
              total={spells.length}
              seeAllHref={`/compendium/spells${forQuery}`}
              seeAllLabel={t("compendium.search.seeAll", { n: spells.length })}
            >
              {/* `Thumb` draws 40px, so the school sigil comes in its 96px cut
                  — the same one the spell list takes, for the same reason. */}
              {spells.slice(0, PREVIEW).map((spell) => (
                <ResultRow
                  key={spell.index}
                  href={`/compendium/spells/${spell.index}`}
                  art={<Thumb src={schoolArtThumb(spell.school)} />}
                  badge={
                    <span className="text-gold-300">
                      {spell.level === 0 ? t("compendium.spells.cantrip") : spell.level}
                    </span>
                  }
                  name={spell.name}
                  meta={`${spell.school} · ${spell.classes.join(", ")}`}
                />
              ))}
            </ResultGroup>

            <ResultGroup
              heading={t("compendium.monsters.title")}
              total={monsters.length}
              seeAllHref={`/compendium/monsters${forQuery}`}
              seeAllLabel={t("compendium.search.seeAll", { n: monsters.length })}
            >
              {monsters.slice(0, PREVIEW).map((monster) => {
                const image = getMonsterArt(monster.index);
                return (
                  <ResultRow
                    key={monster.index}
                    href={`/compendium/monsters/${monster.index}`}
                    art={
                      image ? (
                        <Thumb src={image.thumb} />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-ink-600/60 bg-ink-950/50 text-parchment-500">
                          <IconClaw size={18} />
                        </span>
                      )
                    }
                    badge={<span className="text-blood-400">CR {monster.crLabel}</span>}
                    name={localizedMonsterName(monster, locale)}
                    original={monster.name}
                    meta={`${monster.size} ${monster.type} · ${monster.hp} HP`}
                  />
                );
              })}
            </ResultGroup>

            <ResultGroup
              heading={t("compendium.items.title")}
              total={items.length}
              seeAllHref={`/compendium/items${forQuery}`}
              seeAllLabel={t("compendium.search.seeAll", { n: items.length })}
            >
              {items.slice(0, PREVIEW).map((item) => (
                <ResultRow
                  key={item.index}
                  href={`/compendium/items/${item.index}`}
                  art={<Thumb src={srdItemArt(item).thumb} />}
                  name={localizedItemName(item, locale)}
                  original={item.name}
                  meta={[item.sub, item.rarity, item.cost].filter(Boolean).join(" · ")}
                />
              ))}
            </ResultGroup>
          </>
        )}
      </main>
    </>
  );
}
