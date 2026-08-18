import Link from "next/link";
import type { CampaignEvent, User } from "@/lib/db";
import { renderCampaignEvent } from "@/lib/campaign-log";
import type { Locale, T } from "@/lib/i18n";
import { IconChest, IconChevron, IconCoin, IconFlask, IconParty, IconQuill, IconScroll } from "@/components/Icons";
import { Card, SectionTitle } from "@/components/ui";

type FeedKind = CampaignEvent["kind"];
type FeedRow = { event: CampaignEvent; user: User | null };

/** Feed filter chips → the event kinds each one lets through. */
export const FEED_FILTERS: Record<string, FeedKind[]> = {
  gold: ["gold"],
  items: ["item", "loot"],
  sheets: ["sheet", "ability"],
  characters: ["character", "status"],
};
const FEED_CHIPS = [
  { key: "gold", label: "campaign.feed.fGold" },
  { key: "items", label: "campaign.feed.fItems" },
  { key: "sheets", label: "campaign.feed.fSheets" },
  { key: "characters", label: "campaign.feed.fCharacters" },
] as const;
const FEED_ICONS: Record<FeedKind, (props: { size?: number; className?: string }) => React.ReactElement> = {
  sheet: IconQuill,
  item: IconChest,
  loot: IconChest,
  ability: IconFlask,
  gold: IconCoin,
  character: IconParty,
  status: IconParty,
};
/** Below this many entries the change log opens on its own. */
const FEED_OPEN_UNDER = 10;

export function ChangeFeedSection({
  feedEvents,
  activeFeed,
  campaignId,
  locale,
  t,
}: {
  feedEvents: FeedRow[];
  activeFeed: string | null;
  campaignId: string;
  locale: Locale;
  t: T;
}) {
  // Same locale tags the rest of the page uses; day + clock, since a change log
  // is mostly read as "what happened since last session".
  const feedStamp = (ms: number) =>
    new Date(ms).toLocaleString(locale === "tr" ? "tr-TR" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <details
      id="changelog"
      // Short logs sit open; a long one folds away so the page doesn't
      // grow — but a filtered view always opens, or the chip you just
      // clicked would answer into a closed drawer.
      open={feedEvents.length < FEED_OPEN_UNDER || Boolean(activeFeed)}
      className="group mt-10"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <IconChevron
          size={14}
          className="shrink-0 text-blood-400 transition-transform group-open:rotate-90"
        />
        <div className="min-w-0 flex-1">
          <SectionTitle>
            {t("campaign.feed.title")}
            <span className="ml-2 text-[11px] font-semibold normal-case tracking-normal text-parchment-500">
              {feedEvents.length === 1
                ? t("campaign.feed.countOne", { n: feedEvents.length })
                : t("campaign.feed.countMany", { n: feedEvents.length })}
            </span>
          </SectionTitle>
        </div>
      </summary>

      <div className="mt-4 space-y-4">
        <p className="text-xs text-parchment-500">{t("campaign.feed.hint")}</p>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            href={`/c/${campaignId}#changelog`}
            active={!activeFeed}
            label={t("campaign.feed.all")}
          />
          {FEED_CHIPS.map((chip) => (
            <FilterChip
              key={chip.key}
              href={`/c/${campaignId}?feed=${chip.key}#changelog`}
              active={activeFeed === chip.key}
              label={t(chip.label)}
            />
          ))}
        </div>
        <Card>
          {feedEvents.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-parchment-500">
              <IconScroll size={24} />
              <p className="text-sm">{t("campaign.feed.empty")}</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {feedEvents.map(({ event, user: actor }, index) => {
                const rendered = renderCampaignEvent(event.message, t);
                const Icon = FEED_ICONS[event.kind];
                return (
                  <li
                    key={event.id}
                    className={`flex items-start gap-2 rounded-sm px-1 py-1 text-sm leading-snug ${
                      index % 2 === 1 ? "bg-ink-800/30" : ""
                    }`}
                  >
                    <Icon
                      size={14}
                      className={`mt-0.5 shrink-0 ${
                        event.kind === "gold" ? "text-gold-400" : "text-parchment-500"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="mr-1 text-gold-300">
                        {actor?.displayName ?? actor?.username ?? t("campaign.feed.someone")}
                      </strong>
                      <span className="text-parchment-300">{rendered.text}</span>
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] text-parchment-500">
                      {feedStamp(event.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </details>
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
