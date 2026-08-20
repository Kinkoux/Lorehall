import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, characters, campaigns } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { getSpell } from "@/lib/srd-data";
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
  const user = await getCurrentUser();
  const { t } = await getT();
  const { index } = await params;
  const spell = getSpell(index);
  if (!spell) notFound();

  const myCharacters = user
    ? await db
        .select({ character: characters, campaign: campaigns })
        .from(characters)
        .innerJoin(campaigns, eq(characters.campaignId, campaigns.id))
        .where(eq(characters.userId, user.id))
    : [];

  const facts: Array<[string, string]> = [
    [t("compendium.spells.castingTime"), spell.castingTime],
    [t("compendium.spells.range"), spell.range],
    [t("compendium.spells.components"), spell.components],
    [
      t("compendium.spells.duration"),
      spell.duration + (spell.concentration ? ` (${t("compendium.spells.concentration")})` : ""),
    ],
    [t("compendium.spells.classes"), spell.classes.join(", ")],
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

        <div className="whitespace-pre-wrap leading-relaxed text-parchment-100">{spell.desc}</div>
        {spell.higherLevel && (
          <p className="mt-4 whitespace-pre-wrap leading-relaxed text-parchment-100">
            <strong className="text-gold-300">{t("compendium.spells.higherLevels")} </strong>
            {spell.higherLevel}
          </p>
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
                    {character.name} · {campaign.name}
                  </Button>
                </form>
              ))}
            </div>
            <p className="mt-2 text-xs text-parchment-500">{t("compendium.spells.addNote")}</p>
          </Card>
        )}
      </main>
    </>
  );
}
