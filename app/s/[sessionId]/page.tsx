import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, campaignMaps, gameSessions, sessionEvents, users, type Combatant } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import {
  addTableNote,
  adjustHp,
  endSession,
  getTurnOrder,
  joinInitiative,
  nextTurn,
  recordDeathSave,
  removeCombatant,
  saveRecap,
  setConditions,
} from "@/lib/session-actions";
import { deployEncounter } from "@/lib/compendium-actions";
import { encounters as encountersTable } from "@/lib/db";
import { asc } from "drizzle-orm";
import { getBeats, setBeatStatus } from "@/lib/beat-actions";
import { chooseActiveMap } from "@/lib/map-actions";
import { getT } from "@/lib/locale";
import type { T } from "@/lib/i18n";
import { SiteHeader } from "@/components/SiteHeader";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DiceRoller } from "@/components/DiceRoller";
import { AddCombatantForm } from "@/components/AddCombatantForm";
import { MapViewer } from "@/components/MapViewer";
import { IconDie, IconMap, IconSwords } from "@/components/Icons";
import { BackLink, Button, Card, DmBadge, GhostButton, Input, Label, SectionTitle, Select, Textarea } from "@/components/ui";

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
  const order = await getTurnOrder(sessionId);
  const iAmIn = order.some((c) => c.userId === user.id);
  const beats = access.isDm ? await getBeats(session.campaignId) : [];
  const encounters = access.isDm
    ? await db
        .select()
        .from(encountersTable)
        .where(eq(encountersTable.campaignId, session.campaignId))
        .orderBy(asc(encountersTable.createdAt))
    : [];

  const mapsList = access.isDm
    ? await db
        .select()
        .from(campaignMaps)
        .where(eq(campaignMaps.campaignId, session.campaignId))
        .orderBy(asc(campaignMaps.createdAt))
    : [];
  const activeMap = await db.query.campaignMaps.findFirst({
    where: and(
      eq(campaignMaps.campaignId, session.campaignId),
      eq(campaignMaps.isActive, 1)
    ),
  });
  const shownMap =
    activeMap && (activeMap.visibility === "everyone" || access.isDm) ? activeMap : null;

  const events = await db
    .select({ event: sessionEvents, user: users })
    .from(sessionEvents)
    .leftJoin(users, eq(sessionEvents.userId, users.id))
    .where(eq(sessionEvents.sessionId, sessionId))
    .orderBy(desc(sessionEvents.createdAt))
    .limit(40);

  return (
    <>
      {live && <AutoRefresh intervalMs={3000} />}
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <BackLink href={`/c/${session.campaignId}`}>{access.campaign.name}</BackLink>

        <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
            {session.title}
          </h1>
          {live ? (
            <span className="flex items-center gap-2 rounded-full border border-emerald-700/60 bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-900">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
              {t("session.liveRound", { round: session.round })}
            </span>
          ) : (
            <span className="rounded-full border border-ink-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-parchment-500">
              {t("session.ended")}
            </span>
          )}
        </div>

        {live && shownMap && (
          <Card className="mb-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-2 font-display text-base text-gold-300">
                <IconMap size={16} /> {shownMap.title}
              </h3>
              {shownMap.visibility === "dm" && <DmBadge label={t("campaign.maps.dmOnly")} />}
            </div>
            <MapViewer
              src={`/files/maps/${shownMap.id}`}
              alt={shownMap.title}
              className="h-[420px] w-full sm:h-[520px]"
              labels={{
                zoomIn: t("campaign.maps.viewer.zoomIn"),
                zoomOut: t("campaign.maps.viewer.zoomOut"),
                reset: t("campaign.maps.viewer.reset"),
                fullscreen: t("campaign.maps.viewer.fullscreen"),
              }}
            />
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
                <Button type="submit" className="shrink-0">
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
              <Button type="submit" className="shrink-0">
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
                <Button type="submit">{t("session.recap.save")}</Button>
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
            <div className="flex items-center justify-between">
              <SectionTitle>{t("session.initiative.title")}</SectionTitle>
              {live && access.isDm && order.length > 0 && (
                <form action={nextTurn.bind(null, sessionId)}>
                  <Button type="submit">{t("session.initiative.nextTurn")}</Button>
                </form>
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
                isTurn={live && index === session.turnIndex}
                isDm={access.isDm}
                isMe={combatant.userId === user.id}
                live={live}
                sessionId={sessionId}
                t={t}
              />
            ))}

            {live && !iAmIn && (
              <Card>
                <form action={joinInitiative.bind(null, sessionId)} className="flex items-end gap-2">
                  <label className="block w-28">
                    <Label>{t("session.initiative.yourRoll")}</Label>
                    <Input
                      name="initiative"
                      type="number"
                      min={-10}
                      max={50}
                      placeholder="d20"
                    />
                  </label>
                  <Button type="submit" className="flex-1">
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
                    <Button type="submit" className="shrink-0">
                      <IconSwords size={16} />
                      {t("session.add.deploy")}
                    </Button>
                  </form>
                )}
              </Card>
            )}

            {live && access.isDm && (
              <details className="pt-4">
                <summary className="cursor-pointer font-display text-sm uppercase tracking-wide text-blood-400 hover:text-blood-400">
                  {t("session.end.title")}
                </summary>
                <Card className="mt-3">
                  <form action={endSession.bind(null, sessionId)} className="space-y-3">
                    <label className="block">
                      <Label>{t("session.recap.optional")}</Label>
                      <Textarea name="recap" rows={4} placeholder={t("session.recap.placeholder")} />
                    </label>
                    <GhostButton type="submit" className="!border-blood-500 !text-blood-400">
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
                <ul className="space-y-2">
                  {beats.map((beat) => (
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
                            beat.status === "current" ? "text-parchment-100" : "text-parchment-300"
                          }`}
                        >
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
                            className="rounded border border-ink-600 px-1.5 py-0.5 text-[11px] font-bold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300 cursor-pointer"
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
              </Card>
            )}

            {live && (
              <Card>
                <h3 className="mb-3 font-display text-base text-gold-300">{t("session.dice.title")}</h3>
                <DiceRoller sessionId={sessionId} locale={locale} />
              </Card>
            )}

            <Card>
              <h3 className="mb-3 font-display text-base text-gold-300">{t("session.log.title")}</h3>
              {live && (
                <form action={addTableNote.bind(null, sessionId)} className="mb-4 flex gap-2">
                  <Input name="note" placeholder={t("session.log.placeholder")} required />
                  <Button type="submit" className="shrink-0">
                    {t("session.log.note")}
                  </Button>
                </form>
              )}
              {events.length === 0 && (
                <p className="text-sm text-parchment-500">{t("session.log.empty")}</p>
              )}
              <ul className="space-y-2">
                {events.map(({ event, user: actor }) => (
                  <li key={event.id} className="text-sm leading-snug">
                    <span className="mr-2 text-[11px] text-parchment-500">
                      {new Date(event.createdAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {event.kind === "roll" ? (
                      <span className="text-parchment-100">
                        <strong className="text-gold-300">
                          {actor?.displayName ?? actor?.username ?? t("session.log.someone")}
                        </strong>{" "}
                        {event.message}
                      </span>
                    ) : (
                      <span
                        className={
                          event.kind === "system"
                            ? "italic text-parchment-500"
                            : "text-parchment-100"
                        }
                      >
                        {event.message}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}

function CombatantRow({
  combatant,
  isTurn,
  isDm,
  isMe,
  live,
  sessionId,
  t,
}: {
  combatant: Combatant;
  isTurn: boolean;
  isDm: boolean;
  isMe: boolean;
  live: boolean;
  sessionId: string;
  t: T;
}) {
  const hpRatio =
    combatant.hp !== null && combatant.maxHp ? combatant.hp / combatant.maxHp : null;
  const hpColor =
    hpRatio === null
      ? ""
      : hpRatio > 0.5
        ? "text-emerald-700"
        : hpRatio > 0.2
          ? "text-amber-700"
          : "text-blood-400";

  return (
    <Card
      className={`py-3 ${isTurn ? "border-gold-500 bg-ink-800" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span className="w-8 text-center font-display text-lg font-bold text-gold-400">
          {combatant.initiative}
        </span>
        <div className="flex-1">
          <p className="font-semibold text-parchment-100">
            {isTurn && <span className="mr-1 text-gold-400">▶</span>}
            {combatant.name}
            {isMe && <span className="ml-2 text-[11px] uppercase tracking-wide text-parchment-500">{t("session.combatant.you")}</span>}
          </p>
          {combatant.conditions && (
            <p className="text-xs font-semibold text-amber-800">{combatant.conditions}</p>
          )}
        </div>
        {combatant.hp !== null && (
          <span className={`font-mono text-sm font-bold ${hpColor}`}>
            {combatant.hp}
            {combatant.tempHp > 0 && (
              <span className="text-sky-700">+{combatant.tempHp}</span>
            )}
            {combatant.maxHp ? ` / ${combatant.maxHp}` : ""} HP
          </span>
        )}
      </div>

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
                  className="rounded border border-emerald-700/60 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800 transition hover:bg-emerald-200/60 cursor-pointer"
                >
                  {t("session.combatant.plusSave")}
                </button>
              </form>
              <form action={recordDeathSave.bind(null, sessionId, combatant.id, "fail")}>
                <button
                  type="submit"
                  className="rounded border border-blood-500 px-1.5 py-0.5 text-[11px] font-bold text-blood-400 transition hover:bg-blood-500/15 cursor-pointer"
                >
                  {t("session.combatant.plusFail")}
                </button>
              </form>
              <form action={recordDeathSave.bind(null, sessionId, combatant.id, "reset")}>
                <button
                  type="submit"
                  className="rounded border border-ink-600 px-1.5 py-0.5 text-[11px] text-parchment-500 transition hover:border-gold-500 cursor-pointer"
                >
                  {t("session.combatant.reset")}
                </button>
              </form>
            </span>
          )}
        </div>
      )}

      {isDm && live && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-3">
          {combatant.hp !== null && (
            <form
              action={adjustHp.bind(null, sessionId, combatant.id)}
              className="flex items-center gap-1"
            >
              <Input
                name="amount"
                type="number"
                min={0}
                max={999}
                defaultValue={1}
                className="!w-16 !py-1"
              />
              <button
                type="submit"
                name="op"
                value="damage"
                className="rounded border border-blood-500 px-2 py-1 text-xs font-bold text-blood-400 transition hover:bg-blood-500/15 cursor-pointer"
              >
                {t("session.combatant.damage")}
              </button>
              <button
                type="submit"
                name="op"
                value="heal"
                className="rounded border border-emerald-700/60 px-2 py-1 text-xs font-bold text-emerald-800 transition hover:bg-emerald-200/60 cursor-pointer"
              >
                {t("session.combatant.heal")}
              </button>
              <button
                type="submit"
                name="op"
                value="temp"
                title={t("session.combatant.tempTitle")}
                className="rounded border border-sky-700/60 px-2 py-1 text-xs font-bold text-sky-800 transition hover:bg-sky-200/60 cursor-pointer"
              >
                {t("session.combatant.temp")}
              </button>
            </form>
          )}
          <form
            action={setConditions.bind(null, sessionId, combatant.id)}
            className="flex flex-1 items-center gap-1"
          >
            <Input
              name="conditions"
              defaultValue={combatant.conditions ?? ""}
              placeholder={t("session.combatant.conditionsPlaceholder")}
              className="!py-1 min-w-32"
            />
            <button
              type="submit"
              className="rounded border border-ink-600 px-2 py-1 text-xs font-bold text-parchment-300 transition hover:border-gold-500 cursor-pointer"
            >
              {t("session.combatant.set")}
            </button>
          </form>
          <form action={removeCombatant.bind(null, sessionId, combatant.id)}>
            <button
              type="submit"
              className="rounded border border-ink-600 px-2 py-1 text-xs text-parchment-500 transition hover:border-blood-500 hover:text-blood-400 cursor-pointer"
              title={t("session.combatant.removeTitle")}
            >
              ✕
            </button>
          </form>
        </div>
      )}
    </Card>
  );
}
