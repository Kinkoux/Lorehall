import { WORLD_ITEM_SLOTS, type WorldItemSlot } from "@/lib/db/schema";
import { unequipItem } from "@/lib/character-actions";
import { fmt } from "@/lib/dnd";
import { statBonusEntries, STAT_LABELS } from "@/lib/world-items";
import type { T } from "@/lib/i18n";
import { IconX, SlotIcon } from "@/components/Icons";
import { Card, SectionTitle } from "@/components/ui";

/**
 * What the character has on, one square per slot (docs/design-economy.md
 * phase 3). The grid is always all eight squares — an empty one is a dim mark
 * naming what belongs there, which is the whole reason to draw a doll instead
 * of a list: the gaps are information.
 *
 * Filling a square happens over in the inventory, where the items are. This
 * panel only takes things off.
 */

export type EquippedPiece = {
  id: string;
  name: string;
  slot: WorldItemSlot;
  /** The row's own snapshot, or its source's — resolved by the caller. */
  statBonuses: string | null;
};

export function EquipmentPanel({
  equipped,
  editable,
  t,
}: {
  equipped: EquippedPiece[];
  editable: boolean;
  t: T;
}) {
  const bySlot = new Map(equipped.map((piece) => [piece.slot, piece]));
  return (
    <section className="mb-6 space-y-4">
      <SectionTitle>{t("character.equipment.title")}</SectionTitle>
      <Card>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WORLD_ITEM_SLOTS.map((slot) => (
            <SlotCell
              key={slot}
              slot={slot}
              piece={bySlot.get(slot) ?? null}
              editable={editable}
              t={t}
            />
          ))}
        </div>
        {equipped.length === 0 && (
          <p className="mt-3 text-xs text-parchment-500">
            {editable ? t("character.equipment.emptyHint") : t("character.equipment.empty")}
          </p>
        )}
      </Card>
    </section>
  );
}

function SlotCell({
  slot,
  piece,
  editable,
  t,
}: {
  slot: WorldItemSlot;
  piece: EquippedPiece | null;
  editable: boolean;
  t: T;
}) {
  const bonuses = piece ? statBonusEntries(piece.statBonuses) : [];
  return (
    <div
      className={`flex min-h-[4.5rem] gap-2 rounded-md border px-2 py-2 ${
        piece
          ? "border-gold-500/50 bg-gold-500/[0.07]"
          : "border-dashed border-ink-700 bg-ink-950/40"
      }`}
    >
      <SlotIcon
        slot={slot}
        size={22}
        className={`mt-0.5 shrink-0 ${piece ? "text-gold-300" : "text-parchment-500/45"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-parchment-500">
          {t(`world.items.slots.${slot}`)}
        </p>
        {piece ? (
          <>
            <p className="truncate text-sm font-semibold text-parchment-100" title={piece.name}>
              {piece.name}
            </p>
            <p className="text-[11px] text-parchment-500">
              {bonuses.length === 0
                ? t("world.items.noBonuses")
                : bonuses
                    .map(([stat, value]) => `${fmt(value)} ${STAT_LABELS[stat]}`)
                    .join(" · ")}
            </p>
          </>
        ) : (
          <p className="text-sm text-parchment-500/60">{t("character.equipment.slotEmpty")}</p>
        )}
      </div>
      {piece && editable && (
        <form action={unequipItem.bind(null, piece.id)} className="shrink-0">
          <button
            type="submit"
            title={t("character.equipment.unequip")}
            className="rounded border border-ink-600 p-1 text-parchment-500 transition hover:border-blood-500 hover:text-blood-400 cursor-pointer"
          >
            <IconX size={12} />
            <span className="sr-only">{t("character.equipment.unequip")}</span>
          </button>
        </form>
      )}
    </div>
  );
}
