import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, campaignMaps } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getT } from "@/lib/locale";
import { SiteHeader } from "@/components/SiteHeader";
import { MapViewer } from "@/components/MapViewer";
import { BackLink, DmBadge } from "@/components/ui";

export default async function MapPage({
  params,
}: {
  params: Promise<{ campaignId: string; mapId: string }>;
}) {
  const user = await requireUser();
  const { t } = await getT();
  const { campaignId, mapId } = await params;

  const access = await getCampaignAccess(campaignId, user.id);
  if (!access?.canView) notFound();

  const map = await db.query.campaignMaps.findFirst({ where: eq(campaignMaps.id, mapId) });
  if (!map || map.campaignId !== campaignId) notFound();
  if (map.visibility === "dm" && !access.isDm) notFound();

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <BackLink href={`/c/${campaignId}`}>{access.campaign.name}</BackLink>

        <div className="mt-2 mb-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-wide text-parchment-100">
            {map.title}
          </h1>
          {map.isActive === 1 && (
            <span className="rounded-sm border border-gold-500 bg-gold-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-300">
              {t("campaign.maps.active")}
            </span>
          )}
          {map.visibility === "dm" && <DmBadge label={t("campaign.maps.dmOnly")} />}
        </div>

        <MapViewer
          src={`/files/maps/${map.id}`}
          alt={map.title}
          className="h-[75vh] w-full"
          labels={{
            zoomIn: t("campaign.maps.viewer.zoomIn"),
            zoomOut: t("campaign.maps.viewer.zoomOut"),
            reset: t("campaign.maps.viewer.reset"),
            fullscreen: t("campaign.maps.viewer.fullscreen"),
          }}
        />
      </main>
    </>
  );
}
