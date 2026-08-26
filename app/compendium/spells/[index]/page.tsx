import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, characters, campaigns } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { spellAliases, spellRef } from "@/lib/srd-data";
import { addSpellToCharacter } from "@/lib/compendium-actions";
import { schoolArt } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import { SchoolSigil } from "@/components/Icons";
import { BackLink, Button, Card } from "@/components/ui";

export default async function SpellPage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  // The lookup before any await that can suspend: once a fallback renders the
  // headers are gone, and a spell that does not exist would answer 200 with a
  // not-found page streamed into it. `spellRef` reads JSON already in memory,
  // so the verdict costs nothing and arrives while the status is still ours —
  // and it is the verdict for both shelves, so an invented `x-` index is a 404
  // by the same rule an invented SRD one is.
  const { index } = await params;
  const entry = spellRef(index);
  if (!entry) notFound();
  const spell = entry.spell;
  // The whole of the difference below: a book we may reprint, or a book we may
  // only point at. Held as the source abbreviation so every line that mentions
  // it can name it.
  const source = entry.kind === "extra" ? entry.spell.source : null;

  const user = await getCurrentUser();
  const { t } = await getT();

  // LEFT, so a character on the player's roster is offered the spell too: the
  // SRD is the same book whether or not anyone is running the sheet yet, and
  // an inner join here would have quietly made the compendium table-only.
  const myCharacters = user
    ? await db
        .select({ character: characters, campaign: campaigns })
        .from(characters)
        .leftJoin(campaigns, eq(characters.campaignId, campaigns.id))
        .where(eq(characters.userId, user.id))
    : [];

  // The names a printed book gives this entry, where the SRD dropped a wizard's
  // name off the front of it. Empty for a fact stub, which is already printed
  // under the name it is filed by.
  const aliases = spellAliases(spell.index);

  const facts: Array<[string, string]> = [
    [t("compendium.spells.castingTime"), spell.castingTime],
    [t("compendium.spells.range"), spell.range],
    [t("compendium.spells.components"), spell.components],
    [
      t("compendium.spells.duration"),
      spell.duration + (spell.concentration ? ` (${t("compendium.spells.concentration")})` : ""),
    ],
    [t("compendium.spells.classes"), spell.classes.join(", ")],
    ...(source
      ? ([[t("compendium.spells.source"), t(`compendium.spells.sources.${source}`)]] as Array<
          [string, string]
        >)
      : []),
  ];

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <BackLink href="/compendium/spells">{t("compendium.spells.title")}</BackLink>
        <div className="mt-2 mb-6 flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <SchoolSigil school={spell.school} size={30} className="shrink-0 text-blood-400" />
              <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
                {spell.name}
              </h1>
            </div>
            <p className="mt-1 text-sm italic text-parchment-500">
              {spell.level === 0
                ? t("compendium.spells.cantrip")
                : `${t("compendium.spells.level")} ${spell.level}`}{" "}
              · {spell.school}
              {spell.ritual && ` (${t("compendium.spells.ritual")})`}
            </p>
            {aliases.length > 0 && (
              // The name on the character sheet somebody is holding: the SRD
              // strips the wizards' names out of these titles, and a reader who
              // only knows the printed one should see it said here.
              <p className="mt-1 text-xs text-parchment-500">
                {t("compendium.spells.alsoPrintedAs", { names: aliases.join(", ") })}
              </p>
            )}
          </div>
          {/* The school plate is ours, so unlike a monster's photo it carries no
              caption. */}
          <figure className="w-24 shrink-0 sm:w-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={schoolArt(spell.school)}
              alt=""
              className="w-full rounded-sm border border-ink-600 object-cover"
            />
          </figure>
        </div>

        <Card className="mb-6">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label} className="text-sm">
                <dt className="inline font-bold text-gold-300">{label}: </dt>
                <dd className="inline text-parchment-100">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {entry.kind === "srd" ? (
          <>
            <div className="whitespace-pre-wrap leading-relaxed text-parchment-100">
              {entry.spell.desc}
            </div>
            {entry.spell.higherLevel && (
              <p className="mt-4 whitespace-pre-wrap leading-relaxed text-parchment-100">
                <strong className="text-gold-300">{t("compendium.spells.higherLevels")} </strong>
                {entry.spell.higherLevel}
              </p>
            )}
          </>
        ) : (
          // Where the prose would be, the reason there is none. This is the
          // whole bargain of the fact stubs stated in plain words: the header
          // above is a fact and belongs to nobody, the text is expression and
          // belongs to the book, and the reader owns the book.
          <Card className="border-gold-500/25">
            <h2 className="font-display text-base text-gold-300">
              {t("compendium.spells.notInSrd")}
            </h2>
            <p className="mt-2 leading-relaxed text-parchment-100">
              {t("compendium.spells.notInSrdBody", {
                source: t(`compendium.spells.sources.${source}`),
              })}
            </p>
          </Card>
        )}

        {myCharacters.length > 0 && (
          <Card className="mt-8">
            <h3 className="mb-3 font-display text-base text-gold-300">
              {t("compendium.spells.addToSheet")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {myCharacters.map(({ character, campaign }) => (
                <form
                  key={character.id}
                  action={addSpellToCharacter.bind(null, spell.index, character.id)}
                >
                  <Button type="submit">
                    {character.name} · {campaign?.name ?? t("character.roster.label")}
                  </Button>
                </form>
              ))}
            </div>
            <p className="mt-2 text-xs text-parchment-500">
              {entry.kind === "extra"
                ? t("compendium.spells.addNoteExtra")
                : t("compendium.spells.addNote")}
            </p>
          </Card>
        )}
      </main>
    </>
  );
}
