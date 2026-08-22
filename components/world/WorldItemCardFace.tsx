import type { WorldItem } from "@/lib/db";
import { fmt } from "@/lib/dnd";
import type { T } from "@/lib/i18n";
import { statBonusEntries, STAT_LABELS } from "@/lib/world-items";
import { categoryArtThumb } from "@/lib/ui-art";
import { DmBadge } from "@/components/ui";

/**
 * The face of one library item — picture, name, chips, bonuses, description.
 * The world page hangs the DM's controls under it and the compendium hangs a
 * player's "add to my character" form there instead, which is the whole
 * difference between the two: an item looks like the same object in both.
 */
export type WorldItemFace = Pick<
  WorldItem,
  "name" | "description" | "category" | "slot" | "statBonuses" | "imageFile" | "visibility"
> & { id: string };

export function WorldItemCardFace({ item, t }: { item: WorldItemFace; t: T }) {
  const bonuses = statBonusEntries(item.statBonuses);
  return (
    <>
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
          // No photograph of this one yet, so the category's plate stands in.
          // The 96px cut: the square is 64px, and a plate standing in for a
          // photograph is a marker rather than the picture — worth the sharpest
          // 64 pixels, not the 47KB the full 512px plate costs on a grid of
          // cards that mostly show one of six repeated categories.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={categoryArtThumb(item.category)}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-sm border border-ink-700 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-bold text-parchment-100">
            {item.name}
          </h3>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip>{t(`world.items.categories.${item.category}`)}</Chip>
            {item.slot && <Chip tone="slot">{t(`world.items.slots.${item.slot}`)}</Chip>}
            {/* Only a DM ever gets a hidden item in a list, so the badge is
                shown wherever one appears rather than gated a second time. */}
            {item.visibility === "dm" && <DmBadge label={t("world.items.dmOnly")} />}
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
    </>
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
