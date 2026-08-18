import type { WorldItem } from "@/lib/db";
import { deleteWorldItem } from "@/lib/world-item-actions";
import { fmt } from "@/lib/dnd";
import type { Locale, T } from "@/lib/i18n";
import { statBonusEntries, STAT_LABELS } from "@/lib/world-items";
import { IconX, ItemIcon } from "@/components/Icons";
import { Card, GhostButton, SectionTitle } from "@/components/ui";
import { WorldItemForm } from "./WorldItemForm";

/**
 * The world's item library (docs/design-economy.md phase 2). Every member of
 * the world reads it like a private extension of the compendium; forging,
 * editing and retiring are behind `canManage` — the same DM powers the actions
 * check for themselves.
 */
export function ItemLibrarySection({
  worldId,
  items,
  canManage,
  locale,
  t,
}: {
  worldId: string;
  items: WorldItem[];
  canManage: boolean;
  locale: Locale;
  t: T;
}) {
  return (
    <section className="mt-10 space-y-4">
      <SectionTitle>{t("world.items.title")}</SectionTitle>
      {canManage && <p className="-mt-2 text-xs text-parchment-500">{t("world.items.hintDm")}</p>}
      {items.length === 0 && (
        <p className="text-sm text-parchment-500">
          {canManage ? t("world.items.emptyDm") : t("world.items.empty")}
        </p>
      )}
      {items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              worldId={worldId}
              canManage={canManage}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )}
      {canManage && (
        <Card>
          <h3 className="mb-3 font-display text-base text-gold-300">
            {t("world.items.addHeading")}
          </h3>
          <WorldItemForm worldId={worldId} locale={locale} />
        </Card>
      )}
    </section>
  );
}

function ItemCard({
  item,
  worldId,
  canManage,
  locale,
  t,
}: {
  item: WorldItem;
  worldId: string;
  canManage: boolean;
  locale: Locale;
  t: T;
}) {
  const bonuses = statBonusEntries(item.statBonuses);
  return (
    // The anchor a character sheet's inventory line links back to, so "where
    // did this come from?" lands on the card itself rather than the page top.
    <Card id={`wi-${item.id}`} className="!p-3 scroll-mt-6 target:border-gold-500/70">
      <div className="flex gap-3">
        {item.imageFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            // The key rides along so a replacement lands on a new cache entry.
            src={`/files/items/${item.id}?v=${item.imageFile}`}
            alt={item.name}
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-sm border border-ink-700 object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border border-ink-700 bg-ink-950/70 text-parchment-500"
          >
            <ItemIcon category={item.category} size={26} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-bold text-parchment-100">
            {item.name}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip>{t(`world.items.categories.${item.category}`)}</Chip>
            {item.slot && <Chip tone="slot">{t(`world.items.slots.${item.slot}`)}</Chip>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
            {bonuses.length === 0 ? (
              <span className="text-parchment-500">{t("world.items.noBonuses")}</span>
            ) : (
              bonuses.map(([stat, value]) => (
                <span key={stat} className="font-semibold text-gold-300">
                  {fmt(value)} {STAT_LABELS[stat]}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
      {item.description && (
        <p className="mt-2 line-clamp-3 text-sm text-parchment-500">{item.description}</p>
      )}
      {canManage && (
        <div className="mt-2 space-y-2 border-t border-ink-700 pt-2">
          {/* No detail page for an item: the edit form unfolds in the row. */}
          <details>
            <summary className="cursor-pointer text-xs font-bold text-parchment-500 transition hover:text-gold-300">
              {t("world.items.edit")}
            </summary>
            <div className="mt-3">
              <WorldItemForm worldId={worldId} item={item} locale={locale} />
            </div>
          </details>
          <form action={deleteWorldItem.bind(null, item.id)}>
            <GhostButton type="submit" className="!px-2 !py-1 text-xs">
              <IconX size={12} />
              {t("common.delete")}
            </GhostButton>
          </form>
        </div>
      )}
    </Card>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "slot" }) {
  const style =
    tone === "slot"
      ? "border-gold-500/60 bg-gold-500/10 text-gold-300"
      : "border-ink-600 bg-ink-950/60 text-parchment-500";
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${style}`}
    >
      {children}
    </span>
  );
}
