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
import { loadWornFor, wornSetFor } from "@/lib/armor";
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
import { GiveItemSection } from "@/components/campaign/GiveItemSection";
import { StoryBookSection } from "@/components/campaign/StoryBookSection";

/**
 * The jump bar's stops, in the order the page lays them out. Each label is
 * the section's own heading, so a renamed section renames its chip; `dm`
 * marks the half of the page only the person running the table is served.
 */
const SECTIONS = [
  { id: "party", key: "campaign.party.title", dm: false },
  { id: "quests", key: "campaign.quests.title", dm: false },
  { id: "treasury", key: "campaign.treasury.title", dm: false },
  { id: "journal", key: "campaign.journal.title", dm: false },
  { id: "maps", key: "campaign.maps.title", dm: false },
  { id: "changelog", key: "campaign.feed.title", dm: true },
  { id: "encounters", key: "campaign.encounters.title", dm: true },
  { id: "give-item", key: "campaign.giveItem.title", dm: true },
  { id: "story-book", key: "campaign.beats.title", dm: true },
] as const;

/**
 * A chip is the heading minus the "— only you see this" tail the DM-only
 * headings carry: a one-line strip has no room to say it four times, and the
 * sections it points at already say it themselves.
 */
const chipLabel = (heading: string) => heading.split("—")[0].trim();

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

  // A sheet at this table whose owner has no membership row means someone
  // left or was removed: kickMember keeps the characters on purpose, so the
  // party list can offer them a seat again. Worked out from the two lists
  // already in hand — the only thing missing is what those people are called,
  // and that lookup rides along in the batch below, for the DM alone.
  const memberIds = new Set(members.map((row) => row.member.userId));
  const formerIds = isDm
    ? [...new Set(campaignCharacters.map((c) => c.userId))].filter(
        (id) => !memberIds.has(id) && id !== campaign.dmUserId
      )
    : [];

  // Both depend on the batch above, so they go out together rather than one
  // after the other. The worn gear is one query for the whole party — the
  // party list shows numbers the equipped lines move, and asking per character
  // would turn a two-query section into a dozen.
  const [encounterRows, worn, formerUsers] = await Promise.all([
    encounterList.length
      ? db
          .select()
          .from(encounterMonsters)
          .where(inArray(encounterMonsters.encounterId, encounterList.map((e) => e.id)))
          .orderBy(asc(encounterMonsters.createdAt))
      : Promise.resolve([]),
    loadWornFor(campaignCharacters.map((c) => c.id)),
    formerIds.length
      ? db.select().from(users).where(inArray(users.id, formerIds)).orderBy(asc(users.username))
      : Promise.resolve([]),
  ]);
  const wornBonuses = new Map(
    campaignCharacters.map((c) => [c.id, wornSetFor(worn, c.id).bonuses] as const)
  );

  // The give-item panel does not render at a table with nobody to hand
  // anything to — the same gate it applies to itself, so the strip never
  // offers a chip that jumps nowhere.
  const canGiveItems = campaignCharacters.some((c) => c.approval === "approved");
  const chips = SECTIONS.filter(
    (s) => (isDm || !s.dm) && (s.id !== "give-item" || canGiveItems)
  );

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

        {/*
          Ten sections down one column is a long scroll to hunt through. The
          strip parks under the navbar — sticky at 0, a single ~53-61px row at
          every width since it folds into a hamburger below md — and carries
          the page's stops the same way the reference page's does.
        */}
        <nav
          aria-label={t("reference.sections")}
          className="sticky top-14 z-30 -mx-4 mb-6 overflow-x-auto border-y border-ink-600/70 bg-ink-900/90 px-4 py-2 backdrop-blur"
        >
          <ul className="flex gap-1.5 whitespace-nowrap">
            {chips.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-block rounded-sm border border-ink-600 px-3 py-1.5 text-xs font-semibold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300"
                >
                  {chipLabel(t(section.key))}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <LiveSessionBanner
          liveSession={liveSession}
          pastSessionCount={pastSessions.length}
          campaignId={campaignId}
          isDm={isDm}
          t={t}
        />

        <div className="grid gap-8 md:grid-cols-2">
          <section className="space-y-4">
            {/*
              These four render fragments, so the jump bar's anchor is a
              wrapper. It repeats the column's own `space-y-4` to keep the
              rhythm the flattened fragments had before it was here.
            */}
            <div id="party" className="scroll-mt-28 space-y-4">
              <PartySection
                members={members}
                campaignCharacters={campaignCharacters}
                formerUsers={formerUsers}
                wornBonuses={wornBonuses}
                campaignId={campaignId}
                dmUserId={campaign.dmUserId}
                currentUserId={user.id}
                isDm={isDm}
                t={t}
              />
            </div>
            <div id="quests" className="scroll-mt-28 space-y-4">
              <QuestsSection
                quests={quests}
                campaignId={campaignId}
                isDm={isDm}
                locale={locale}
                t={t}
              />
            </div>
            <InviteSection
              joinCode={campaign.joinCode}
              campaignId={campaignId}
              isDm={isDm}
              t={t}
            />
          </section>

          <section className="space-y-4">
            <div id="treasury" className="scroll-mt-28 space-y-4">
              <TreasurySection
                ledger={ledger}
                loot={loot}
                campaignId={campaignId}
                locale={locale}
                t={t}
              />
            </div>
            <div id="journal" className="scroll-mt-28 space-y-4">
              <JournalSection pastSessions={pastSessions} locale={locale} t={t} />
            </div>
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
          <GiveItemSection
            members={members}
            campaignCharacters={campaignCharacters}
            campaignId={campaignId}
            locale={locale}
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
