import type { ReactNode } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, characters, campaigns, type Character } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import type { T } from "@/lib/i18n";
import { acTitle, hasScores, statBlock } from "@/lib/dnd";
import { effectiveAc, loadWornFor, wornSetFor, type WornSet } from "@/lib/armor";
import {
  createCharacter,
  createUnboundCharacter,
  deleteRosterCharacter,
} from "@/lib/character-actions";
import { classArtThumbFor, EMPTY_ART } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  loadSeatsTaken,
  loadSittableCampaigns,
  openSeats,
  SitDownForm,
} from "@/components/character/SitDownForm";
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
import { IconHelm, IconQuill, IconSkull, IconX } from "@/components/Icons";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("character.hub.title") };
}

/**
 * Everyone this player has ever written down, in two piles.
 *
 * The roster is the pile that belongs to nobody's table: characters invented
 * ahead of a game, and characters who outlived the game they were invented
 * for. The other pile is the sheets actually being played, each at the table
 * that holds it. A roster character crosses over by copy — the card carries
 * the picker that does it, and the master stays exactly where it is.
 */
export default async function CharactersPage() {
  const user = await requireUser();
  const { t } = await getT();

  // LEFT, not INNER: a roster character has no campaign row to match, and an
  // inner join is precisely the thing that would hide the half of this page
  // the roster exists to show.
  const mine = await db
    .select({ character: characters, campaign: campaigns })
    .from(characters)
    .leftJoin(campaigns, eq(characters.campaignId, campaigns.id))
    .where(eq(characters.userId, user.id));

  // One extra query for the whole list, not one per card: the hub shows an
  // armour class and a passive Perception, and both are computed from what
  // each sheet is wearing rather than from the number typed on the form. The
  // lookup is keyed by character, so it answers for both piles at once.
  //
  // `taken` is the same trick for the sit-down pickers: which masters are
  // already sitting where, read once for the page instead of once per card.
  const [sittable, taken, worn] = await Promise.all([
    loadSittableCampaigns(user.id),
    loadSeatsTaken(user.id),
    loadWornFor(mine.map((row) => row.character.id)),
  ]);

  const roster = mine.filter((row) => row.campaign === null).map((row) => row.character);
  const atTable = mine.flatMap(({ character, campaign }) =>
    campaign ? [{ character, campaign }] : []
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <h1 className="mb-8 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {t("character.hub.title")}
        </h1>

        <section className="space-y-4">
          <SectionTitle>{t("character.roster.label")}</SectionTitle>
          {roster.length === 0 && (
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
                {t("character.roster.empty")}
              </p>
            </Card>
          )}
          {roster.map((character) => {
            // Tables this one has not been taken to yet. A campaign already
            // holding a copy of this master is dropped rather than offered:
            // the action refuses a second copy there, so the row would be a
            // button that looks live and does nothing.
            const seats = openSeats(sittable, taken, character.id);
            return (
              // The whole card cannot be one link here: it carries forms, and a
              // form inside an anchor is neither valid nor clickable. The name
              // is the link instead, which is the part anyone was aiming at.
              <Card key={character.id} className="py-4">
                <CharacterFace
                  character={character}
                  gear={wornSetFor(worn, character.id)}
                  href={`/characters/${character.id}`}
                  t={t}
                  aside={
                    <ConfirmButton
                      label={<IconX size={12} />}
                      confirmLabel={t("common.confirm.yesDelete")}
                      warnText={t("character.roster.deleteWarn")}
                      action={deleteRosterCharacter.bind(null, character.id)}
                      danger
                      group="roster-delete"
                      ariaLabel={t("character.roster.deleteAria", { name: character.name })}
                    />
                  }
                >
                  {seats.length > 0 && (
                    <div className="mt-2">
                      <SitDownForm
                        characterId={character.id}
                        campaigns={seats}
                        t={t}
                        compact
                      />
                    </div>
                  )}
                </CharacterFace>
              </Card>
            );
          })}
          {roster.length > 0 && sittable.length === 0 && (
            // Said once under the pile rather than on every card in it.
            <p className="text-sm text-parchment-500">
              {t("character.roster.sitNoCampaigns")}{" "}
              <Link href="/dashboard" className="text-gold-300 underline hover:text-gold-400">
                {t("character.hub.toDashboard")}
              </Link>
            </p>
          )}
        </section>

        <section className="mt-10 space-y-4">
          <SectionTitle>{t("character.roster.atTable")}</SectionTitle>
          {atTable.length === 0 && (
            <p className="text-sm text-parchment-500">{t("character.roster.atTableEmpty")}</p>
          )}
          {atTable.map(({ character, campaign }) => (
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
                <CharacterFace
                  character={character}
                  gear={wornSetFor(worn, character.id)}
                  t={t}
                >
                  <p className="mt-1 text-xs text-parchment-500">
                    {/* Where it is played, and — for a sheet stamped from the
                        roster — that there is a master behind it that this
                        table's levelling will never reach. */}
                    {[
                      campaign.name,
                      character.originCharacterId
                        ? t("character.roster.fromTemplate")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </CharacterFace>
              </Card>
            </Link>
          ))}
        </section>

        <section className="mt-10 space-y-4">
          <SectionTitle>{t("character.hub.create")}</SectionTitle>

          {/* The builder goes first and wears the gilt, because it is the door
              that answers the question a first-time player actually has —
              "what *is* a saving throw proficiency, and which ones do I get?".
              It carries the roster/adventure choice inside it, so this card is
              a link rather than a fourth picker.

              The two name-only forms below it stay. A player who already has
              the character in their head wants a sheet and a name, not twelve
              questions, and taking that door away to make this one look
              primary would have been a demotion dressed as a simplification.
              Being second on the page is demotion enough. */}
          <Card className="border-gold-500/50">
            <div className="flex flex-wrap items-center gap-4">
              <IconHelm size={28} className="shrink-0 text-gold-400" />
              <div className="min-w-52 flex-1">
                <h3 className="font-display text-base text-gold-300">
                  {t("character.hub.builderTitle")}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-parchment-300">
                  {t("character.hub.builderHint")}
                </p>
              </div>
              <Link
                href="/characters/new"
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm bg-gold-500 px-4 py-2 text-sm font-bold text-ink-900 transition hover:bg-gold-400 active:translate-y-px focus-visible:outline-2 focus-visible:outline-gold-400"
              >
                {t("character.hub.builderButton")}
              </Link>
            </div>
          </Card>

          <p className="text-xs text-parchment-500">{t("character.hub.quickHint")}</p>

          {/* No membership required, which is the whole point: a player who has
              not been handed a join code yet can still make the character they
              turned up to make. */}
          <Card>
            <h3 className="mb-3 font-display text-base text-gold-300">
              {t("character.roster.createTitle")}
            </h3>
            <form action={createUnboundCharacter} className="flex flex-wrap items-end gap-3">
              <IconQuill size={22} className="mb-2 shrink-0 text-gold-400" />
              <label className="block min-w-44 flex-1">
                <Label>{t("character.hub.nameLabel")}</Label>
                <Input name="name" required placeholder={t("character.hub.namePh")} />
              </label>
              <Button type="submit">{t("character.roster.createButton")}</Button>
            </form>
            <p className="mt-2 text-xs text-parchment-500">{t("character.roster.createHint")}</p>
          </Card>

          <Card>
            <h3 className="mb-3 font-display text-base text-gold-300">
              {t("character.hub.createInCampaign")}
            </h3>
            {sittable.length === 0 ? (
              <p className="text-sm text-parchment-500">
                {t("character.hub.noCampaigns")}{" "}
                <Link href="/dashboard" className="text-gold-300 underline hover:text-gold-400">
                  {t("character.hub.toDashboard")}
                </Link>
              </p>
            ) : (
              <>
                <form action={createCharacter} className="flex flex-wrap items-end gap-3">
                  <label className="block min-w-44 flex-1">
                    <Label>{t("character.hub.nameLabel")}</Label>
                    <Input name="name" required placeholder={t("character.hub.namePh")} />
                  </label>
                  <label className="block min-w-44 flex-1">
                    <Label>{t("character.hub.campaignLabel")}</Label>
                    {/* The same list the roster's picker reads, and for the
                        same reason: createCharacter admits anyone who may
                        participate, which is the players *and* the DM. */}
                    <Select name="campaignId">
                      {sittable.map((campaign) => (
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
              </>
            )}
          </Card>
        </section>
      </main>
    </>
  );
}

/**
 * One character read at a glance: face, name, what they are, and the three
 * numbers a player checks before opening anything. Both piles draw the same
 * face — the difference is what hangs underneath it, which is what `children`
 * is for, and whether the name has to carry the link on its own.
 */
function CharacterFace({
  character,
  gear,
  href,
  t,
  aside,
  children,
}: {
  character: Character;
  gear: WornSet;
  /** Set when the card cannot be a link itself, so the name becomes one. */
  href?: string;
  t: T;
  /** A control that belongs to the row rather than under it — the delete knob. */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const pp = hasScores(character)
    ? statBlock(character, gear.bonuses).passivePerception
    : null;
  const ac = effectiveAc(character, gear.worn, gear.bonuses);
  const name = (
    <h3 className="font-display text-lg font-bold text-parchment-100">{character.name}</h3>
  );
  return (
    <div className="flex items-start gap-3">
      <Portrait
        src={portraitSrc(character.id, character.imageFile)}
        alt={character.name}
        size={40}
        className="mt-0.5"
        fallbackSrc={classArtThumbFor(character.klass)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {href ? (
            <Link href={href} className="transition hover:text-gold-300">
              {name}
            </Link>
          ) : (
            name
          )}
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
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}
