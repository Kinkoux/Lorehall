import Link from "next/link";
import type { GameSession } from "@/lib/db";
import { startSession } from "@/lib/session-actions";
import type { T } from "@/lib/i18n";
import { IconSwords } from "@/components/Icons";
import { Button, Card, Input } from "@/components/ui";

/**
 * The top-of-page state of play: a live table to jump into, or — for the DM
 * alone — the form that opens the next one. Players with no live session see
 * nothing here.
 */
export function LiveSessionBanner({
  liveSession,
  pastSessionCount,
  campaignId,
  isDm,
  t,
}: {
  liveSession: GameSession | undefined;
  pastSessionCount: number;
  campaignId: string;
  isDm: boolean;
  t: T;
}) {
  if (liveSession) {
    return (
      <Link href={`/s/${liveSession.id}`} className="block">
        <Card className="mb-8 border-emerald-700/60 bg-emerald-100/60 transition hover:-translate-y-0.5 hover:border-emerald-700 hover:shadow-md hover:shadow-[#5e4420]/20">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-600 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-600" />
            </span>
            <div className="flex-1">
              <p className="font-display text-lg font-bold text-emerald-900">
                {t("campaign.live.banner", {
                  title: liveSession.title,
                  round: liveSession.round,
                })}
              </p>
              {/* Full strength, not the 70% a secondary line would normally
                  take: faded to that, the invitation measured 4.0:1 on the
                  banner's tinted card — under AA for text this size, and this
                  is the line that tells a player the table is waiting. */}
              <p className="text-sm text-emerald-900">{t("campaign.live.tap")}</p>
            </div>
            <span className="font-display text-emerald-900">→</span>
          </div>
        </Card>
      </Link>
    );
  }
  if (!isDm) return null;
  return (
    <Card className="mb-8">
      <h3 className="mb-3 font-display text-base text-gold-300">
        {t("campaign.start.heading")}
      </h3>
      <form action={startSession.bind(null, campaignId)} className="flex gap-2">
        <Input
          name="title"
          placeholder={t("campaign.start.placeholder", { n: pastSessionCount + 1 })}
        />
        <Button type="submit" className="shrink-0">
          <IconSwords size={16} /> {t("campaign.start.button")}
        </Button>
      </form>
    </Card>
  );
}
