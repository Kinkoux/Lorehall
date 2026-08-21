import type { WorldItem } from "@/lib/db";
import { deleteWorldItem } from "@/lib/world-item-actions";
import type { Locale, T } from "@/lib/i18n";
import { EMPTY_ART } from "@/lib/ui-art";
import { IconX } from "@/components/Icons";
import { Card, GhostButton, SectionTitle } from "@/components/ui";
import { WorldItemCardFace } from "./WorldItemCardFace";
import { WorldItemForm } from "./WorldItemForm";

/**
 * The world's item library (docs/design-economy.md phase 2). Every member of
 * the world reads it like a private extension of the compendium; forging,
 * editing and retiring are behind `canManage` — the same DM powers the actions
 * check for themselves.
 *
 * A DM-only entry is filtered out here rather than at the query, so the world
 * page keeps its one read of the table; the same `canManage` that draws the
 * controls decides who is shown the hidden half.
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
  const visibleItems = canManage ? items : items.filter((i) => i.visibility === "everyone");
  return (
    <section className="mt-10 space-y-4">
      <SectionTitle>{t("world.items.title")}</SectionTitle>
      {canManage && <p className="-mt-2 text-xs text-parchment-500">{t("world.items.hintDm")}</p>}
      {visibleItems.length === 0 && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={EMPTY_ART.library}
            alt=""
            loading="lazy"
            decoding="async"
            className="mx-auto mb-3 w-24 opacity-70"
          />
          <p className="text-sm text-parchment-500">
            {canManage ? t("world.items.emptyDm") : t("world.items.empty")}
          </p>
        </div>
      )}
      {visibleItems.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => (
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
  return (
    // The anchor a character sheet's inventory line links back to, so "where
    // did this come from?" lands on the card itself rather than the page top.
    <Card id={`wi-${item.id}`} className="!p-3 scroll-mt-6 target:border-gold-500/70">
      <WorldItemCardFace item={item} t={t} />
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
