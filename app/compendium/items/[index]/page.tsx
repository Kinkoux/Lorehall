import { notFound } from "next/navigation";
import { and, asc, eq, or } from "drizzle-orm";
import { db, characters, campaigns, users } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { getItem, localizedItemName, srdItemBonuses } from "@/lib/srd-data";
import { parseStatBonuses } from "@/lib/world-items";
import { addItemToCharacter } from "@/lib/compendium-actions";
import { categoryArt } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import { ItemIcon } from "@/components/Icons";
import { BackLink, Button, Card, Input, Label, Select } from "@/components/ui";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ index: string }>;
}) {
  const user = await getCurrentUser();
  const { t, locale } = await getT();
  const { index } = await params;
  const item = getItem(index);
  if (!item) notFound();
  const name = localizedItemName(item, locale);

  /**
   * Where this item could go: my own sheets, plus every sheet at a table I
   * run. `addItemToCharacter` has always accepted both — the picker was the
   * half that only ever offered mine, so a DM reading the compendium had to
   * walk to the campaign page to hand anything over. One `or` over the join
   * covers both without a second query, and without duplicates: a character
   * of mine in a campaign of mine still matches one row, not two.
   */
  const myCharacters = user
    ? await db
        .select({ character: characters, campaign: campaigns, owner: users })
        .from(characters)
        .innerJoin(campaigns, eq(characters.campaignId, campaigns.id))
        .innerJoin(users, eq(characters.userId, users.id))
        .where(
          and(
            eq(characters.approval, "approved"),
            or(eq(characters.userId, user.id), eq(campaigns.dmUserId, user.id))
          )
        )
        .orderBy(asc(campaigns.name), asc(characters.name))
    : [];

  // The bonus this page advertises is the one the sheet will actually count —
  // read off the same snapshot the "add to a character" button writes, rather
  // than off the prose a second time. A conditional bonus (bracers of defense,
  // an arrow-catching shield) therefore states itself in the description only,
  // instead of promising a number no character ever receives.
  const acBonus = parseStatBonuses(srdItemBonuses(item)).ac ?? null;
  const facts: Array<[string, string | null]> = [
    [t("compendium.items.cost"), item.cost],
    [t("compendium.items.weight"), item.weight != null ? `${item.weight} lb.` : null],
    [t("compendium.items.rarity"), item.rarity],
    [t("compendium.items.armorClass"), item.ac],
    [t("compendium.items.magicBonus"), acBonus ? `+${acBonus} AC` : null],
    [t("compendium.items.minStrength"), item.strMin != null ? `Str ${item.strMin}` : null],
    [
      t("compendium.items.stealth"),
      item.stealth ? t("compendium.items.stealthDisadvantage") : null,
    ],
    [t("compendium.items.damage"), item.damage],
    [t("compendium.items.twoHanded"), item.twoHanded],
    [t("compendium.items.range"), item.range],
    [t("compendium.items.thrown"), item.thrown],
    [t("compendium.items.properties"), item.properties],
    [t("compendium.items.speed"), item.speed],
    [t("compendium.items.capacity"), item.capacity],
    [t("compendium.items.contents"), item.contents],
  ].filter(([, value]) => value) as Array<[string, string]>;

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <BackLink href="/compendium/items">{t("compendium.items.title")}</BackLink>
        <div className="mt-2 mb-6 flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <ItemIcon category={item.category} size={30} className="shrink-0 text-blood-400" />
              <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
                {name}
              </h1>
            </div>
            {/* The subtitle carries the SRD's own name when the heading is a
                translation: the description below is in that language, and so
                is every other book on the table. */}
            <p className="mt-1 text-sm italic text-parchment-500">
              {[
                name !== item.name ? item.name : null,
                t(`compendium.items.categories.${item.category}`),
                item.sub,
                item.attunement ? t("compendium.items.attunement") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {/* A category plate, not a picture of this item — the compendium has
              no per-item art. Ours, so no caption. */}
          <figure className="w-24 shrink-0 sm:w-28">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={categoryArt(item.category)}
              alt=""
              className="w-full rounded-sm border border-ink-600 object-cover"
            />
          </figure>
        </div>

        {facts.length > 0 && (
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
        )}

        {item.desc ? (
          <div className="whitespace-pre-wrap leading-relaxed text-parchment-100">{item.desc}</div>
        ) : (
          <p className="text-sm italic text-parchment-500">{t("compendium.items.noDesc")}</p>
        )}

        {myCharacters.length > 0 && (
          <Card className="mt-8">
            <h3 className="mb-3 font-display text-base text-gold-300">
              {t("compendium.items.addToSheet")}
            </h3>
            <form
              action={addItemToCharacter.bind(null, item.index)}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="block">
                <Label>{t("compendium.items.character")}</Label>
                <Select name="characterId" className="!w-64">
                  {myCharacters.map(({ character, campaign, owner }) => (
                    <option key={character.id} value={character.id}>
                      {/* Someone else's sheet is named by its player too —
                          two tables can each have a Vex. */}
                      {[
                        character.name,
                        campaign.name,
                        character.userId === user?.id
                          ? null
                          : (owner.displayName ?? owner.username),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block w-20">
                <Label>{t("compendium.items.qty")}</Label>
                <Input name="qty" type="number" min={1} max={999} defaultValue={1} />
              </label>
              <Button type="submit">{t("common.add")}</Button>
            </form>
            <p className="mt-2 text-xs text-parchment-500">{t("compendium.items.addNote")}</p>
          </Card>
        )}
      </main>
    </>
  );
}
