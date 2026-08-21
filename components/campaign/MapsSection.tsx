import Link from "next/link";
import type { CampaignMap } from "@/lib/db";
import { deleteMap, setActiveMap, setMapVisibility } from "@/lib/map-actions";
import type { Locale, T } from "@/lib/i18n";
import { EMPTY_ART } from "@/lib/ui-art";
import { IconX } from "@/components/Icons";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MapUploadForm } from "@/components/MapUploadForm";
import { Card, DmBadge, SectionTitle } from "@/components/ui";
import { SmallButton } from "./shared";

export function MapsSection({
  maps,
  campaignId,
  isDm,
  locale,
  t,
}: {
  maps: CampaignMap[];
  campaignId: string;
  isDm: boolean;
  locale: Locale;
  t: T;
}) {
  const visibleMaps = isDm ? maps : maps.filter((m) => m.visibility === "everyone");

  return (
    <section id="maps" className="mt-10 scroll-mt-28 space-y-4">
      <SectionTitle>{t("campaign.maps.title")}</SectionTitle>
      {isDm && <p className="-mt-2 text-xs text-parchment-500">{t("campaign.maps.hint")}</p>}
      {visibleMaps.length === 0 && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EMPTY_ART.maps}
            alt=""
            loading="lazy"
            decoding="async"
            className="mx-auto mb-3 w-24 opacity-70"
          />
          <p className="text-sm text-parchment-500">
            {isDm ? t("campaign.maps.emptyDm") : t("campaign.maps.empty")}
          </p>
        </div>
      )}
      {visibleMaps.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleMaps.map((map) => (
            <Card key={map.id} className="!p-3">
              <Link href={`/c/${campaignId}/m/${map.id}`} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/files/maps/${map.id}`}
                  alt={map.title}
                  loading="lazy"
                  decoding="async"
                  className="h-40 w-full rounded-sm border border-ink-700 object-cover transition hover:opacity-90"
                />
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link
                  href={`/c/${campaignId}/m/${map.id}`}
                  className="min-w-0 flex-1 truncate font-display text-sm font-bold text-parchment-100 transition hover:text-gold-300"
                >
                  {map.title}
                </Link>
                {map.isActive === 1 && (
                  <span className="rounded-sm border border-gold-500 bg-gold-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gold-300">
                    {t("campaign.maps.active")}
                  </span>
                )}
                {map.visibility === "dm" && <DmBadge label={t("campaign.maps.dmOnly")} />}
              </div>
              {isDm && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-ink-700 pt-2">
                  <form action={setActiveMap.bind(null, map.id, map.isActive !== 1)}>
                    <SmallButton
                      label={
                        map.isActive === 1
                          ? t("campaign.maps.clearActive")
                          : t("campaign.maps.setActive")
                      }
                    />
                  </form>
                  <form
                    action={setMapVisibility.bind(
                      null,
                      map.id,
                      map.visibility === "dm" ? "everyone" : "dm"
                    )}
                  >
                    <SmallButton
                      label={
                        map.visibility === "dm"
                          ? t("campaign.maps.reveal")
                          : t("campaign.maps.hide")
                      }
                    />
                  </form>
                  <ConfirmButton
                    label={<IconX size={12} />}
                    confirmLabel={t("common.confirm.yesDelete")}
                    warnText={t("common.confirm.areYouSure")}
                    action={deleteMap.bind(null, map.id)}
                    danger
                    group="map-delete"
                    ariaLabel={t("common.delete")}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {isDm && (
        <Card>
          <h3 className="mb-3 font-display text-base text-gold-300">
            {t("campaign.maps.addHeading")}
          </h3>
          <MapUploadForm campaignId={campaignId} locale={locale} />
        </Card>
      )}
    </section>
  );
}
