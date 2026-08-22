import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, worlds, worldMembers, campaigns, campaignMembers, gameSessions } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createWorld, logoutEverywhere } from "@/lib/actions";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { JoinCampaignForm } from "@/components/JoinCampaignForm";
import { AccountEmail } from "@/components/AccountEmail";
import {
  Button,
  Card,
  GhostButton,
  Input,
  Label,
  RoleBadge,
  SectionTitle,
  Textarea,
} from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("dashboard.metaTitle") };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getT();

  const [myWorlds, myCampaigns, liveSessions] = await Promise.all([
    db
      .select({ world: worlds, role: worldMembers.role })
      .from(worldMembers)
      .innerJoin(worlds, eq(worldMembers.worldId, worlds.id))
      .where(eq(worldMembers.userId, user.id)),
    db
      .select({ campaign: campaigns, world: worlds })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
      .innerJoin(worlds, eq(campaigns.worldId, worlds.id))
      .where(eq(campaignMembers.userId, user.id)),
    // A table that is playing right now is the one thing on this page worth
    // interrupting for, so it is fetched with the rest, not after it.
    db
      .select({ session: gameSessions })
      .from(gameSessions)
      .innerJoin(campaignMembers, eq(campaignMembers.campaignId, gameSessions.campaignId))
      .where(and(eq(campaignMembers.userId, user.id), eq(gameSessions.status, "live"))),
  ]);
  const liveByCampaign = new Map(liveSessions.map(({ session }) => [session.campaignId, session]));

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
            {myCampaigns.map(({ campaign, world }) => {
              const liveSession = liveByCampaign.get(campaign.id);
              const role = (
                <RoleBadge
                  role={campaign.dmUserId === user.id ? "DM" : "Player"}
                  label={
                    campaign.dmUserId === user.id
                      ? "DM"
                      : t("dashboard.campaigns.rolePlayer")
                  }
                />
              );
              const inWorld = (
                <p className="mt-1 text-sm text-parchment-500">
                  {t("dashboard.campaigns.inWorld", { world: world.name })}
                </p>
              );

              if (!liveSession) {
                return (
                  <Link key={campaign.id} href={`/c/${campaign.id}`} className="block">
                    <Card className="transition hover:border-gold-500">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-display text-lg text-parchment-100">
                          {campaign.name}
                        </h3>
                        {role}
                      </div>
                      {inWorld}
                    </Card>
                  </Link>
                );
              }

              // A table already playing wants one tap, not three: the card as a
              // whole leads to the session, and the campaign's own page keeps
              // the name on the heading. Two destinations, no nested links —
              // the pulse line's ::after is what makes the card clickable.
              //
              // That ::after is a sheet over the whole card, so anything
              // interactive put inside this card from here on needs
              // `relative z-10` to sit above it — the campaign-name link below
              // is the standing example. Without it the new control is
              // unreachable: every tap lands on the session link underneath.
              return (
                <Card
                  key={campaign.id}
                  className="relative border-emerald-700/60 transition hover:border-emerald-700 hover:shadow-md hover:shadow-[#5e4420]/20"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-lg text-parchment-100">
                      <Link
                        href={`/c/${campaign.id}`}
                        className="relative z-10 underline-offset-4 hover:underline hover:decoration-gold-500"
                      >
                        {campaign.name}
                      </Link>
                    </h3>
                    {role}
                  </div>
                  <Link
                    href={`/s/${liveSession.id}`}
                    className="mt-2 flex items-center gap-2 after:absolute after:inset-0"
                  >
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-600 opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
                    </span>
                    <span className="flex-1 text-sm font-bold text-emerald-900">
                      {t("campaign.live.banner", {
                        title: liveSession.title,
                        round: liveSession.round,
                      })}
                    </span>
                    <span aria-hidden className="font-display text-emerald-900">
                      →
                    </span>
                  </Link>
                  {inWorld}
                </Card>
              );
            })}

            <Card>
              <h3 className="mb-3 font-display text-base text-gold-300">
                {t("dashboard.campaigns.join")}
              </h3>
              <JoinCampaignForm locale={locale} />
            </Card>
          </section>
        </div>

        <section className="mt-10 max-w-xl space-y-4">
          <SectionTitle>{t("dashboard.account.heading")}</SectionTitle>
          <Card>
            <AccountEmail
              email={user.email}
              verified={user.emailVerifiedAt !== null}
              locale={locale}
            />
          </Card>
        </section>

        <form
          action={logoutEverywhere}
          className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-ink-600/70 pt-5"
        >
          <GhostButton type="submit">{t("dashboard.logoutEverywhere")}</GhostButton>
          <p className="text-sm text-parchment-500">{t("dashboard.logoutEverywhereHint")}</p>
        </form>
      </main>
    </>
  );
}
