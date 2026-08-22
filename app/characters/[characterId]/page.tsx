import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, characters } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { deleteRosterCharacter } from "@/lib/character-actions";
import { SiteHeader } from "@/components/SiteHeader";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CharacterSheetBody } from "@/components/character/CharacterSheetBody";
import { loadSheetRows } from "@/components/character/sheet-data";
import {
  loadSeatsTaken,
  loadSittableCampaigns,
  openSeats,
  SitDownForm,
} from "@/components/character/SitDownForm";
import { BackLink, Card, SectionTitle } from "@/components/ui";

/**
 * A character nobody is running yet — the roster sheet.
 *
 * The same document the table draws, minus everything a table brings with it:
 * no approval to wait on, no DM holding a pen over it, no feed recording what
 * was changed, no world library standing behind the backpack. It answers to
 * its player and to nobody else, which is why the only permission question
 * here is whether the reader owns it.
 *
 * The one thing it can do that a played sheet cannot is walk into a game, and
 * that is the card at the bottom.
 */
export default async function RosterCharacterPage({
  params,
}: {
  params: Promise<{ characterId: string }>;
}) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const { characterId } = await params;

  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) notFound();
  // Ownership is asked before anything else is said out loud: redirecting a
  // stranger to the table a sheet plays at would name that table to them, and
  // the id in the URL is forgeable. A missing sheet and somebody else's answer
  // the same, as everywhere in this app.
  if (character.userId !== user.id) notFound();
  // This route is the roster's. A sheet that has since joined a table is read
  // where it is played — that page knows about parties, approval and the feed,
  // and this one deliberately does not.
  if (character.campaignId !== null) {
    redirect(`/c/${character.campaignId}/ch/${character.userId}?ch=${character.id}`);
  }

  const [{ items, abilities, spellSlots }, sittable, taken] = await Promise.all([
    loadSheetRows(character.id),
    loadSittableCampaigns(user.id),
    loadSeatsTaken(user.id),
  ]);
  // Tables this one is not already sitting at. A campaign holding a copy of it
  // would refuse a second, so offering it is offering a dead button.
  const seats = openSeats(sittable, taken, character.id);

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/characters">{t("character.hub.title")}</BackLink>

        {/* Said here, once, because the copying is the one rule of the roster
            nobody works out on their own — and finding out afterwards that a
            night's levelling stayed at the table is a bad way to learn it. */}
        <p className="mt-4 rounded-sm border border-ink-700 bg-ink-900/60 px-4 py-3 text-sm leading-relaxed text-parchment-500">
          {t("character.roster.templateBanner")}
        </p>

        <CharacterSheetBody
          character={character}
          items={items}
          abilities={abilities}
          spellSlots={spellSlots}
          campaignId={null}
          editable
          isDm={false}
          ownerName={null}
          t={t}
          locale={locale}
        />

        <section className="mt-10 space-y-4">
          <SectionTitle>{t("character.roster.sitTitle")}</SectionTitle>
          <Card>
            {sittable.length === 0 ? (
              <p className="text-sm text-parchment-500">
                {t("character.roster.sitNoCampaigns")}{" "}
                <Link href="/dashboard" className="text-gold-300 underline hover:text-gold-400">
                  {t("character.hub.toDashboard")}
                </Link>
              </p>
            ) : seats.length === 0 ? (
              <p className="text-sm text-parchment-500">{t("character.roster.sitAllSeated")}</p>
            ) : (
              <>
                <SitDownForm characterId={character.id} campaigns={seats} t={t} />
                <p className="mt-2 text-xs text-parchment-500">
                  {t("character.roster.sitHint")}
                </p>
              </>
            )}
          </Card>
        </section>

        {/* Last on the page, and folded away, because it is the one control
            here that cannot be undone — and because a roster sheet's whole
            purpose is to be kept. */}
        <section className="mt-10 space-y-4">
          <SectionTitle>{t("character.roster.deleteTitle")}</SectionTitle>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-sm text-parchment-500">
              {t("character.roster.deleteWarn")}
            </p>
            <ConfirmButton
              label={t("character.roster.deleteButton")}
              confirmLabel={t("common.confirm.yesDelete")}
              warnText={t("common.confirm.areYouSure")}
              action={deleteRosterCharacter.bind(null, character.id)}
              danger
              size="md"
              ariaLabel={t("character.roster.deleteAria", { name: character.name })}
            />
          </Card>
        </section>
      </main>
    </>
  );
}
