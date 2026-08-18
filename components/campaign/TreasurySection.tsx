import { partyItems, partyLedger, type User } from "@/lib/db";
import { addLedgerEntry, addPartyItem, adjustPartyItemQty } from "@/lib/quest-actions";
import type { Locale, T } from "@/lib/i18n";
import { Button, Card, Input, Label, SectionTitle } from "@/components/ui";
import { SmallButton } from "./shared";

type LedgerRow = { entry: typeof partyLedger.$inferSelect; user: User | null };
type LootItem = typeof partyItems.$inferSelect;

export function TreasurySection({
  ledger,
  loot,
  campaignId,
  locale,
  t,
}: {
  ledger: LedgerRow[];
  loot: LootItem[];
  campaignId: string;
  locale: Locale;
  t: T;
}) {
  const gold = ledger.reduce((sum, { entry }) => sum + entry.amount, 0);

  return (
    <>
      <SectionTitle>{t("campaign.treasury.title")}</SectionTitle>
      <Card>
        <p className="font-display text-3xl font-bold text-gold-400">
          {t("campaign.treasury.gold", {
            n: gold.toLocaleString(locale === "tr" ? "tr-TR" : "en-US"),
          })}
        </p>
        <form
          action={addLedgerEntry.bind(null, campaignId)}
          className="mt-3 flex flex-wrap gap-2"
        >
          <Input
            name="amount"
            type="number"
            required
            placeholder="+50 / -5"
            className="!w-24"
          />
          <Input name="reason" required placeholder={t("campaign.treasury.reasonPh")} />
          <Button type="submit" className="shrink-0">
            {t("campaign.treasury.log")}
          </Button>
        </form>
        {ledger.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-ink-700 pt-3">
            {ledger.slice(0, 6).map(({ entry, user: actor }) => (
              <li key={entry.id} className="flex justify-between gap-3 text-sm">
                <span className="text-parchment-300">
                  {entry.reason}
                  <span className="ml-1 text-[11px] text-parchment-500">
                    {actor ? `· ${actor.displayName ?? actor.username}` : ""}
                  </span>
                </span>
                <span
                  className={`font-mono font-bold ${
                    entry.amount >= 0 ? "text-emerald-700" : "text-blood-400"
                  }`}
                >
                  {entry.amount >= 0 ? `+${entry.amount}` : entry.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-ink-700 pt-3">
          <Label>{t("campaign.treasury.loot")}</Label>
          {loot.length === 0 && (
            <p className="mt-1 text-sm text-parchment-500">
              {t("campaign.treasury.nothing")}
            </p>
          )}
          <ul className="mt-1 space-y-1.5">
            {loot.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-parchment-100">
                  {item.name}
                  {item.qty > 1 && (
                    <span className="ml-1 text-parchment-500">×{item.qty}</span>
                  )}
                  {item.notes && (
                    <span className="ml-1 text-xs text-parchment-500">— {item.notes}</span>
                  )}
                </span>
                <form action={adjustPartyItemQty.bind(null, item.id, -1)}>
                  <SmallButton label="−" />
                </form>
                <form action={adjustPartyItemQty.bind(null, item.id, 1)}>
                  <SmallButton label="+" />
                </form>
              </li>
            ))}
          </ul>
          <form
            action={addPartyItem.bind(null, campaignId)}
            className="mt-2 flex gap-2"
          >
            <Input name="name" required placeholder={t("campaign.treasury.itemPh")} />
            <Input name="qty" type="number" min={1} defaultValue={1} className="!w-16" />
            <Button type="submit" className="shrink-0">
              {t("common.add")}
            </Button>
          </form>
        </div>
      </Card>
    </>
  );
}
