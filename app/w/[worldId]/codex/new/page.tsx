import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, worlds } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { getWorldMembership, hasDmPowers } from "@/lib/perms";
import { SiteHeader } from "@/components/SiteHeader";
import { CodexEntryForm } from "@/components/CodexEntryForm";
import { BackLink, Card } from "@/components/ui";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("world.newEntry.title") };
}

export default async function NewCodexEntryPage({
  params,
}: {
  params: Promise<{ worldId: string }>;
}) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const { worldId } = await params;

  const world = await db.query.worlds.findFirst({ where: eq(worlds.id, worldId) });
  if (!world) notFound();
  if (!(await getWorldMembership(worldId, user.id))) notFound();

  // Codex writing is DM-only; players get a 404, same as other DM pages.
  const dmPowers = await hasDmPowers(worldId, user.id);
  if (!dmPowers) notFound();

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <BackLink href={`/w/${worldId}`}>{world.name}</BackLink>
        <h1 className="mt-2 mb-6 font-display text-2xl font-bold tracking-wide text-parchment-100">
          {t("world.newEntry.title")}
        </h1>
        <Card>
          <CodexEntryForm worldId={worldId} canSetDmOnly={dmPowers} locale={locale} />
        </Card>
      </main>
    </>
  );
}
