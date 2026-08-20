import Link from "next/link";
import type { GameSession } from "@/lib/db";
import type { Locale, T } from "@/lib/i18n";
import { EMPTY_ART } from "@/lib/ui-art";
import { Card, SectionTitle } from "@/components/ui";

export function JournalSection({
  pastSessions,
  locale,
  t,
}: {
  pastSessions: GameSession[];
  locale: Locale;
  t: T;
}) {
  return (
    <>
      <SectionTitle>{t("campaign.journal.title")}</SectionTitle>
      {pastSessions.length === 0 && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EMPTY_ART.journal}
            alt=""
            loading="lazy"
            decoding="async"
            className="mx-auto mb-3 w-24 opacity-70"
          />
          <p className="text-sm text-parchment-500">{t("campaign.journal.empty")}</p>
        </div>
      )}
      {pastSessions.map((session) => (
        <Link key={session.id} href={`/s/${session.id}`} className="block">
          <Card className="py-4 transition hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-md hover:shadow-[#5e4420]/20">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-base text-parchment-100">{session.title}</h3>
              <span className="text-xs text-parchment-500">
                {new Date(session.startedAt).toLocaleDateString(
                  locale === "tr" ? "tr-TR" : "en-GB"
                )}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 text-sm text-parchment-500">
              {session.recap ?? t("campaign.journal.noRecap")}
            </p>
          </Card>
        </Link>
      ))}
    </>
  );
}
