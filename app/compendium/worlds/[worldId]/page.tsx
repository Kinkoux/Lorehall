import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db, campaigns, characters, worldItems, worlds } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { getWorldMembership } from "@/lib/perms";
import { addWorldItemToCharacter } from "@/lib/world-item-actions";
import { EMPTY_ART } from "@/lib/ui-art";
import { SiteHeader } from "@/components/SiteHeader";
import { WorldItemCardFace } from "@/components/world/WorldItemCardFace";
import { BackLink, Button, Card, Input, Label, Select } from "@/components/ui";

/**
 * One world's library, read from the compendium side: the same shelf the world
 * page shows, minus every control. A player comes here to take a piece the DM
 * forged and put it on their own sheet, which is the one thing the world page
 * never offered them — managing the library stays over there.
 *
 * Three queries, all in flight at once:
 *   1. membership — the gate, and the reason a stranger sees a 404 rather than
 *      a name;
 *   2. the world and its whole library in one left join (the DM-only half is
 *      dropped here, exactly as the world page's section drops it);
 *   3. every campaign of the world, each with this reader's approved character
 *      in it if there is one — which answers both "do I run a table here?"
 *      (and so see the hidden items) and "which sheets can I add to?".
 */
export default async function WorldLibraryPage({
  params,
}: {
  params: Promise<{ worldId: string }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const { worldId } = await params;

  const [membership, libraryRows, campaignRows] = await Promise.all([
    getWorldMembership(worldId, user.id),
    db
      .select({ world: worlds, item: worldItems })
      .from(worlds)
      .leftJoin(worldItems, eq(worldItems.worldId, worlds.id))
      .where(eq(worlds.id, worldId))
      .orderBy(asc(worldItems.name)),
    db
      .select({ campaign: campaigns, character: characters })
      .from(campaigns)
      .leftJoin(
        characters,
        and(
          eq(characters.campaignId, campaigns.id),
          eq(characters.userId, user.id),
          eq(characters.approval, "approved")
        )
      )
      .where(eq(campaigns.worldId, worldId))
      .orderBy(asc(campaigns.name), asc(characters.name)),
  ]);
  // A world nobody let me into and a world that never existed read the same.
  if (!membership || libraryRows.length === 0) notFound();

  const world = libraryRows[0].world;
  // The same answer `hasDmPowers` gives, worked out from rows already fetched.
  const dmPowers =
    world.ownerId === user.id || campaignRows.some((row) => row.campaign.dmUserId === user.id);
  const items = libraryRows
    .map((row) => row.item)
    .filter((item) => item !== null)
    .filter((item) => dmPowers || item.visibility === "everyone");
  // A campaign with no sheet of mine in it left a null on its row.
  const mySheets = campaignRows.flatMap((row) =>
    row.character ? [{ character: row.character, campaign: row.campaign }] : []
  );

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href="/compendium">{t("compendium.title")}</BackLink>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-wide text-parchment-100">
          {world.name}
        </h1>
        <p className="mt-1 text-sm text-parchment-500">{t("compendium.worlds.subtitle")}</p>
        {dmPowers && (
          <p className="mt-1 text-xs text-parchment-500">
            {t("compendium.worlds.manageHint")}{" "}
            <Link href={`/w/${world.id}`} className="font-bold text-gold-300 hover:underline">
              {t("world.items.title")}
            </Link>
          </p>
        )}

        {items.length === 0 ? (
          <div className="mt-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={EMPTY_ART.library}
              alt=""
              loading="lazy"
              decoding="async"
              className="mx-auto mb-3 w-24 opacity-70"
            />
            <p className="text-center text-sm text-parchment-500">
              {t("compendium.worlds.empty")}
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <Card key={item.id} className="!p-3">
                <WorldItemCardFace item={item} t={t} />
                <div className="mt-2 border-t border-ink-700 pt-2">
                  {mySheets.length === 0 ? (
                    <p className="text-xs text-parchment-500">
                      {t("compendium.worlds.noCharacters")}
                    </p>
                  ) : (
                    <form
                      action={addWorldItemToCharacter.bind(null, item.id)}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <label className="block min-w-0 flex-1">
                        <Label>{t("compendium.worlds.character")}</Label>
                        <Select name="characterId">
                          {mySheets.map(({ character, campaign }) => (
                            <option key={character.id} value={character.id}>
                              {/* Two tables in one world can each have a Vex. */}
                              {`${character.name} · ${campaign.name}`}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="block w-16">
                        <Label>{t("compendium.worlds.qty")}</Label>
                        <Input name="qty" type="number" min={1} max={999} defaultValue={1} />
                      </label>
                      <Button type="submit">{t("compendium.worlds.addToCharacter")}</Button>
                    </form>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
