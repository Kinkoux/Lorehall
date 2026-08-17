import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { CR_LABELS, getMonsterImage, searchMonsters } from "@/lib/srd-data";
import { SiteHeader } from "@/components/SiteHeader";
import { IconClaw } from "@/components/Icons";
import { Pagination } from "@/components/Pagination";
import { BackLink, Button, Input, Select } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("compendium.monsters.title") };
}

const LIMIT = 60;

export default async function MonstersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cr?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  const { t } = await getT();
  const { q = "", cr = "", page: pageRaw = "1" } = await searchParams;
  const results = searchMonsters(q, cr);
  const totalPages = Math.max(1, Math.ceil(results.length / LIMIT));
  const page = Math.min(Math.max(Number.parseInt(pageRaw, 10) || 1, 1), totalPages);
  const shown = results.slice((page - 1) * LIMIT, page * LIMIT);

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/compendium">{t("compendium.title")}</BackLink>
        <h1 className="mt-2 mb-6 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("compendium.monsters.title")}
        </h1>

        <form className="mb-6 flex flex-wrap gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder={t("compendium.searchByName")}
            className="!w-56"
          />
          <Select name="cr" defaultValue={cr} className="!w-32">
            <option value="">{t("compendium.monsters.anyCr")}</option>
            {CR_LABELS.map((label) => (
              <option key={label} value={label}>
                CR {label}
              </option>
            ))}
          </Select>
          <Button type="submit">{t("common.search")}</Button>
        </form>

        <p className="mb-4 text-xs text-parchment-500">
          {t("compendium.results", { n: results.length })}
        </p>

        <ul className="divide-y divide-ink-700 rounded-sm border border-ink-700 bg-ink-900/85">
          {shown.map((monster) => {
            const image = getMonsterImage(monster.index);
            return (
              <li key={monster.index}>
                <Link
                  href={`/compendium/monsters/${monster.index}`}
                  className="group flex items-center gap-3 px-4 py-2"
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image.img}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 shrink-0 rounded-sm border border-ink-600 object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-ink-600/60 bg-ink-950/50 text-parchment-500">
                      <IconClaw size={18} />
                    </span>
                  )}
                  <span className="w-14 shrink-0 text-xs font-bold text-blood-400">
                    CR {monster.crLabel}
                  </span>
                  <span className="flex-1 font-semibold text-parchment-100 transition group-hover:text-gold-400">
                    {monster.name}
                  </span>
                  <span className="hidden text-xs text-parchment-500 sm:block">
                    {monster.size} {monster.type} · AC {monster.ac} · {monster.hp} HP
                  </span>
                </Link>
              </li>
            );
          })}
          {shown.length === 0 && (
            <li className="px-4 py-6 text-sm text-parchment-500">{t("compendium.noResults")}</li>
          )}
        </ul>
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/compendium/monsters"
          params={{ q, cr }}
        />
      </main>
    </>
  );
}
