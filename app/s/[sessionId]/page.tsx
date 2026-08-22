import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  campaignMaps,
  campaignMembers,
  characters,
  gameSessions,
  sessionEvents,
  users,
  type Combatant,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import {
  addTableNote,
  adjustHp,
  endCombat,
  endSession,
  joinInitiative,
  nextTurn,
  recordDeathSave,
  removeCombatant,
  saveRecap,
  setConditions,
  setMonsterHpVisibility,
  startCombat,
} from "@/lib/session-actions";
import { hpCondition } from "@/lib/dnd";
import { deployEncounter } from "@/lib/compendium-actions";
import { encounters as encountersTable } from "@/lib/db";
import { asc } from "drizzle-orm";
import { setBeatStatus } from "@/lib/beat-actions";
import { getBeats, getChapters, getTurnOrder } from "@/lib/queries";
import { chooseActiveMap } from "@/lib/map-actions";
import { getT } from "@/lib/locale";
import { renderEventMessage } from "@/lib/session-log";
import type { Locale, T } from "@/lib/i18n";
import { SiteHeader } from "@/components/SiteHeader";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DiceRoller } from "@/components/DiceRoller";
import { AddCombatantForm } from "@/components/AddCombatantForm";
import { MapViewer } from "@/components/MapViewer";
import { MapFold } from "@/components/session/MapFold";
import { PlayBar } from "@/components/session/PlayBar";
import { GiveItemSection } from "@/components/campaign/GiveItemSection";
import {
  IconBookmark,
  IconDie,
  IconMap,
  IconParty,
  IconQuill,
  IconScroll,
  IconSkull,
  IconSwords,
  IconX,
} from "@/components/Icons";
import { BackLink, Button, Card, DmBadge, GhostButton, Input, Label, Portrait, portraitSrc, SectionTitle, Select, Textarea } from "@/components/ui";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const { sessionId } = await params;

  const session = await db.query.gameSessions.findFirst({
    where: eq(gameSessions.id, sessionId),
  });
  if (!session) notFound();
  const access = await getCampaignAccess(session.campaignId, user.id);
  if (!access?.canView) notFound();

  const live = session.status === "live";
  const combatActive = live && session.combatActive === 1;
  // The AutoRefresh poll re-runs this render every 3s — keep it one batch.
  const [
    order,
    beats,
    chapters,
    encounters,
    mapsList,
    activeMap,
    events,
    myCharacters,
    portraitRows,
    giveItemRoster,
    members,
  ] = await Promise.all([
    getTurnOrder(sessionId),
    access.isDm ? getBeats(session.campaignId) : Promise.resolve([]),
    access.isDm ? getChapters(session.campaignId) : Promise.resolve([]),
    access.isDm
      ? db
          .select()
          .from(encountersTable)
          .where(eq(encountersTable.campaignId, session.campaignId))
          .orderBy(asc(encountersTable.createdAt))
      : Promise.resolve([]),
    access.isDm
      ? db
          .select()
          .from(campaignMaps)
          .where(eq(campaignMaps.campaignId, session.campaignId))
          .orderBy(asc(campaignMaps.createdAt))
      : Promise.resolve([]),
    db.query.campaignMaps.findFirst({
      where: and(
        eq(campaignMaps.campaignId, session.campaignId),
        eq(campaignMaps.isActive, 1)
      ),
    }),
    db
      .select({ event: sessionEvents, user: users })
      .from(sessionEvents)
      .leftJoin(users, eq(sessionEvents.userId, users.id))
      .where(eq(sessionEvents.sessionId, sessionId))
      .orderBy(desc(sessionEvents.createdAt))
      .limit(40),
    db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.campaignId, session.campaignId),
          eq(characters.userId, user.id),
          eq(characters.approval, "approved")
        )
      ),
    // Faces for the initiative list: two columns, because this is the one
    // character lookup every player's three-second poll pays for, and a whole
    // sheet drags twenty-six columns of backstory and notes behind each face.
    db
      .select({ id: characters.id, imageFile: characters.imageFile })
      .from(characters)
      .where(eq(characters.campaignId, session.campaignId)),
    // The roster the give-item panel hands things to — a DM-only panel on a
    // live table, so only that table asks for the wider rows, and only for the
    // four fields the picker actually reads.
    live && access.isDm
      ? db
          .select({
            id: characters.id,
            name: characters.name,
            userId: characters.userId,
            approval: characters.approval,
          })
          .from(characters)
          .where(eq(characters.campaignId, session.campaignId))
      : Promise.resolve([]),
    // Who is at this table, so the give-item picker can say whose hero is whose.
    access.isDm
      ? db
          .select({ member: campaignMembers, user: users })
          .from(campaignMembers)
          .innerJoin(users, eq(campaignMembers.userId, users.id))
          .where(eq(campaignMembers.campaignId, session.campaignId))
      : Promise.resolve([]),
  ]);
  const aliveCharacters = myCharacters.filter((c) => c.status === "alive");
  const portraits = new Map(portraitRows.map((c) => [c.id, c.imageFile]));
  const myCombatant = order.find((c) => c.userId === user.id);
  const iAmIn = myCombatant !== undefined;
  // The sheet behind the viewer's own row — the numbers they look up mid-turn.
  const mySheetHref =
    myCombatant?.characterId && myCombatant.userId
      ? `/c/${session.campaignId}/ch/${myCombatant.userId}?ch=${myCombatant.characterId}`
      : null;
  const shownMap =
    activeMap && (activeMap.visibility === "everyone" || access.isDm) ? activeMap : null;

  // The DM script reads like the story book: chapters first, unfiled beats last.
  const scriptGroups = [
    ...chapters.map((chapter) => ({
      chapter,
      beats: beats.filter((b) => b.chapterId === chapter.id),
    })),
    { chapter: null, beats: beats.filter((b) => !b.chapterId) },
  ].filter((group) => group.beats.length > 0);

  return (
    <>
      {live && <AutoRefresh intervalMs={3000} />}
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-3">
        {/* Round, turn and the way back to the three landmarks — pinned, so
            none of it depends on where the page is parked. */}
        <PlayBar
          title={session.title}
          live={live}
          combatActive={combatActive}
          round={session.round}
          turnIndex={session.turnIndex}
          order={order}
          isDm={access.isDm}
          sessionId={sessionId}
          mapHref={live && shownMap ? "#map" : null}
          sheetHref={mySheetHref}
          t={t}
        />

        <BackLink href={`/c/${session.campaignId}`}>{access.campaign.name}</BackLink>

        <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
            {session.title}
          </h1>
          {live ? (
            <span className="flex items-center gap-2 rounded-full border border-emerald-700/60 bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-900">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-600 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
              </span>
              {combatActive ? t("session.liveRound", { round: session.round }) : t("session.live")}
            </span>
          ) : (
            <span className="rounded-full border border-ink-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-parchment-500">
              {t("session.ended")}
            </span>
          )}
        </div>

        {live && shownMap && (
          <Card id="map" className="mb-8 scroll-mt-28">
            {/* The lid is the fold's own; the DM's map switcher stays outside
                it, so the poll that keeps the table in step is never held up
                by a panel that only shows a picture. */}
            <MapFold
              summary={
                <>
                  {/* The lid may well be shut when the play bar's map mark
                      drops the table here, so the row says what it is before
                      it says which one. */}
                  <h3 className="flex items-center gap-2 font-display text-base text-gold-300">
                    <IconMap size={16} /> {t("session.map.title")}
                  </h3>
                  <span className="text-sm text-parchment-300">{shownMap.title}</span>
                  {shownMap.visibility === "dm" && <DmBadge label={t("campaign.maps.dmOnly")} />}
                </>
              }
            >
              <MapViewer
                src={`/files/maps/${shownMap.id}`}
                alt={shownMap.title}
                className="h-[420px] w-full sm:h-[520px]"
                grid={
                  shownMap.gridSize
                    ? {
                        size: shownMap.gridSize,
                        offsetX: shownMap.gridOffsetX ?? 0,
                        offsetY: shownMap.gridOffsetY ?? 0,
                      }
                    : null
                }
                labels={{
                  zoomIn: t("campaign.maps.viewer.zoomIn"),
                  zoomOut: t("campaign.maps.viewer.zoomOut"),
                  reset: t("campaign.maps.viewer.reset"),
                  fullscreen: t("campaign.maps.viewer.fullscreen"),
                }}
              />
            </MapFold>
            {access.isDm && mapsList.length > 0 && (
              <form
                action={chooseActiveMap.bind(null, session.campaignId)}
                className="mt-4 flex items-end gap-2 border-t border-ink-700 pt-4"
              >
                <label className="block flex-1">
                  <Label>{t("session.map.switchLabel")}</Label>
                  <Select name="mapId" defaultValue={shownMap.id}>
                    <option value="">{t("session.map.none")}</option>
                    {mapsList.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                        {m.visibility === "dm" ? " · DM" : ""}
                      </option>
                    ))}
                  </Select>
                </label>
                <Button type="submit" className="min-h-11 shrink-0">
                  {t("session.map.set")}
                </Button>
              </form>
            )}
          </Card>
        )}

        {live && !shownMap && access.isDm && mapsList.length > 0 && (
          <Card className="mb-8">
            <h3 className="mb-3 flex items-center gap-2 font-display text-base text-gold-300">
              <IconMap size={16} /> {t("session.map.chooseTitle")}
            </h3>
            <form
              action={chooseActiveMap.bind(null, session.campaignId)}
              className="flex items-end gap-2"
            >
              <label className="block flex-1">
                <Label>{t("session.map.switchLabel")}</Label>
                <Select name="mapId" defaultValue="">
                  <option value="">{t("session.map.none")}</option>
                  {mapsList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                      {m.visibility === "dm" ? " · DM" : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <Button type="submit" className="min-h-11 shrink-0">
                {t("session.map.set")}
              </Button>
            </form>
          </Card>
        )}

        {!live && (
          <Card className="mb-8">
            <SectionTitle>{t("session.recap.title")}</SectionTitle>
            {access.isDm ? (
              <form action={saveRecap.bind(null, sessionId)} className="mt-3 space-y-3">
                <Textarea
                  name="recap"
                  rows={5}
                  defaultValue={session.recap ?? ""}
                  placeholder={t("session.recap.placeholder")}
                />
                <Button type="submit" className="min-h-11">{t("session.recap.save")}</Button>
              </form>
            ) : (
              <p className="mt-3 whitespace-pre-wrap leading-relaxed text-parchment-100">
                {session.recap ?? t("session.recap.empty")}
              </p>
            )}
          </Card>
        )}

        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <section className="space-y-4">
            {/* scroll-mt keeps the play bar off the heading it just jumped to. */}
            <div id="initiative" className="flex scroll-mt-28 flex-wrap items-center justify-between gap-3">
              <SectionTitle>{t("session.initiative.title")}</SectionTitle>
              {live && access.isDm && (
                <div className="flex shrink-0 items-center gap-2">
                  {/* The party hears what the ogre looks like, not what it has
                      left — unless this DM would rather they saw the number. */}
                  <form action={setMonsterHpVisibility.bind(null, sessionId)}>
                    <input
                      type="hidden"
                      name="show"
                      value={session.showMonsterHp === 1 ? "0" : "1"}
                    />
                    <button
                      type="submit"
                      title={t("session.monsterHp.toggleTitle")}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-ink-600 px-2 py-1 text-[11px] font-bold text-parchment-500 transition hover:border-gold-500 hover:text-gold-300 cursor-pointer"
                    >
                      {t("session.monsterHp.label")}:{" "}
                      <span
                        className={
                          session.showMonsterHp === 1 ? "text-gold-300" : "text-parchment-300"
                        }
                      >
                        {session.showMonsterHp === 1
                          ? t("session.monsterHp.shown")
                          : t("session.monsterHp.hidden")}
                      </span>
                    </button>
                  </form>
                  {combatActive ? (
                    <>
                      {order.length > 0 && (
                        <form action={nextTurn.bind(null, sessionId)}>
                          <Button type="submit" className="min-h-11">
                            {t("session.initiative.nextTurn")}
                          </Button>
                        </form>
                      )}
                      <form action={endCombat.bind(null, sessionId)}>
                        <GhostButton type="submit" className="min-h-11 !px-3 !py-1.5 text-xs">
                          {t("session.initiative.endCombat")}
                        </GhostButton>
                      </form>
                    </>
                  ) : (
                    order.length > 0 && (
                      <form action={startCombat.bind(null, sessionId)}>
                        <Button type="submit" className="min-h-11">
                          <IconSwords size={16} /> {t("session.initiative.startCombat")}
                        </Button>
                      </form>
                    )
                  )}
                </div>
              )}
            </div>

            {order.length === 0 && (
              <p className="text-sm text-parchment-500">
                {t("session.initiative.empty")}
              </p>
            )}
            {order.map((combatant, index) => (
              <CombatantRow
                key={combatant.id}
                combatant={combatant}
                isTurn={combatActive && index === session.turnIndex}
                isDm={access.isDm}
                isMe={combatant.userId === user.id}
                live={live}
                // A monster (no sheet behind it) keeps its numbers to itself
                // while the DM has the switch off. The DM always sees them.
                hideHp={
                  !access.isDm &&
                  combatant.characterId === null &&
                  session.showMonsterHp === 0
                }
                sessionId={sessionId}
                portrait={
                  combatant.characterId
                    ? portraitSrc(
                        combatant.characterId,
                        portraits.get(combatant.characterId) ?? null
                      )
                    : null
                }
                sheetHref={
                  combatant.characterId && combatant.userId
                    ? `/c/${session.campaignId}/ch/${combatant.userId}?ch=${combatant.characterId}`
                    : null
                }
                t={t}
              />
            ))}

            {live && !iAmIn && (
              <Card>
                <form action={joinInitiative.bind(null, sessionId)} className="flex flex-wrap items-end gap-2">
                  {aliveCharacters.length > 1 && (
                    <label className="block min-w-36 flex-1">
                      <Label>{t("session.initiative.joinAs")}</Label>
                      <Select name="characterId" defaultValue={aliveCharacters[0].id}>
                        {aliveCharacters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  <label className="block w-28">
                    <Label>{t("session.initiative.yourRoll")}</Label>
                    <Input
                      name="initiative"
                      type="number"
                      min={-10}
                      max={50}
                      placeholder="d20"
                      className="min-h-11"
                    />
                  </label>
                  <Button type="submit" className="min-h-11 min-w-32 flex-1">
                    {t("session.initiative.join")}
                  </Button>
                </form>
                <p className="mt-2 text-xs text-parchment-500">
                  {t("session.initiative.joinHint")}
                </p>
              </Card>
            )}

            {live && access.isDm && (
              <Card>
                <h3 className="mb-3 font-display text-base text-gold-300">{t("session.add.title")}</h3>
                <AddCombatantForm sessionId={sessionId} locale={locale} />
                {encounters.length > 0 && (
                  <form
                    action={deployEncounter.bind(null, sessionId)}
                    className="mt-4 flex items-end gap-2 border-t border-ink-700 pt-4"
                  >
                    <label className="block flex-1">
                      <Label>{t("session.add.deployLabel")}</Label>
                      <Select name="encounterId">
                        {encounters.map((encounter) => (
                          <option key={encounter.id} value={encounter.id}>
                            {encounter.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <Button type="submit" className="min-h-11 shrink-0">
                      <IconSwords size={16} />
                      {t("session.add.deploy")}
                    </Button>
                  </form>
                )}
              </Card>
            )}

            {live && access.isDm && (
              <details className="pt-4">
                <summary className="min-h-11 cursor-pointer py-3 font-display text-sm uppercase tracking-wide text-blood-400 hover:underline">
                  {t("session.end.title")}
                </summary>
                <Card className="mt-3">
                  <form action={endSession.bind(null, sessionId)} className="space-y-3">
                    <label className="block">
                      <Label>{t("session.recap.optional")}</Label>
                      <Textarea name="recap" rows={4} placeholder={t("session.recap.placeholder")} />
                    </label>
                    <GhostButton type="submit" className="min-h-11 !border-blood-500 !text-blood-400">
                      {t("session.end.title")}
                    </GhostButton>
                  </form>
                </Card>
              </details>
            )}
          </section>

          <section className="space-y-4">
            {live && access.isDm && beats.length > 0 && (
              <Card>
                <h3 className="mb-1 font-display text-base text-gold-300">{t("session.script.title")}</h3>
                <p className="mb-3 text-[11px] text-parchment-500">{t("session.script.onlyYou")}</p>
                <div className="space-y-4">
                  {scriptGroups.map((group) => (
                    <div key={group.chapter?.id ?? "unfiled"}>
                      {chapters.length > 0 && (
                        <p className="mb-2 flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-parchment-500">
                          <span className="shrink-0">
                            {group.chapter ? group.chapter.title : t("campaign.beats.unfiled")}
                          </span>
                          <span aria-hidden className="h-px flex-1 bg-ink-700" />
                        </p>
                      )}
                      <ul className="space-y-2">
                        {group.beats.map((beat) => (
                          <li key={beat.id} className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 w-4 text-center font-bold ${
                                beat.status === "current" ? "text-gold-400" : "text-parchment-500"
                              }`}
                            >
                              {beat.status === "done" ? "✓" : beat.status === "current" ? "▶" : "•"}
                            </span>
                            <div className={`flex-1 ${beat.status === "done" ? "opacity-50" : ""}`}>
                              <p
                                className={`text-sm font-semibold ${
                                  beat.status === "current"
                                    ? "text-parchment-100"
                                    : "text-parchment-300"
                                }`}
                              >
                                {beat.kind === "plot" && (
                                  <IconBookmark
                                    size={12}
                                    className="mr-1 inline-block align-[-1px] text-gold-400"
                                    aria-label={t("campaign.beats.plotPoint")}
                                  />
                                )}
                                {beat.title}
                              </p>
                              {beat.status === "current" && beat.narrative && (
                                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-parchment-300">
                                  {beat.narrative}
                                </p>
                              )}
                              {beat.status === "current" && beat.rollNote && (
                                <p className="mt-1 inline-block rounded border border-blood-500/50 bg-blood-500/10 px-1.5 py-0.5 text-[11px] font-bold text-blood-400">
                                  <IconDie size={12} className="mr-1 inline-block align-[-2px]" />
                                  {beat.rollNote}
                                </p>
                              )}
                            </div>
                            {beat.status !== "done" && (
                              <form
                                action={setBeatStatus.bind(
                                  null,
                                  beat.id,
                                  beat.status === "current" ? "done" : "current"
                                )}
                              >
                                <button
                                  type="submit"
                                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-ink-600 px-1.5 py-0.5 text-[11px] font-bold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300 cursor-pointer"
                                >
                                  {beat.status === "current"
                                    ? t("session.script.done")
                                    : t("session.script.play")}
                                </button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Loot is handed out mid-scene, and the DM was leaving the table
                to do it. The panel is the campaign hub's own, unchanged —
                only its address is new. */}
            {live && access.isDm && (
              <GiveItemSection
                members={members}
                campaignCharacters={giveItemRoster}
                campaignId={session.campaignId}
                locale={locale}
                t={t}
              />
            )}

            {live && (
              <Card id="dice" className="scroll-mt-28">
                <h3 className="mb-3 font-display text-base text-gold-300">{t("session.dice.title")}</h3>
                <DiceRoller sessionId={sessionId} locale={locale} />
              </Card>
            )}

            <Card id="log" className="scroll-mt-28">
              <h3 className="mb-3 font-display text-base text-gold-300">{t("session.log.title")}</h3>
              {live && (
                <form action={addTableNote.bind(null, sessionId)} className="mb-4 flex gap-2">
                  <Input name="note" placeholder={t("session.log.placeholder")} required className="min-h-11" />
                  <Button type="submit" className="min-h-11 shrink-0">
                    {t("session.log.note")}
                  </Button>
                </form>
              )}
              {events.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-4 text-parchment-500">
                  <IconScroll size={24} />
                  <p className="text-sm">{t("session.log.empty")}</p>
                </div>
              )}
              <ul className="max-h-96 space-y-1 overflow-y-auto pr-1">
                {events.map(({ event, user: actor }, index) => {
                  const rendered = renderEventMessage(event.message, t, event.kind);

                  if (rendered.key === "roundBegins") {
                    return (
                      <li key={event.id} className="anim-log-entry flex items-center gap-3 pb-1 pt-2">
                        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-blood-400">
                          {rendered.text}
                        </span>
                        <span aria-hidden className="h-[3px] flex-1 border-y border-ink-600/70" />
                      </li>
                    );
                  }

                  const Icon =
                    event.kind === "roll"
                      ? IconDie
                      : event.kind === "join"
                        ? IconParty
                        : event.kind === "note"
                          ? IconQuill
                          : rendered.key === "hasDied"
                            ? IconSkull
                            : IconSwords;
                  const iconColor =
                    event.kind === "roll"
                      ? "text-gold-400"
                      : rendered.key === "hasDied" || rendered.key === "dropsToZero"
                        ? "text-blood-400"
                        : event.kind === "system"
                          ? "text-parchment-500"
                          : "text-parchment-300";

                  return (
                    <li
                      key={event.id}
                      className={`anim-log-entry flex items-start gap-2 rounded-sm px-1 py-1 text-sm leading-snug ${
                        index % 2 === 1 ? "bg-ink-800/30" : ""
                      }`}
                    >
                      <Icon size={14} className={`mt-0.5 shrink-0 ${iconColor}`} />
                      <span className="min-w-0 flex-1">
                        {(event.kind === "roll" || event.kind === "note") && (
                          <strong className="mr-1 text-gold-300">
                            {actor?.displayName ?? actor?.username ?? t("session.log.someone")}
                          </strong>
                        )}
                        <span
                          className={
                            event.kind === "system"
                              ? rendered.key
                                ? "text-parchment-300"
                                : "italic text-parchment-500"
                              : "text-parchment-100"
                          }
                        >
                          {rendered.text}
                        </span>
                        {rendered.rollDetail ? (
                          <span className="ml-1 text-xs text-parchment-500">
                            → {rendered.rollDetail}
                          </span>
                        ) : null}
                        {rendered.rollTotal !== undefined && (
                          <span className="ml-1 font-mono font-bold text-gold-400">
                            = {rendered.rollTotal}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 pt-0.5 text-[11px] text-parchment-500">
                        {formatLogTime(event.createdAt, live, locale, t)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}

function formatLogTime(createdAt: number, live: boolean, locale: Locale, t: T) {
  if (!live) {
    return new Date(createdAt).toLocaleTimeString(locale === "tr" ? "tr-TR" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const mins = Math.floor((Date.now() - createdAt) / 60_000);
  if (mins < 1) return t("session.log.timeNow");
  if (mins < 60) return t("session.log.timeMin", { n: mins });
  return t("session.log.timeHour", { n: Math.floor(mins / 60) });
}

/** The colour each spoken condition wears — the bar's palette, in words. */
const CONDITION_COLORS: Record<string, string> = {
  unscathed: "text-emerald-700",
  wounded: "text-amber-700",
  badlyWounded: "text-blood-400",
  down: "text-blood-400",
};

function CombatantRow({
  combatant,
  isTurn,
  isDm,
  isMe,
  live,
  hideHp,
  sessionId,
  portrait,
  sheetHref,
  t,
}: {
  combatant: Combatant;
  isTurn: boolean;
  isDm: boolean;
  isMe: boolean;
  live: boolean;
  /** Show this viewer a condition word instead of the numbers and the bar. */
  hideHp: boolean;
  sessionId: string;
  /** Portrait URL, or null for a player character without one. */
  portrait: string | null;
  /** The sheet standing behind this row, when one does — monsters have none. */
  sheetHref: string | null;
  t: T;
}) {
  // With the numbers hidden, the bar would give them straight back — so the
  // ratio itself is only computed for the people allowed to read it.
  const hpRatio =
    !hideHp && combatant.hp !== null && combatant.maxHp
      ? combatant.hp / combatant.maxHp
      : null;
  const hpColor =
    hpRatio === null
      ? ""
      : hpRatio > 0.5
        ? "text-emerald-700"
        : hpRatio > 0.2
          ? "text-amber-700"
          : "text-blood-400";
  const condition = hideHp ? hpCondition(combatant.hp, combatant.maxHp) : null;
  // The DM adjusts anyone; a player adjusts the row their own sheet stands in.
  const canAdjustHp =
    live && combatant.hp !== null && (isDm || (isMe && combatant.characterId !== null));

  // Face and name, which are also the way to the sheet behind them. Only that
  // much is wrapped: the HP box and the buttons under it are their own
  // controls, and a link swallowing them would be a trap for the thumb.
  const face = (
    <>
      {/* Monsters stay compact — only sheets get a face. */}
      {combatant.characterId && <Portrait src={portrait} alt={combatant.name} size={32} />}
      <div className="min-w-0 flex-1">
        {/* Hover underlines rather than gilds: gold-300 reads at 4.24:1 here,
            which is fine for a marker and not for the name itself. */}
        <p className="font-semibold text-parchment-100 underline-offset-4 group-hover:underline group-hover:decoration-gold-500">
          {isTurn && <span className="mr-1 text-gold-400">▶</span>}
          {combatant.name}
          {/* Reads on the gold active-turn row too: parchment-500 on ink-800
              lands at 4.34:1, under the 4.5 this 11px label needs. */}
          {isMe && <span className="ml-2 text-[11px] uppercase tracking-wide text-parchment-300">{t("session.combatant.you")}</span>}
        </p>
        {combatant.conditions && (
          <p className="text-xs font-semibold text-amber-800">{combatant.conditions}</p>
        )}
      </div>
    </>
  );

  return (
    <Card
      className={`py-3 ${isTurn ? "anim-turn-flash border-gold-500 bg-ink-800" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span className="w-8 text-center font-display text-lg font-bold text-gold-400">
          {combatant.initiative}
        </span>
        {sheetHref ? (
          <Link
            href={sheetHref}
            className="group flex min-w-0 flex-1 items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-gold-400"
          >
            {face}
          </Link>
        ) : (
          face
        )}
        {combatant.hp !== null &&
          (hideHp ? (
            condition && (
              <span
                className={`text-xs font-bold uppercase tracking-wide ${CONDITION_COLORS[condition]}`}
              >
                {t(`session.combatant.condition.${condition}`)}
              </span>
            )
          ) : (
            <span className={`font-mono text-sm font-bold ${hpColor}`}>
              {combatant.hp}
              {combatant.tempHp > 0 && (
                <span className="text-sky-700">+{combatant.tempHp}</span>
              )}
              {combatant.maxHp ? ` / ${combatant.maxHp}` : ""} HP
            </span>
          ))}
      </div>

      {hpRatio !== null && (
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-ink-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              hpRatio > 0.5 ? "bg-emerald-700" : hpRatio > 0.2 ? "bg-amber-700" : "bg-blood-500"
            }`}
            style={{ width: `${Math.round(Math.max(0, Math.min(1, hpRatio)) * 100)}%` }}
          />
        </div>
      )}

      {combatant.userId && combatant.hp === 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-blood-500/50 bg-blood-500/10 px-2 py-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-blood-400">
            {t("session.combatant.deathSaves")}
          </span>
          <span className="font-mono text-sm">
            <span className="text-emerald-700">
              {"●".repeat(combatant.deathSuccesses)}
              {"○".repeat(3 - combatant.deathSuccesses)}
            </span>
            <span className="mx-1 text-parchment-500">/</span>
            <span className="text-blood-400">
              {"✕".repeat(combatant.deathFailures)}
              {"○".repeat(3 - combatant.deathFailures)}
            </span>
          </span>
          {combatant.deathSuccesses >= 3 && (
            <span className="text-xs font-bold text-emerald-700">{t("session.combatant.stable")}</span>
          )}
          {combatant.deathFailures >= 3 && (
            <span className="text-xs font-bold text-blood-400">{t("session.combatant.dead")}</span>
          )}
          {live && (isDm || isMe) && (
            <span className="flex gap-1">
              <form action={recordDeathSave.bind(null, sessionId, combatant.id, "success")}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-emerald-700/60 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-200/60 cursor-pointer"
                >
                  {t("session.combatant.plusSave")}
                </button>
              </form>
              <form action={recordDeathSave.bind(null, sessionId, combatant.id, "fail")}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-blood-500 px-1.5 py-0.5 text-[11px] font-bold text-blood-400 transition hover:bg-blood-500/15 cursor-pointer"
                >
                  {t("session.combatant.plusFail")}
                </button>
              </form>
              <form action={recordDeathSave.bind(null, sessionId, combatant.id, "reset")}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-ink-600 px-1.5 py-0.5 text-[11px] text-parchment-500 transition hover:border-gold-500 cursor-pointer"
                >
                  {t("session.combatant.reset")}
                </button>
              </form>
            </span>
          )}
        </div>
      )}

      {((isDm && live) || canAdjustHp) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-3">
          {canAdjustHp && (
            <form
              action={adjustHp.bind(null, sessionId, combatant.id)}
              className="flex items-center gap-1"
            >
              {/* Empty, not pre-filled with 1: a thumb that taps this box to
                  type "7" should not have to clear a digit first. Blank still
                  means one point — the server reads it that way. */}
              <Input
                name="amount"
                type="number"
                min={0}
                max={999}
                placeholder="1"
                className="!w-16 min-h-11 !py-1"
              />
              <button
                type="submit"
                name="op"
                value="damage"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-blood-500 px-2 py-1 text-xs font-bold text-blood-400 transition hover:bg-blood-500/15 cursor-pointer"
              >
                {t("session.combatant.damage")}
              </button>
              <button
                type="submit"
                name="op"
                value="heal"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-emerald-700/60 px-2 py-1 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200/60 cursor-pointer"
              >
                {t("session.combatant.heal")}
              </button>
              <button
                type="submit"
                name="op"
                value="temp"
                title={t("session.combatant.tempTitle")}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-sky-700/60 px-2 py-1 text-xs font-bold text-sky-800 transition hover:bg-sky-200/60 cursor-pointer"
              >
                {t("session.combatant.temp")}
              </button>
            </form>
          )}
          {/* Conditions and the boot off the list stay the DM's alone. */}
          {isDm && live && (
            <>
              <form
                action={setConditions.bind(null, sessionId, combatant.id)}
                className="flex flex-1 items-center gap-1"
              >
                <Input
                  name="conditions"
                  defaultValue={combatant.conditions ?? ""}
                  placeholder={t("session.combatant.conditionsPlaceholder")}
                  className="min-h-11 !py-1 min-w-32"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-ink-600 px-2 py-1 text-xs font-bold text-parchment-300 transition hover:border-gold-500 cursor-pointer"
                >
                  {t("session.combatant.set")}
                </button>
              </form>
              <form action={removeCombatant.bind(null, sessionId, combatant.id)}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-ink-600 px-2 py-1 text-xs text-parchment-500 transition hover:border-blood-500 hover:text-blood-400 cursor-pointer"
                  title={t("session.combatant.removeTitle")}
                  aria-label={t("session.combatant.removeTitle")}
                >
                  <IconX size={14} />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
