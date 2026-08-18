import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  campaignEvents,
  campaignMaps,
  campaignMembers,
  characters,
  gameSessions,
  quests as questsTable,
  partyLedger,
  partyItems,
  encounters as encountersTable,
  encounterMonsters,
  users,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getBeats, getChapters } from "@/lib/queries";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { BackLink, RoleBadge } from "@/components/ui";
import { LiveSessionBanner } from "@/components/campaign/LiveSessionBanner";
import { PartySection } from "@/components/campaign/PartySection";
import { QuestsSection } from "@/components/campaign/QuestsSection";
import { InviteSection } from "@/components/campaign/InviteSection";
import { TreasurySection } from "@/components/campaign/TreasurySection";
import { JournalSection } from "@/components/campaign/JournalSection";
import { MapsSection } from "@/components/campaign/MapsSection";
import { ChangeFeedSection, FEED_FILTERS } from "@/components/campaign/ChangeFeedSection";
import { EncountersSection } from "@/components/campaign/EncountersSection";
import { StoryBookSection } from "@/components/campaign/StoryBookSection";

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ feed?: string }>;
}) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const { campaignId } = await params;
  const { feed } = await searchParams;

  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canView) notFound();
  const { campaign, world, isDm } = access;

  // ?feed=gold|items|sheets|characters narrows the DM's change log; anything
  // else falls back to the unfiltered feed.
  const activeFeed = feed && FEED_FILTERS[feed] ? feed : null;
  const feedWhere = activeFeed
    ? and(
        eq(campaignEvents.campaignId, campaignId),
        inArray(campaignEvents.kind, FEED_FILTERS[activeFeed])
      )
    : eq(campaignEvents.campaignId, campaignId);

  // Independent reads — one concurrent batch instead of nine roundtrips.
  const [
    members,
    campaignCharacters,
    sessions,
    quests,
    ledger,
    loot,
    encounterList,
    beats,
    chapters,
    mapsList,
    feedEvents,
  ] = await Promise.all([
    db
      .select({ member: campaignMembers, user: users })
      .from(campaignMembers)
      .innerJoin(users, eq(campaignMembers.userId, users.id))
      .where(eq(campaignMembers.campaignId, campaignId)),
    db.select().from(characters).where(eq(characters.campaignId, campaignId)),
    db
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.campaignId, campaignId))
      .orderBy(desc(gameSessions.startedAt)),
    db
      .select()
      .from(questsTable)
      .where(eq(questsTable.campaignId, campaignId))
      .orderBy(asc(questsTable.createdAt)),
    db
      .select({ entry: partyLedger, user: users })
      .from(partyLedger)
      .leftJoin(users, eq(partyLedger.userId, users.id))
      .where(eq(partyLedger.campaignId, campaignId))
      .orderBy(desc(partyLedger.createdAt)),
    db
      .select()
      .from(partyItems)
      .where(eq(partyItems.campaignId, campaignId))
      .orderBy(asc(partyItems.createdAt)),
    isDm
      ? db
          .select()
          .from(encountersTable)
          .where(eq(encountersTable.campaignId, campaignId))
          .orderBy(asc(encountersTable.createdAt))
      : Promise.resolve([]),
    isDm ? getBeats(campaignId) : Promise.resolve([]),
    isDm ? getChapters(campaignId) : Promise.resolve([]),
    db
      .select()
      .from(campaignMaps)
      .where(eq(campaignMaps.campaignId, campaignId))
      .orderBy(asc(campaignMaps.createdAt)),
    // The change log is the DM's alone — and append-only, so 50 is the whole
    // read path: no delete UI, no pagination, just the recent tail.
    isDm
      ? db
          .select({ event: campaignEvents, user: users })
          .from(campaignEvents)
          .leftJoin(users, eq(campaignEvents.actorId, users.id))
          .where(feedWhere)
          .orderBy(desc(campaignEvents.createdAt))
          .limit(50)
      : Promise.resolve([]),
  ]);

  const liveSession = sessions.find((s) => s.status === "live");
  const pastSessions = sessions.filter((s) => s.status === "ended");

  const encounterRows = encounterList.length
    ? await db
        .select()
        .from(encounterMonsters)
        .where(inArray(encounterMonsters.encounterId, encounterList.map((e) => e.id)))
        .orderBy(asc(encounterMonsters.createdAt))
    : [];

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <BackLink href={`/w/${world.id}`}>{world.name}</BackLink>

        <div className="mt-2 mb-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
            {campaign.name}
          </h1>
          <RoleBadge role={isDm ? "DM" : "Player"} label={isDm ? "DM" : t("campaign.rolePlayer")} />
        </div>
        {campaign.description && <p className="mb-6 text-parchment-500">{campaign.description}</p>}

        <LiveSessionBanner
          liveSession={liveSession}
          pastSessionCount={pastSessions.length}
          campaignId={campaignId}
          isDm={isDm}
          t={t}
        />

        <div className="grid gap-8 md:grid-cols-2">
          <section className="space-y-4">
            <PartySection
              members={members}
              campaignCharacters={campaignCharacters}
              campaignId={campaignId}
              dmUserId={campaign.dmUserId}
              currentUserId={user.id}
              isDm={isDm}
              t={t}
            />
            <QuestsSection
              quests={quests}
              campaignId={campaignId}
              isDm={isDm}
              locale={locale}
              t={t}
            />
            <InviteSection
              joinCode={campaign.joinCode}
              campaignId={campaignId}
              isDm={isDm}
              t={t}
            />
          </section>

          <section className="space-y-4">
            <TreasurySection
              ledger={ledger}
              loot={loot}
              campaignId={campaignId}
              locale={locale}
              t={t}
            />
            <JournalSection pastSessions={pastSessions} locale={locale} t={t} />
          </section>
        </div>

        <MapsSection
          maps={mapsList}
          campaignId={campaignId}
          isDm={isDm}
          locale={locale}
          t={t}
        />

        {isDm && (
          <ChangeFeedSection
            feedEvents={feedEvents}
            activeFeed={activeFeed}
            campaignId={campaignId}
            locale={locale}
            t={t}
          />
        )}

        {isDm && (
          <EncountersSection
            encounters={encounterList}
            encounterRows={encounterRows}
            campaignId={campaignId}
            t={t}
          />
        )}

        {isDm && (
          <StoryBookSection
            beats={beats}
            chapters={chapters}
            campaignId={campaignId}
            t={t}
          />
        )}
      </main>
    </>
  );
}
