import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { db, campaigns, worldItems, worldMembers, worlds } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { ITEMS, MONSTERS, SPELLS } from "@/lib/srd-data";
import { SiteHeader } from "@/components/SiteHeader";
import { IconBook, IconChest, IconClaw } from "@/components/Icons";
import { Button, Card, Input, SectionTitle } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("compendium.title") };
}

/**
 * The worlds this reader belongs to, each with the number of library items
 * they are actually allowed to see. Three queries, none of them dependent on
 * another: the worlds, the campaigns this reader runs (which is what "DM
 * powers" means outside of owning the place), and one grouped count over the
 * libraries membership already grants — so a hidden item is counted only for
 * the DM it is hidden for.
 */
async function myWorldLibraries(userId: string) {
  const [memberships, dmCampaigns, tallies] = await Promise.all([
    db
      .select({ world: worlds })
      .from(worldMembers)
      .innerJoin(worlds, eq(worldMembers.worldId, worlds.id))
      .where(eq(worldMembers.userId, userId)),
    db
      .selectDistinct({ worldId: campaigns.worldId })
      .from(campaigns)
      .where(eq(campaigns.dmUserId, userId)),
    db
      .select({
        worldId: worldItems.worldId,
        visibility: worldItems.visibility,
        n: count(),
      })
      .from(worldItems)
      .innerJoin(
        worldMembers,
        and(eq(worldMembers.worldId, worldItems.worldId), eq(worldMembers.userId, userId))
      )
      .groupBy(worldItems.worldId, worldItems.visibility),
  ]);

  const dmWorlds = new Set(dmCampaigns.map((row) => row.worldId));
  return memberships
    .map(({ world }) => {
      const dmPowers = world.ownerId === userId || dmWorlds.has(world.id);
      const visible = tallies
        .filter(
          (row) => row.worldId === world.id && (dmPowers || row.visibility === "everyone")
        )
        .reduce((sum, row) => sum + row.n, 0);
      return { world, visible };
    })
    .sort((a, b) => a.world.name.localeCompare(b.world.name));
}

export default async function CompendiumPage() {
  const user = await getCurrentUser();
  const { t } = await getT();
  // Signed out there is no library but the SRD's, and no query to pay for.
  const myWorlds = user ? await myWorldLibraries(user.id) : [];
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("compendium.title")}
        </h1>
        <p className="mt-1 mb-4 text-sm text-parchment-500">{t("compendium.subtitle")}</p>

        {/* One box across all three collections, for when you know the name but
            not which shelf it sits on. */}
        <form action="/compendium/search" className="mb-8 flex flex-wrap gap-2">
          <Input
            name="q"
            aria-label={t("compendium.search.label")}
            placeholder={t("compendium.search.placeholder")}
            className="!w-72 max-w-full"
          />
          <Button type="submit">{t("common.search")}</Button>
        </form>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/compendium/spells" className="block">
            <Card className="transition hover:border-gold-500">
              <IconBook size={30} className="text-blood-400" />
              <h2 className="mt-3 font-display text-xl font-bold text-parchment-100">
                {t("compendium.spells.title")}
              </h2>
              <p className="mt-1 text-sm text-parchment-500">
                {t("compendium.spells.cardBody", { n: SPELLS.length })}
              </p>
            </Card>
          </Link>
          <Link href="/compendium/monsters" className="block">
            <Card className="transition hover:border-gold-500">
              <IconClaw size={30} className="text-blood-400" />
              <h2 className="mt-3 font-display text-xl font-bold text-parchment-100">
                {t("compendium.monsters.title")}
              </h2>
              <p className="mt-1 text-sm text-parchment-500">
                {t("compendium.monsters.cardBody", { n: MONSTERS.length })}
              </p>
            </Card>
          </Link>
          <Link href="/compendium/items" className="block">
            <Card className="transition hover:border-gold-500">
              <IconChest size={30} className="text-blood-400" />
              <h2 className="mt-3 font-display text-xl font-bold text-parchment-100">
                {t("compendium.items.title")}
              </h2>
              <p className="mt-1 text-sm text-parchment-500">
                {t("compendium.items.cardBody", { n: ITEMS.length })}
              </p>
            </Card>
          </Link>
        </div>

        {myWorlds.length > 0 && (
          <section className="mt-10 space-y-4">
            <SectionTitle>{t("compendium.worlds.heading")}</SectionTitle>
            <p className="-mt-2 text-xs text-parchment-500">{t("compendium.worlds.hint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {myWorlds.map(({ world, visible }) => (
                <Link key={world.id} href={`/compendium/worlds/${world.id}`} className="block">
                  <Card className="transition hover:border-gold-500">
                    <h3 className="font-display text-lg text-parchment-100">{world.name}</h3>
                    <p className="mt-1 text-sm text-parchment-500">
                      {t("compendium.worlds.itemCount", { n: visible })}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
