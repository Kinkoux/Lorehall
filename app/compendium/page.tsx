import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { MONSTERS, SPELLS } from "@/lib/srd-data";
import { SiteHeader } from "@/components/SiteHeader";
import { IconBook, IconClaw } from "@/components/Icons";
import { Card } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("compendium.title") };
}

export default async function CompendiumPage() {
  const user = await getCurrentUser();
  const { t } = await getT();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("compendium.title")}
        </h1>
        <p className="mt-1 mb-8 text-sm text-parchment-500">{t("compendium.subtitle")}</p>
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
        </div>
      </main>
    </>
  );
}
