import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, campaignMaps } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCampaignAccess } from "@/lib/perms";
import { getT } from "@/lib/locale";
import { setMapGrid } from "@/lib/map-actions";
import { SiteHeader } from "@/components/SiteHeader";
import { MapViewer } from "@/components/MapViewer";
import { BackLink, Button, Card, DmBadge, Input, Label } from "@/components/ui";

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
          grid={
            map.gridSize
              ? {
                  size: map.gridSize,
                  offsetX: map.gridOffsetX ?? 0,
                  offsetY: map.gridOffsetY ?? 0,
                }
              : null
          }
          labels={{
            zoomIn: t("campaign.maps.viewer.zoomIn"),
            zoomOut: t("campaign.maps.viewer.zoomOut"),
            reset: t("campaign.maps.viewer.reset"),
            fullscreen: t("campaign.maps.viewer.fullscreen"),
          }}
        />

        {access.isDm && (
          <Card className="mt-6">
            <h2 className="mb-1 font-display text-base text-gold-300">
              {t("campaign.maps.grid.heading")}
            </h2>
            <p className="mb-4 text-xs text-parchment-500">{t("campaign.maps.grid.hint")}</p>
            <form action={setMapGrid.bind(null, map.id)} className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-parchment-300">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={Boolean(map.gridSize)}
                  className="accent-[#8a6516]"
                />
                {t("campaign.maps.grid.enable")}
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <Label>{t("campaign.maps.grid.sizeLabel")}</Label>
                  <Input
                    type="number"
                    name="size"
                    min={10}
                    max={1000}
                    step={1}
                    defaultValue={map.gridSize ?? 70}
                  />
                </label>
                <label className="block">
                  <Label>{t("campaign.maps.grid.offsetXLabel")}</Label>
                  <Input
                    type="number"
                    name="offsetX"
                    min={0}
                    max={1000}
                    step={1}
                    defaultValue={map.gridOffsetX ?? 0}
                  />
                </label>
                <label className="block">
                  <Label>{t("campaign.maps.grid.offsetYLabel")}</Label>
                  <Input
                    type="number"
                    name="offsetY"
                    min={0}
                    max={1000}
                    step={1}
                    defaultValue={map.gridOffsetY ?? 0}
                  />
                </label>
              </div>
              <Button type="submit">{t("campaign.maps.grid.save")}</Button>
            </form>
          </Card>
        )}
      </main>
    </>
  );
}
