import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, characters, campaigns, campaignMembers } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { acTitle, hasScores, statBlock } from "@/lib/dnd";
import { effectiveAc, loadWornFor, wornSetFor } from "@/lib/armor";
import { createCharacter } from "@/lib/character-actions";
import { classArtFor, EMPTY_ART } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import {
  Button,
  Card,
  Input,
  Label,
  Portrait,
  portraitSrc,
  Select,
  SectionTitle,
} from "@/components/ui";
import { IconQuill, IconSkull } from "@/components/Icons";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("character.hub.title") };
}

export default async function CharactersPage() {
  const user = await requireUser();
  const { t } = await getT();

  const mine = await db
    .select({ character: characters, campaign: campaigns })
    .from(characters)
    .innerJoin(campaigns, eq(characters.campaignId, campaigns.id))
    .where(eq(characters.userId, user.id));

  // One extra query for the whole list, not one per card: the hub shows an
  // armour class and a passive Perception, and both are computed from what
  // each sheet is wearing rather than from the number typed on the form.
  const [memberships, worn] = await Promise.all([
    db
      .select({ campaign: campaigns })
      .from(campaignMembers)
      .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
      .where(eq(campaignMembers.userId, user.id)),
    loadWornFor(mine.map((row) => row.character.id)),
  ]);

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="mb-8 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("character.hub.title")}
        </h1>

        <section className="space-y-4">
          <SectionTitle>{t("character.hub.mine")}</SectionTitle>
          {mine.length === 0 && (
            <Card className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={EMPTY_ART.party}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-20 shrink-0 opacity-70"
              />
              <p className="text-sm leading-relaxed text-parchment-300">
                {t("character.hub.empty")}
              </p>
            </Card>
          )}
          {mine.map(({ character, campaign }) => {
            const gear = wornSetFor(worn, character.id);
            const pp = hasScores(character)
              ? statBlock(character, gear.bonuses).passivePerception
              : null;
            const ac = effectiveAc(character, gear.worn, gear.bonuses);
            return (
              <Link
                key={character.id}
                href={`/c/${campaign.id}/ch/${user.id}?ch=${character.id}`}
                className="block"
              >
                <Card
                  className={`py-4 transition hover:border-gold-500 ${
                    character.status === "dead" ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Portrait
                      src={portraitSrc(character.id, character.imageFile)}
                      alt={character.name}
                      size={40}
                      className="mt-0.5"
                      fallbackSrc={classArtFor(character.klass)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <h3 className="font-display text-lg font-bold text-parchment-100">
                          {character.name}
                        </h3>
                        {character.approval === "pending" && (
                          <span className="rounded-sm border border-gold-500 bg-gold-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-300">
                            {t("character.hub.pendingBadge")}
                          </span>
                        )}
                        {character.status === "dead" && (
                          <span className="flex items-center gap-1 rounded-sm border border-blood-500 bg-blood-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blood-400">
                            <IconSkull size={12} />
                            {t("character.hub.dead")}
                          </span>
                        )}
                        <span className="text-sm text-parchment-500">
                          {[
                            `${t("character.hub.level")} ${character.level}`,
                            character.race,
                            character.klass,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="ml-auto flex items-center gap-2 font-mono text-xs font-bold">
                          {character.maxHp !== null && (
                            <span className="text-blood-400">{character.maxHp} HP</span>
                          )}
                          {ac.value !== null && (
                            <span className="text-parchment-300" title={acTitle(ac)}>
                              AC {ac.value}
                            </span>
                          )}
                          {pp !== null && <span className="text-gold-300">PP {pp}</span>}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-parchment-500">{campaign.name}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </section>

        <section className="mt-10 space-y-4">
          <SectionTitle>{t("character.hub.create")}</SectionTitle>
          {memberships.length === 0 ? (
            <p className="text-sm text-parchment-500">
              {t("character.hub.noCampaigns")}{" "}
              <Link href="/dashboard" className="text-gold-300 underline hover:text-gold-400">
                {t("character.hub.toDashboard")}
              </Link>
            </p>
          ) : (
            <Card>
              <form action={createCharacter} className="flex flex-wrap items-end gap-3">
                <IconQuill size={22} className="mb-2 shrink-0 text-gold-400" />
                <label className="block min-w-44 flex-1">
                  <Label>{t("character.hub.nameLabel")}</Label>
                  <Input name="name" required placeholder={t("character.hub.namePh")} />
                </label>
                <label className="block min-w-44 flex-1">
                  <Label>{t("character.hub.campaignLabel")}</Label>
                  <Select name="campaignId">
                    {memberships.map(({ campaign }) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <Button type="submit">{t("character.hub.createButton")}</Button>
              </form>
              <p className="mt-2 text-xs text-parchment-500">
                {t("character.hub.createHint")} {t("character.hub.approvalHint")}
              </p>
            </Card>
          )}
        </section>
      </main>
    </>
  );
}
