import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, characters, campaignMembers, users } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { CharacterSheetBody, SheetForm } from "@/components/character/CharacterSheetBody";
import { loadSheetRows } from "@/components/character/sheet-data";
import { BackLink, Card } from "@/components/ui";

/**
 * A character sheet as read at the table it belongs to.
 *
 * The sheet itself — scores, backpack, slots, the lot — is drawn by
 * CharacterSheetBody, which the roster route draws too. What lives here is
 * everything that only makes sense with a campaign around it: who is allowed
 * to look, which of a player's several sheets is on screen, and the tabs for
 * switching between them.
 */
export default async function CharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string; userId: string }>;
  searchParams: Promise<{ ch?: string }>;
}) {
  const viewer = await requireUser();
  const { t, locale } = await getT();
  const { campaignId, userId } = await params;
  const { ch } = await searchParams;

  const access = await getCampaignAccess(campaignId, viewer.id);
  if (!access?.canView) notFound();
  const owner = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!owner) notFound();
  // The sheet route is campaign-scoped: any user id would otherwise render a
  // page naming a stranger who has nothing to do with this table.
  if (userId !== access.campaign.dmUserId) {
    const atThisTable = await db.query.campaignMembers.findFirst({
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    if (!atThisTable) notFound();
  }

  const editable = viewer.id === userId || access.isDm;
  const allCharacters = await db
    .select()
    .from(characters)
    .where(and(eq(characters.campaignId, campaignId), eq(characters.userId, userId)))
    .orderBy(asc(characters.updatedAt));
  // Pending sheets are private to their owner and the DM.
  const visibleCharacters = allCharacters.filter(
    (c) => c.approval === "approved" || editable
  );
  const character =
    (ch ? visibleCharacters.find((c) => c.id === ch) : undefined) ??
    visibleCharacters.find((c) => c.approval === "approved") ??
    visibleCharacters[0];

  const { items, abilities, spellSlots } = character
    ? await loadSheetRows(character.id)
    : { items: [], abilities: [], spellSlots: [] };

  const ownerName = owner.displayName ?? owner.username;

  return (
    <>
      <SiteHeader user={viewer} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <BackLink href={`/c/${campaignId}`}>{access.campaign.name}</BackLink>

        {!character ? (
          <div className="mt-6">
            <h1 className="mb-2 font-display text-2xl font-bold tracking-wide text-parchment-100">
              {editable
                ? t("character.sheet.createTitle")
                : t("character.sheet.noCharacterYet", { name: ownerName })}
            </h1>
            {editable ? (
              <Card className="mt-4">
                <SheetForm campaignId={campaignId} userId={userId} t={t} />
              </Card>
            ) : (
              <p className="text-parchment-500">{t("character.sheet.checkBackLater")}</p>
            )}
          </div>
        ) : (
          <>
            {visibleCharacters.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {visibleCharacters.map((c) => (
                  <Link
                    key={c.id}
                    href={`/c/${campaignId}/ch/${userId}?ch=${c.id}`}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      c.id === character.id
                        ? "border-gold-500 bg-gold-500/15 text-gold-300"
                        : "border-ink-600 text-parchment-500 hover:border-gold-500 hover:text-gold-300"
                    }`}
                  >
                    {c.name}
                    {c.approval === "pending" && ` · ${t("character.sheet.pendingTab")}`}
                  </Link>
                ))}
              </div>
            )}

            <CharacterSheetBody
              character={character}
              items={items}
              abilities={abilities}
              spellSlots={spellSlots}
              campaignId={campaignId}
              editable={editable}
              isDm={access.isDm}
              ownerName={ownerName}
              t={t}
              locale={locale}
            />
          </>
        )}
      </main>
    </>
  );
}
