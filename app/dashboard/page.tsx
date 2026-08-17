import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, worlds, worldMembers, campaigns, campaignMembers } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createWorld } from "@/lib/actions";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { JoinCampaignForm } from "@/components/JoinCampaignForm";
import { Button, Card, Input, Label, RoleBadge, SectionTitle, Textarea } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("dashboard.metaTitle") };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getT();

  const myWorlds = await db
    .select({ world: worlds, role: worldMembers.role })
    .from(worldMembers)
    .innerJoin(worlds, eq(worldMembers.worldId, worlds.id))
    .where(eq(worldMembers.userId, user.id));

  const myCampaigns = await db
    .select({ campaign: campaigns, world: worlds })
    .from(campaignMembers)
    .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
    .innerJoin(worlds, eq(campaigns.worldId, worlds.id))
    .where(eq(campaignMembers.userId, user.id));

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="mb-8 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("dashboard.welcome", { name: user.displayName ?? user.username })}
        </h1>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-4">
            <SectionTitle>{t("dashboard.worlds.heading")}</SectionTitle>
            {myWorlds.length === 0 && (
              <p className="text-sm text-parchment-500">{t("dashboard.worlds.empty")}</p>
            )}
            {myWorlds.map(({ world, role }) => (
              <Link key={world.id} href={`/w/${world.id}`} className="block">
                <Card className="transition hover:border-gold-500">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg text-parchment-100">{world.name}</h3>
                    {role === "owner" && (
                      <RoleBadge role="Owner" label={t("dashboard.roleOwner")} />
                    )}
                  </div>
                  {world.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-parchment-500">{world.description}</p>
                  )}
                </Card>
              </Link>
            ))}

            <Card>
              <h3 className="mb-3 font-display text-base text-gold-300">
                {t("dashboard.worlds.forge")}
              </h3>
              <form action={createWorld} className="space-y-3">
                <label className="block">
                  <Label>{t("dashboard.worlds.name")}</Label>
                  <Input name="name" required placeholder={t("dashboard.worlds.namePh")} />
                </label>
                <label className="block">
                  <Label>{t("dashboard.worlds.desc")}</Label>
                  <Textarea name="description" rows={2} placeholder={t("dashboard.worlds.descPh")} />
                </label>
                <Button type="submit">{t("dashboard.worlds.create")}</Button>
              </form>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionTitle>{t("dashboard.campaigns.heading")}</SectionTitle>
            {myCampaigns.length === 0 && (
              <p className="text-sm text-parchment-500">{t("dashboard.campaigns.empty")}</p>
            )}
            {myCampaigns.map(({ campaign, world }) => (
              <Link key={campaign.id} href={`/c/${campaign.id}`} className="block">
                <Card className="transition hover:border-gold-500">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg text-parchment-100">{campaign.name}</h3>
                    <RoleBadge
                      role={campaign.dmUserId === user.id ? "DM" : "Player"}
                      label={
                        campaign.dmUserId === user.id
                          ? "DM"
                          : t("dashboard.campaigns.rolePlayer")
                      }
                    />
                  </div>
                  <p className="mt-1 text-sm text-parchment-500">
                    {t("dashboard.campaigns.inWorld", { world: world.name })}
                  </p>
                </Card>
              </Link>
            ))}

            <Card>
              <h3 className="mb-3 font-display text-base text-gold-300">
                {t("dashboard.campaigns.join")}
              </h3>
              <JoinCampaignForm locale={locale} />
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}
