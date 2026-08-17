import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, campaigns, encounters, gameSessions } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { getMonster, getMonsterImage, type SrdMonsterAction } from "@/lib/srd-data";
import { addMonsterToEncounter, addMonsterToLiveSession } from "@/lib/compendium-actions";
import { fmt, mod } from "@/lib/dnd";
import { SiteHeader } from "@/components/SiteHeader";
import { IconSwords } from "@/components/Icons";
import { BackLink, Button, Card, Input, Label, Select } from "@/components/ui";

export default async function MonsterPage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const user = await getCurrentUser();
  const { t } = await getT();
  const { index } = await params;
  const monster = getMonster(index);
  if (!monster) notFound();
  const image = getMonsterImage(index);

  const myCampaigns = user
    ? await db.select().from(campaigns).where(eq(campaigns.dmUserId, user.id))
    : [];
  const campaignIds = myCampaigns.map((c) => c.id);
  const myEncounters = campaignIds.length
    ? await db.select().from(encounters).where(inArray(encounters.campaignId, campaignIds))
    : [];
  const liveSessions = campaignIds.length
    ? (
        await db
          .select()
          .from(gameSessions)
          .where(inArray(gameSessions.campaignId, campaignIds))
      ).filter((s) => s.status === "live")
    : [];
  const campaignName = (id: string) => myCampaigns.find((c) => c.id === id)?.name ?? "";

  const scores = [
    ["STR", monster.str],
    ["DEX", monster.dex],
    ["CON", monster.con],
    ["INT", monster.intel],
    ["WIS", monster.wis],
    ["CHA", monster.cha],
  ] as const;

  const facts: Array<[string, string | null]> = [
    [t("compendium.monsters.savingThrows"), monster.saves],
    [t("compendium.monsters.skills"), monster.skills],
    [t("compendium.monsters.vulnerabilities"), monster.vulnerabilities],
    [t("compendium.monsters.resistances"), monster.resistances],
    [t("compendium.monsters.immunities"), monster.immunities],
    [t("compendium.monsters.conditionImmunities"), monster.conditionImmunities],
    [t("compendium.monsters.senses"), monster.senses],
    [t("compendium.monsters.languages"), monster.languages],
  ];

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <BackLink href="/compendium/monsters">{t("compendium.monsters.title")}</BackLink>

        <div className="mt-2 mb-6 flex items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
              {monster.name}
            </h1>
            <p className="mt-1 text-sm italic text-parchment-500">
              {monster.size} {monster.type}, {monster.alignment} · CR {monster.crLabel} (
              {monster.xp} XP)
            </p>
          </div>
          {image && (
            <figure className="w-36 shrink-0 sm:w-44">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.img}
                alt={monster.name}
                referrerPolicy="no-referrer"
                className="w-full rounded-sm border border-ink-600 object-cover"
              />
              <figcaption className="mt-1 text-[10px] leading-snug text-parchment-500">
                {t("compendium.monsters.imageCredit")}{" "}
                <a
                  href={image.page}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-gold-300"
                >
                  Wikipedia
                </a>
              </figcaption>
            </figure>
          )}
        </div>

        <Card className="mb-6">
          <p className="text-sm text-parchment-100">
            <strong className="text-gold-300">AC</strong> {monster.ac}
            {monster.acType ? ` (${monster.acType})` : ""}
            {"  ·  "}
            <strong className="text-gold-300">HP</strong> {monster.hp} ({monster.hitDice})
            {"  ·  "}
            <strong className="text-gold-300">{t("compendium.monsters.speed")}</strong>{" "}
            {monster.speed}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {scores.map(([label, score]) => (
              <div
                key={label}
                className="rounded-sm border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-center"
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-parchment-500">
                  {label}
                </p>
                <p className="font-mono text-sm font-bold text-parchment-100">
                  {score} <span className="text-gold-300">({fmt(mod(score))})</span>
                </p>
              </div>
            ))}
          </div>
          <dl className="mt-4 space-y-1">
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label} className="text-sm">
                  <dt className="inline font-bold text-gold-300">{label}: </dt>
                  <dd className="inline text-parchment-100">{value}</dd>
                </div>
              ))}
          </dl>
        </Card>

        <ActionList title={t("compendium.monsters.traits")} items={monster.traits} />
        <ActionList title={t("compendium.monsters.actions")} items={monster.actions} />
        <ActionList title={t("compendium.monsters.legendary")} items={monster.legendary} />

        {(myEncounters.length > 0 || liveSessions.length > 0) && (
          <Card className="mt-8 space-y-4">
            <h3 className="font-display text-base text-gold-300">
              {t("compendium.monsters.dmTools")}
            </h3>
            {myEncounters.length > 0 && (
              <form
                action={addMonsterToEncounter.bind(null, monster.index)}
                className="flex flex-wrap items-end gap-2"
              >
                <label className="block">
                  <Label>{t("compendium.monsters.addToEncounter")}</Label>
                  <Select name="encounterId" className="!w-56">
                    {myEncounters.map((encounter) => (
                      <option key={encounter.id} value={encounter.id}>
                        {encounter.name} · {campaignName(encounter.campaignId)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block w-20">
                  <Label>{t("compendium.monsters.count")}</Label>
                  <Input name="count" type="number" min={1} max={20} defaultValue={1} />
                </label>
                <Button type="submit">{t("common.add")}</Button>
              </form>
            )}
            {liveSessions.length > 0 && (
              <form
                action={addMonsterToLiveSession.bind(null, monster.index)}
                className="flex flex-wrap items-end gap-2"
              >
                <label className="block">
                  <Label>{t("compendium.monsters.throwIntoSession")}</Label>
                  <Select name="sessionId" className="!w-56">
                    {liveSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.title} · {campaignName(session.campaignId)}
                      </option>
                    ))}
                  </Select>
                </label>
                <Button type="submit">
                  <IconSwords size={16} />
                  {t("compendium.monsters.deploy")}
                </Button>
              </form>
            )}
            {myEncounters.length === 0 && (
              <p className="text-xs text-parchment-500">
                {t("compendium.monsters.encounterHint")}
              </p>
            )}
          </Card>
        )}
      </main>
    </>
  );
}

function ActionList({ title, items }: { title: string; items: SrdMonsterAction[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-display text-lg font-bold text-blood-400">{title}</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <p key={item.name} className="text-sm leading-relaxed text-parchment-100">
            <strong className="italic text-parchment-100">{item.name}. </strong>
            <span className="whitespace-pre-wrap">{item.desc}</span>
          </p>
        ))}
      </div>
    </section>
  );
}
