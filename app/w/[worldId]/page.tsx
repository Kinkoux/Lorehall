import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  worlds,
  campaigns,
  codexEntries,
  worldItems,
  CODEX_TYPES,
  type CodexType,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";
import { getWorldMembership } from "@/lib/perms";
import { createCampaign } from "@/lib/actions";
import { SiteHeader } from "@/components/SiteHeader";
import { ItemLibrarySection } from "@/components/world/ItemLibrarySection";
import {
  BackLink,
  Button,
  Card,
  DmBadge,
  Input,
  Label,
  RoleBadge,
  SectionTitle,
  Textarea,
  TypeBadge,
} from "@/components/ui";

export default async function WorldPage({
  params,
  searchParams,
}: {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const { worldId } = await params;
  const { type } = await searchParams;

  const world = await db.query.worlds.findFirst({ where: eq(worlds.id, worldId) });
  if (!world) notFound();
  const [membership, worldCampaigns, libraryItems] = await Promise.all([
    getWorldMembership(worldId, user.id),
    db
      .select()
      .from(campaigns)
      .where(eq(campaigns.worldId, worldId))
      .orderBy(desc(campaigns.createdAt)),
    // The library is readable by every member; only the controls are gated.
    db.select().from(worldItems).where(eq(worldItems.worldId, worldId)).orderBy(asc(worldItems.name)),
  ]);
  if (!membership) notFound();

  // The campaign list already answers "do I DM anything here?" — no extra queries.
  const dmPowers =
    world.ownerId === user.id || worldCampaigns.some((c) => c.dmUserId === user.id);
  const activeType = (CODEX_TYPES as readonly string[]).includes(type ?? "")
    ? (type as CodexType)
    : null;

  const entryFilters = [eq(codexEntries.worldId, worldId)];
  if (activeType) entryFilters.push(eq(codexEntries.type, activeType));
  if (!dmPowers) entryFilters.push(eq(codexEntries.visibility, "everyone"));

  const entries = await db
    .select()
    .from(codexEntries)
    .where(and(...entryFilters))
    .orderBy(desc(codexEntries.updatedAt));

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <BackLink href="/dashboard">{t("world.backToDashboard")}</BackLink>
        <div className="mt-2 mb-8">
          <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
            {world.name}
          </h1>
          {world.description && <p className="mt-2 text-parchment-500">{world.description}</p>}
        </div>

        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle>{t("world.codex.title")}</SectionTitle>
              {dmPowers && (
                <Link
                  href={`/w/${worldId}/codex/new`}
                  className="rounded-md bg-gold-500 px-3 py-1.5 text-sm font-bold text-ink-950 transition hover:bg-gold-400"
                >
                  {t("world.codex.newEntry")}
                </Link>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterChip href={`/w/${worldId}`} active={!activeType} label={t("world.codex.all")} />
              {CODEX_TYPES.map((ty) => (
                <FilterChip
                  key={ty}
                  href={`/w/${worldId}?type=${ty}`}
                  active={activeType === ty}
                  label={t(`world.codex.types.${ty}`)}
                />
              ))}
            </div>

            {entries.length === 0 && (
              <p className="text-sm text-parchment-500">
                {activeType
                  ? t("world.codex.emptyType")
                  : dmPowers
                    ? t("world.codex.empty")
                    : t("world.codex.emptyPlayer")}
              </p>
            )}
            {entries.map((entry) => (
              <Link key={entry.id} href={`/w/${worldId}/codex/${entry.id}`} className="block">
                <Card className="py-4 transition hover:border-gold-500">
                  <div className="flex items-center gap-3">
                    <TypeBadge type={entry.type} locale={locale} />
                    <h3 className="flex-1 font-display text-base text-parchment-100">{entry.title}</h3>
                    {entry.visibility === "dm" && <DmBadge label={t("world.entry.dmOnlyBadge")} />}
                  </div>
                  {entry.body && (
                    <p className="mt-2 line-clamp-2 text-sm text-parchment-500">{entry.body}</p>
                  )}
                </Card>
              </Link>
            ))}
          </section>

          <section className="space-y-4">
            <SectionTitle>{t("world.campaigns.title")}</SectionTitle>
            {worldCampaigns.length === 0 && (
              <p className="text-sm text-parchment-500">{t("world.campaigns.none")}</p>
            )}
            {worldCampaigns.map((c) => (
              <Link key={c.id} href={`/c/${c.id}`} className="block">
                <Card className="py-4 transition hover:border-gold-500">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-base text-parchment-100">{c.name}</h3>
                    {c.dmUserId === user.id && <RoleBadge role="DM" />}
                  </div>
                </Card>
              </Link>
            ))}

            {/* Only the world's owner opens new tables here — mirrors the
                owner check in createCampaign. */}
            {world.ownerId === user.id && (
              <Card>
                <h3 className="mb-1 font-display text-base text-gold-300">{t("world.campaigns.startTitle")}</h3>
                <p className="mb-3 text-xs text-parchment-500">{t("world.campaigns.startHint")}</p>
                <form action={createCampaign.bind(null, worldId)} className="space-y-3">
                  <label className="block">
                    <Label>{t("world.campaigns.nameLabel")}</Label>
                    <Input name="name" required placeholder={t("world.campaigns.namePlaceholder")} />
                  </label>
                  <label className="block">
                    <Label>{t("world.campaigns.descLabel")}</Label>
                    <Textarea name="description" rows={2} placeholder={t("world.campaigns.descPlaceholder")} />
                  </label>
                  <Button type="submit">{t("world.campaigns.create")}</Button>
                </form>
              </Card>
            )}
          </section>
        </div>

        <ItemLibrarySection
          worldId={worldId}
          items={libraryItems}
          canManage={dmPowers}
          locale={locale}
          t={t}
        />
      </main>
    </>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href as never}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? "border-gold-500 bg-gold-500/15 text-gold-300"
          : "border-ink-600 text-parchment-500 hover:border-gold-500 hover:text-gold-300"
      }`}
    >
      {label}
    </Link>
  );
}
