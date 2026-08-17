import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, codexEntries, users, worlds } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { canEditEntry, getWorldMembership, hasDmPowers } from "@/lib/perms";
import { deleteCodexEntry } from "@/lib/actions";
import { SiteHeader } from "@/components/SiteHeader";
import { CodexEntryForm } from "@/components/CodexEntryForm";
import { BackLink, Card, DmBadge, GhostButton, TypeBadge } from "@/components/ui";

export default async function CodexEntryPage({
  params,
}: {
  params: Promise<{ worldId: string; entryId: string }>;
}) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const { worldId, entryId } = await params;

  const world = await db.query.worlds.findFirst({ where: eq(worlds.id, worldId) });
  if (!world) notFound();
  if (!(await getWorldMembership(worldId, user.id))) notFound();

  const entry = await db.query.codexEntries.findFirst({ where: eq(codexEntries.id, entryId) });
  if (!entry || entry.worldId !== worldId) notFound();

  const dmPowers = await hasDmPowers(worldId, user.id);
  if (entry.visibility === "dm" && !dmPowers) notFound();

  const editable = await canEditEntry(entry, user.id);
  const author = await db.query.users.findFirst({ where: eq(users.id, entry.createdBy) });

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <BackLink href={`/w/${worldId}`}>{world.name}</BackLink>

        <div className="mt-2 mb-6 flex flex-wrap items-center gap-3">
          <TypeBadge type={entry.type} locale={locale} />
          {entry.visibility === "dm" && <DmBadge label={t("world.entry.dmOnlyBadge")} />}
        </div>
        <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
          {entry.title}
        </h1>
        <p className="mt-1 text-xs text-parchment-500">
          {t("world.entry.byline", {
            name: author?.displayName ?? author?.username ?? t("world.entry.unknownAuthor"),
            date: new Date(entry.updatedAt).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB"),
          })}
        </p>

        <Card className="mt-6">
          {entry.body ? (
            <p className="whitespace-pre-wrap leading-relaxed text-parchment-100">{entry.body}</p>
          ) : (
            <p className="text-sm italic text-parchment-500">{t("world.entry.emptyBody")}</p>
          )}
        </Card>

        {editable && (
          <details className="mt-8 group">
            <summary className="cursor-pointer font-display text-sm uppercase tracking-wide text-gold-300 hover:text-gold-400">
              {t("world.entry.edit")}
            </summary>
            <Card className="mt-4">
              <CodexEntryForm
                worldId={worldId}
                entry={entry}
                canSetDmOnly={dmPowers}
                locale={locale}
              />
              <form action={deleteCodexEntry.bind(null, entry.id)} className="mt-6 border-t border-ink-700 pt-4">
                <GhostButton type="submit" className="!border-blood-500 !text-blood-400 hover:!text-blood-400">
                  {t("world.entry.delete")}
                </GhostButton>
              </form>
            </Card>
          </details>
        )}
      </main>
    </>
  );
}
