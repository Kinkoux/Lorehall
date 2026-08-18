import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
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
import { startSession } from "@/lib/session-actions";
import { addBeat, deleteBeat, getBeats, setBeatStatus } from "@/lib/beat-actions";
import {
  addLedgerEntry,
  addPartyItem,
  addQuest,
  adjustPartyItemQty,
  deleteQuest,
  setQuestStatus,
} from "@/lib/quest-actions";
import {
  addCustomMonsterToEncounter,
  createEncounter,
  deleteEncounter,
  removeEncounterMonster,
} from "@/lib/compendium-actions";
import { deleteMap, setActiveMap, setMapVisibility } from "@/lib/map-actions";
import { approveCharacter, rejectCharacter } from "@/lib/character-actions";
import { hasScores, statBlock } from "@/lib/dnd";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { MapUploadForm } from "@/components/MapUploadForm";
import { IconDie, IconScroll, IconSkull, IconSwords, IconX } from "@/components/Icons";
import {
  BackLink,
  Button,
  Card,
  DmBadge,
  Input,
  Label,
  QuestStatusBadge,
  RoleBadge,
  SectionTitle,
  Textarea,
} from "@/components/ui";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const { campaignId } = await params;

  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canView) notFound();
  const { campaign, world, isDm } = access;

  // Independent reads — one concurrent batch instead of nine roundtrips.
  const [members, campaignCharacters, sessions, quests, ledger, loot, encounterList, beats, mapsList] =
    await Promise.all([
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
      db
        .select()
        .from(campaignMaps)
        .where(eq(campaignMaps.campaignId, campaignId))
        .orderBy(asc(campaignMaps.createdAt)),
    ]);

  // Approved characters show to everyone; pending ones only to the DM
  // (who approves) and their owner.
  const charactersOf = (userId: string) =>
    campaignCharacters.filter(
      (c) =>
        c.userId === userId && (c.approval === "approved" || isDm || userId === user.id)
    );
  const liveSession = sessions.find((s) => s.status === "live");
  const pastSessions = sessions.filter((s) => s.status === "ended");
  const activeQuests = quests.filter((q) => q.status === "active");
  const closedQuests = quests.filter((q) => q.status !== "active");
  const gold = ledger.reduce((sum, { entry }) => sum + entry.amount, 0);
  const visibleMaps = isDm ? mapsList : mapsList.filter((m) => m.visibility === "everyone");

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

        {liveSession ? (
          <Link href={`/s/${liveSession.id}`} className="block">
            <Card className="mb-8 border-emerald-700/60 bg-emerald-100/60 transition hover:-translate-y-0.5 hover:border-emerald-700 hover:shadow-md hover:shadow-[#5e4420]/20">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-600 opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-600" />
                </span>
                <div className="flex-1">
                  <p className="font-display text-lg font-bold text-emerald-900">
                    {t("campaign.live.banner", {
                      title: liveSession.title,
                      round: liveSession.round,
                    })}
                  </p>
                  <p className="text-sm text-emerald-900/70">{t("campaign.live.tap")}</p>
                </div>
                <span className="font-display text-emerald-900">→</span>
              </div>
            </Card>
          </Link>
        ) : (
          isDm && (
            <Card className="mb-8">
              <h3 className="mb-3 font-display text-base text-gold-300">
                {t("campaign.start.heading")}
              </h3>
              <form action={startSession.bind(null, campaignId)} className="flex gap-2">
                <Input
                  name="title"
                  placeholder={t("campaign.start.placeholder", { n: pastSessions.length + 1 })}
                />
                <Button type="submit" className="shrink-0">
                  <IconSwords size={16} /> {t("campaign.start.button")}
                </Button>
              </form>
            </Card>
          )
        )}

        <div className="grid gap-8 md:grid-cols-2">
          <section className="space-y-4">
            <SectionTitle>{t("campaign.party.title")}</SectionTitle>
            <Card>
              <ul className="space-y-3">
                {members.map(({ member, user: memberUser }) => {
                  const memberCharacters = charactersOf(memberUser.id);
                  const memberLabel = (
                    <p className="text-xs text-parchment-500">
                      {memberUser.displayName ?? memberUser.username}
                      {memberUser.id === campaign.dmUserId && ` · ${t("campaign.party.dm")}`}
                    </p>
                  );
                  if (memberCharacters.length === 0) {
                    return (
                      <li key={memberUser.id}>
                        <Link
                          href={`/c/${campaignId}/ch/${memberUser.id}`}
                          className="group flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold text-parchment-100 transition group-hover:text-gold-400">
                              {member.characterName ?? t("campaign.party.unnamed")}
                            </p>
                            {memberLabel}
                          </div>
                          <span className="text-parchment-500 transition group-hover:text-gold-400">
                            →
                          </span>
                        </Link>
                      </li>
                    );
                  }
                  return (
                    <li key={memberUser.id} className="space-y-1.5">
                      {memberCharacters.map((character, ci) => {
                        const pp = hasScores(character)
                          ? statBlock(character).passivePerception
                          : null;
                        return (
                          <div key={character.id} className="flex items-center justify-between gap-3">
                            <Link
                              href={`/c/${campaignId}/ch/${memberUser.id}?ch=${character.id}`}
                              className="group min-w-0 flex-1"
                            >
                              <p className="font-semibold text-parchment-100 transition group-hover:text-gold-400">
                                {character.name}
                                <span className="ml-2 text-xs text-parchment-500">
                                  {t("campaign.party.lv", { n: character.level })}
                                </span>
                                {character.status === "dead" && (
                                  <span className="ml-2 inline-flex items-center gap-1 rounded-sm border border-blood-500 bg-blood-500/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-blood-400">
                                    <IconSkull size={11} />
                                    {t("campaign.party.dead")}
                                  </span>
                                )}
                                {character.approval === "pending" && (
                                  <span className="ml-2 rounded-sm border border-gold-500 bg-gold-500/10 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-gold-300">
                                    {t("campaign.party.pending")}
                                  </span>
                                )}
                              </p>
                              {ci === 0 && memberLabel}
                            </Link>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {character.approval === "pending" && isDm ? (
                                <>
                                  <form action={approveCharacter.bind(null, character.id)}>
                                    <SmallButton label={t("campaign.party.approve")} tone="success" />
                                  </form>
                                  <form action={rejectCharacter.bind(null, character.id)}>
                                    <SmallButton label={t("campaign.party.reject")} danger />
                                  </form>
                                </>
                              ) : (
                                pp !== null && (
                                  <span
                                    title={t("campaign.party.passivePerception")}
                                    className="rounded border border-gold-500/60 bg-gold-500/10 px-1.5 py-0.5 text-xs font-bold text-gold-300"
                                  >
                                    {t("campaign.party.pp", { n: pp })}
                                  </span>
                                )
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 border-t border-ink-700 pt-3 text-xs text-parchment-500">
                {t("campaign.party.hint")}
              </p>
            </Card>

            <SectionTitle>{t("campaign.quests.title")}</SectionTitle>
            {activeQuests.length === 0 && closedQuests.length === 0 && (
              <p className="text-sm text-parchment-500">
                {isDm ? t("campaign.quests.emptyDm") : t("campaign.quests.empty")}
              </p>
            )}
            {activeQuests.map((quest) => (
              <Card key={quest.id} className="border-l-2 !border-l-gold-500 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 font-display text-base font-bold text-parchment-100">
                      <IconScroll size={15} className="shrink-0 text-gold-400" />
                      <span className="min-w-0">{quest.title}</span>
                      <QuestStatusBadge status="active" label={t("campaign.quests.stActive")} />
                    </h3>
                    {quest.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-parchment-300">
                        {quest.description}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-parchment-500">
                      {new Date(quest.createdAt).toLocaleDateString(
                        locale === "tr" ? "tr-TR" : "en-GB"
                      )}
                    </p>
                  </div>
                  {isDm && (
                    <span className="flex shrink-0 gap-1">
                      <form action={setQuestStatus.bind(null, quest.id, "done")}>
                        <SmallButton label={t("campaign.quests.done")} tone="success" />
                      </form>
                      <form action={setQuestStatus.bind(null, quest.id, "failed")}>
                        <SmallButton label={t("campaign.quests.failed")} danger />
                      </form>
                      <form action={deleteQuest.bind(null, quest.id)}>
                        <SmallButton
                          label={<IconX size={12} />}
                          danger
                          ariaLabel={t("campaign.quests.delete")}
                        />
                      </form>
                    </span>
                  )}
                </div>
              </Card>
            ))}
            {closedQuests.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-parchment-500 hover:text-gold-300">
                  {closedQuests.length > 1
                    ? t("campaign.quests.closedMany", { n: closedQuests.length })
                    : t("campaign.quests.closedOne", { n: closedQuests.length })}
                </summary>
                <div className="mt-2 space-y-2">
                  {closedQuests.map((quest) => (
                    <Card key={quest.id} className="py-3 opacity-70">
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex min-w-0 items-center gap-2 text-sm">
                          <QuestStatusBadge
                            status={quest.status === "done" ? "done" : "failed"}
                            label={
                              quest.status === "done"
                                ? t("campaign.quests.stDone")
                                : t("campaign.quests.stFailed")
                            }
                          />
                          <span
                            className={
                              quest.status === "done"
                                ? "text-parchment-300"
                                : "text-parchment-500 line-through"
                            }
                          >
                            {quest.title}
                          </span>
                        </p>
                        {isDm && (
                          <form action={setQuestStatus.bind(null, quest.id, "active")}>
                            <SmallButton label={t("campaign.quests.reopen")} />
                          </form>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </details>
            )}
            {isDm && (
              <Card>
                <h3 className="mb-3 font-display text-base text-gold-300">
                  {t("campaign.quests.addHeading")}
                </h3>
                <form action={addQuest.bind(null, campaignId)} className="space-y-2">
                  <Input name="title" required placeholder={t("campaign.quests.titlePh")} />
                  <Textarea
                    name="description"
                    rows={2}
                    placeholder={t("campaign.quests.descPh")}
                  />
                  <Button type="submit">{t("campaign.quests.add")}</Button>
                </form>
              </Card>
            )}

            <SectionTitle>{t("campaign.invite.title")}</SectionTitle>
            <Card>
              <Label>{t("campaign.invite.code")}</Label>
              <p className="font-mono text-3xl font-bold tracking-[0.3em] text-gold-400">
                {campaign.joinCode}
              </p>
              <p className="mt-2 text-xs text-parchment-500">{t("campaign.invite.hint")}</p>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionTitle>{t("campaign.treasury.title")}</SectionTitle>
            <Card>
              <p className="font-display text-3xl font-bold text-gold-400">
                {t("campaign.treasury.gold", {
                  n: gold.toLocaleString(locale === "tr" ? "tr-TR" : "en-US"),
                })}
              </p>
              <form
                action={addLedgerEntry.bind(null, campaignId)}
                className="mt-3 flex flex-wrap gap-2"
              >
                <Input
                  name="amount"
                  type="number"
                  required
                  placeholder="+50 / -5"
                  className="!w-24"
                />
                <Input name="reason" required placeholder={t("campaign.treasury.reasonPh")} />
                <Button type="submit" className="shrink-0">
                  {t("campaign.treasury.log")}
                </Button>
              </form>
              {ledger.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-ink-700 pt-3">
                  {ledger.slice(0, 6).map(({ entry, user: actor }) => (
                    <li key={entry.id} className="flex justify-between gap-3 text-sm">
                      <span className="text-parchment-300">
                        {entry.reason}
                        <span className="ml-1 text-[11px] text-parchment-500">
                          {actor ? `· ${actor.displayName ?? actor.username}` : ""}
                        </span>
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          entry.amount >= 0 ? "text-emerald-700" : "text-blood-400"
                        }`}
                      >
                        {entry.amount >= 0 ? `+${entry.amount}` : entry.amount}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 border-t border-ink-700 pt-3">
                <Label>{t("campaign.treasury.loot")}</Label>
                {loot.length === 0 && (
                  <p className="mt-1 text-sm text-parchment-500">
                    {t("campaign.treasury.nothing")}
                  </p>
                )}
                <ul className="mt-1 space-y-1.5">
                  {loot.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-parchment-100">
                        {item.name}
                        {item.qty > 1 && (
                          <span className="ml-1 text-parchment-500">×{item.qty}</span>
                        )}
                        {item.notes && (
                          <span className="ml-1 text-xs text-parchment-500">— {item.notes}</span>
                        )}
                      </span>
                      <form action={adjustPartyItemQty.bind(null, item.id, -1)}>
                        <SmallButton label="−" />
                      </form>
                      <form action={adjustPartyItemQty.bind(null, item.id, 1)}>
                        <SmallButton label="+" />
                      </form>
                    </li>
                  ))}
                </ul>
                <form
                  action={addPartyItem.bind(null, campaignId)}
                  className="mt-2 flex gap-2"
                >
                  <Input name="name" required placeholder={t("campaign.treasury.itemPh")} />
                  <Input name="qty" type="number" min={1} defaultValue={1} className="!w-16" />
                  <Button type="submit" className="shrink-0">
                    {t("common.add")}
                  </Button>
                </form>
              </div>
            </Card>

            <SectionTitle>{t("campaign.journal.title")}</SectionTitle>
            {pastSessions.length === 0 && (
              <p className="text-sm text-parchment-500">{t("campaign.journal.empty")}</p>
            )}
            {pastSessions.map((session) => (
              <Link key={session.id} href={`/s/${session.id}`} className="block">
                <Card className="py-4 transition hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-md hover:shadow-[#5e4420]/20">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-base text-parchment-100">{session.title}</h3>
                    <span className="text-xs text-parchment-500">
                      {new Date(session.startedAt).toLocaleDateString(
                        locale === "tr" ? "tr-TR" : "en-GB"
                      )}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm text-parchment-500">
                    {session.recap ?? t("campaign.journal.noRecap")}
                  </p>
                </Card>
              </Link>
            ))}
          </section>
        </div>

        <section className="mt-10 space-y-4">
          <SectionTitle>{t("campaign.maps.title")}</SectionTitle>
          {isDm && <p className="-mt-2 text-xs text-parchment-500">{t("campaign.maps.hint")}</p>}
          {visibleMaps.length === 0 && (
            <p className="text-sm text-parchment-500">
              {isDm ? t("campaign.maps.emptyDm") : t("campaign.maps.empty")}
            </p>
          )}
          {visibleMaps.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleMaps.map((map) => (
                <Card key={map.id} className="!p-3">
                  <Link href={`/c/${campaignId}/m/${map.id}`} className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/files/maps/${map.id}`}
                      alt={map.title}
                      loading="lazy"
                      decoding="async"
                      className="h-40 w-full rounded-sm border border-ink-700 object-cover transition hover:opacity-90"
                    />
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/c/${campaignId}/m/${map.id}`}
                      className="min-w-0 flex-1 truncate font-display text-sm font-bold text-parchment-100 transition hover:text-gold-300"
                    >
                      {map.title}
                    </Link>
                    {map.isActive === 1 && (
                      <span className="rounded-sm border border-gold-500 bg-gold-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-300">
                        {t("campaign.maps.active")}
                      </span>
                    )}
                    {map.visibility === "dm" && <DmBadge label={t("campaign.maps.dmOnly")} />}
                  </div>
                  {isDm && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-ink-700 pt-2">
                      <form action={setActiveMap.bind(null, map.id, map.isActive !== 1)}>
                        <SmallButton
                          label={
                            map.isActive === 1
                              ? t("campaign.maps.clearActive")
                              : t("campaign.maps.setActive")
                          }
                        />
                      </form>
                      <form
                        action={setMapVisibility.bind(
                          null,
                          map.id,
                          map.visibility === "dm" ? "everyone" : "dm"
                        )}
                      >
                        <SmallButton
                          label={
                            map.visibility === "dm"
                              ? t("campaign.maps.reveal")
                              : t("campaign.maps.hide")
                          }
                        />
                      </form>
                      <form action={deleteMap.bind(null, map.id)}>
                        <SmallButton label={<IconX size={12} />} danger ariaLabel={t("common.delete")} />
                      </form>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          {isDm && (
            <Card>
              <h3 className="mb-3 font-display text-base text-gold-300">
                {t("campaign.maps.addHeading")}
              </h3>
              <MapUploadForm campaignId={campaignId} locale={locale} />
            </Card>
          )}
        </section>

        {isDm && (
          <section className="mt-10 space-y-4">
            <SectionTitle>{t("campaign.encounters.title")}</SectionTitle>
            <p className="-mt-2 text-xs text-parchment-500">
              {t("campaign.encounters.hintA")}{" "}
              <Link href="/compendium/monsters" className="text-gold-300 underline">
                {t("campaign.encounters.hintLink")}
              </Link>{" "}
              {t("campaign.encounters.hintB")}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {encounterList.map((encounter) => {
                const rows = encounterRows.filter((r) => r.encounterId === encounter.id);
                return (
                  <Card key={encounter.id}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-bold text-parchment-100">
                        {encounter.name}
                      </h3>
                      <form action={deleteEncounter.bind(null, encounter.id)}>
                        <SmallButton label={<IconX size={12} />} danger ariaLabel={t("common.delete")} />
                      </form>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {rows.length === 0 && (
                        <li className="text-sm text-parchment-500">
                          {t("campaign.encounters.empty")}
                        </li>
                      )}
                      {rows.map((row) => (
                        <li key={row.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 text-parchment-100">
                            {row.name}
                            {row.count > 1 && (
                              <span className="ml-1 text-parchment-500">×{row.count}</span>
                            )}
                            {row.srdIndex ? (
                              <Link
                                href={`/compendium/monsters/${row.srdIndex}`}
                                className="ml-1 text-xs text-gold-300 underline"
                              >
                                {t("campaign.encounters.stats")}
                              </Link>
                            ) : (
                              <span className="ml-1 text-[10px] uppercase text-purple-800">
                                {t("campaign.encounters.homebrew")}
                              </span>
                            )}
                          </span>
                          {row.maxHp !== null && (
                            <span className="font-mono text-xs text-parchment-500">
                              {t("campaign.encounters.hp", { n: row.maxHp })}
                            </span>
                          )}
                          <form action={removeEncounterMonster.bind(null, row.id)}>
                            <SmallButton label={<IconX size={12} />} danger ariaLabel={t("common.delete")} />
                          </form>
                        </li>
                      ))}
                    </ul>
                    <form
                      action={addCustomMonsterToEncounter.bind(null, encounter.id)}
                      className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-700 pt-3"
                    >
                      <Input name="name" required placeholder={t("campaign.encounters.monsterPh")} className="!w-36 !py-1" />
                      <Input name="count" type="number" min={1} max={20} defaultValue={1} title={t("campaign.encounters.countTitle")} className="!w-14 !py-1" />
                      <Input name="maxHp" type="number" min={1} placeholder="HP" className="!w-16 !py-1" />
                      <Input name="dexMod" type="number" min={-5} max={10} placeholder="DEX±" title={t("campaign.encounters.dexTitle")} className="!w-16 !py-1" />
                      <Button type="submit" className="!px-3 !py-1 text-xs">
                        {t("common.add")}
                      </Button>
                    </form>
                  </Card>
                );
              })}
            </div>
            <Card>
              <form action={createEncounter.bind(null, campaignId)} className="flex gap-2">
                <Input name="name" required placeholder={t("campaign.encounters.namePh")} />
                <Button type="submit" className="shrink-0">
                  {t("campaign.encounters.new")}
                </Button>
              </form>
            </Card>
          </section>
        )}

        {isDm && (
          <section className="mt-10 space-y-4">
            <SectionTitle>{t("campaign.beats.title")}</SectionTitle>
            <p className="-mt-2 text-xs text-parchment-500">{t("campaign.beats.hint")}</p>
            {beats.map((beat) => (
              <Card
                key={beat.id}
                className={`py-4 ${
                  beat.status === "current"
                    ? "border-gold-500 bg-ink-800"
                    : beat.status === "done"
                      ? "opacity-60"
                      : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 font-display text-lg font-bold text-gold-400">
                    {beat.status === "done" ? "✓" : beat.status === "current" ? "▶" : "•"}
                  </span>
                  <div className="flex-1">
                    <h3 className="font-display text-base font-bold text-parchment-100">
                      {beat.title}
                    </h3>
                    {beat.narrative && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-parchment-300">
                        {beat.narrative}
                      </p>
                    )}
                    {beat.rollNote && (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded border border-blood-500/50 bg-blood-500/10 px-2 py-0.5 text-xs font-bold text-blood-400">
                        <IconDie size={14} /> {beat.rollNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {beat.status !== "current" && (
                      <form action={setBeatStatus.bind(null, beat.id, "current")}>
                        <SmallButton label={t("campaign.beats.play")} />
                      </form>
                    )}
                    {beat.status !== "done" && (
                      <form action={setBeatStatus.bind(null, beat.id, "done")}>
                        <SmallButton label={t("campaign.beats.done")} />
                      </form>
                    )}
                    {beat.status === "done" && (
                      <form action={setBeatStatus.bind(null, beat.id, "pending")}>
                        <SmallButton label={t("campaign.beats.reset")} />
                      </form>
                    )}
                    <form action={deleteBeat.bind(null, beat.id)}>
                      <SmallButton label={<IconX size={12} />} danger ariaLabel={t("common.delete")} />
                    </form>
                  </div>
                </div>
              </Card>
            ))}

            <Card>
              <h3 className="mb-3 font-display text-base text-gold-300">
                {t("campaign.beats.addHeading")}
              </h3>
              <form action={addBeat.bind(null, campaignId)} className="space-y-3">
                <label className="block">
                  <Label>{t("campaign.beats.sceneTitle")}</Label>
                  <Input name="title" required placeholder={t("campaign.beats.scenePh")} />
                </label>
                <label className="block">
                  <Label>{t("campaign.beats.narration")}</Label>
                  <Textarea
                    name="narrative"
                    rows={3}
                    placeholder={t("campaign.beats.narrationPh")}
                  />
                </label>
                <label className="block">
                  <Label>{t("campaign.beats.rollNote")}</Label>
                  <Input name="rollNote" placeholder={t("campaign.beats.rollPh")} />
                </label>
                <Button type="submit">{t("campaign.beats.addButton")}</Button>
              </form>
            </Card>
          </section>
        )}
      </main>
    </>
  );
}

function SmallButton({
  label,
  danger = false,
  tone,
  ariaLabel,
}: {
  label: React.ReactNode;
  danger?: boolean;
  tone?: "success";
  ariaLabel?: string;
}) {
  const style = danger
    ? "border-ink-600 text-parchment-500 hover:border-blood-500 hover:text-blood-400"
    : tone === "success"
      ? "border-ink-600 text-parchment-300 hover:border-emerald-700 hover:text-emerald-800"
      : "border-ink-600 text-parchment-300 hover:border-gold-500 hover:text-gold-300";
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      className={`rounded border px-2 py-1 text-xs font-bold transition cursor-pointer ${style}`}
    >
      {label}
    </button>
  );
}
