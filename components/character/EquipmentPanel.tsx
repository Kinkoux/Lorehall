import { type WorldItemSlot } from "@/lib/db/schema";
import { unequipItem } from "@/lib/character-actions";
import { fmt } from "@/lib/dnd";
import { statBonusEntries, STAT_LABELS } from "@/lib/world-items";
import type { T } from "@/lib/i18n";
import { IconShield, IconX, SlotIcon } from "@/components/Icons";
import { Card, Portrait, SectionTitle } from "@/components/ui";
import { itemArtSrc } from "@/components/character/item-art";

/**
 * The paper doll (docs/design-economy.md phase 3), laid out the way every game
 * that has ever asked "what are you wearing?" lays it out: the figure in the
 * middle, the slots down either side of it. An empty square is still a dim
 * mark naming what belongs there — the gaps are the information, which is the
 * whole reason to draw a doll instead of a list.
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
  /** The library entry's photograph, when it has one. */
  photo: string | null;
  /** The item's category, for the plate that stands in for a photograph. */
  category: string | null;
};

/**
 * The two columns, read top to bottom. Head down to hand on the left, the
 * smaller wearables on the right — the arrangement an ARPG player already has
 * muscle memory for.
 */
const LEFT_SLOTS: readonly WorldItemSlot[] = ["head", "armor", "hands", "weapon"];
const RIGHT_SLOTS: readonly WorldItemSlot[] = ["neck", "wrist", "ring", "boots"];

/**
 * What a slot is holding when the piece itself never said. Only the two slots
 * that can only ever hold one kind of thing get to guess; a ring, a cloak or a
 * pair of boots could be anything, so those fall through to the slot's mark.
 */
const SLOT_CATEGORY: Partial<Record<WorldItemSlot, string>> = {
  weapon: "weapon",
  armor: "armor",
};

export function EquipmentPanel({
  equipped,
  portrait,
  armorClass,
  acBonus,
  editable,
  t,
}: {
  equipped: EquippedPiece[];
  portrait: { src: string | null; alt: string; fallbackSrc: string | null };
  /** The sheet's own AC. NULL when nobody has filled it in yet. */
  armorClass: number | null;
  /** What the worn pieces add to it. */
  acBonus: number;
  editable: boolean;
  t: T;
}) {
  const bySlot = new Map(equipped.map((piece) => [piece.slot, piece]));
  const column = (slots: readonly WorldItemSlot[]) =>
    slots.map((slot) => (
      <SlotCell
        key={slot}
        slot={slot}
        piece={bySlot.get(slot) ?? null}
        editable={editable}
        t={t}
      />
    ));

  return (
    <section className="mb-6 space-y-4">
      <SectionTitle>{t("character.equipment.title")}</SectionTitle>
      <Card>
        {/*
          Narrow: the figure, then the eight squares as a 4×2 block. Wide: three
          columns around the figure. The two column wrappers are `contents` at
          the small size, so the squares become grid cells in their own right
          rather than being written into the page twice.
        */}
        <div className="grid grid-cols-4 items-start justify-items-center gap-3 md:flex md:justify-center md:gap-8">
          <div className="col-span-4 mb-2 flex flex-col items-center gap-3 md:order-2 md:mb-0">
            <Figure {...portrait} />
            <AcPlate armorClass={armorClass} bonus={acBonus} t={t} />
          </div>
          <div className="contents md:order-1 md:flex md:flex-col md:gap-3">
            {column(LEFT_SLOTS)}
          </div>
          <div className="contents md:order-3 md:flex md:flex-col md:gap-3">
            {column(RIGHT_SLOTS)}
          </div>
        </div>
        {equipped.length === 0 && (
          <p className="mt-4 text-center text-xs text-parchment-500">
            {editable ? t("character.equipment.emptyHint") : t("character.equipment.empty")}
          </p>
        )}
      </Card>
    </section>
  );
}

/**
 * The character in the middle of their own gear. The two rings behind are
 * drawn faintly enough to read as a watermark on the page rather than as
 * chrome bolted onto it.
 */
function Figure({
  src,
  alt,
  fallbackSrc,
}: {
  src: string | null;
  alt: string;
  fallbackSrc: string | null;
}) {
  return (
    <div className="relative flex h-[13.5rem] w-[13.5rem] items-center justify-center">
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border border-gold-500/20 bg-ink-950/25"
      />
      <span
        aria-hidden
        className="absolute inset-[0.75rem] rounded-full border border-ink-600/60"
      />
      <Portrait
        src={src}
        alt={alt}
        size={176}
        eager
        fallbackSrc={fallbackSrc}
        className="relative ring-1 ring-gold-500/40"
      />
    </div>
  );
}

/**
 * Armour class, where the eye already is. Deliberately independent of whether
 * the six ability scores are filled in — AC is the one number a sheet can have
 * before it has anything else, and it is also where worn bonuses show up
 * first, so it must not hide behind the stat block's gate.
 */
function AcPlate({
  armorClass,
  bonus,
  t,
}: {
  armorClass: number | null;
  bonus: number;
  t: T;
}) {
  const total = armorClass === null ? null : armorClass + bonus;
  return (
    <p
      title={t("character.sheet.form.armorClass")}
      className="flex items-center gap-2 rounded-sm border border-gold-500/60 bg-ink-950/70 px-3 py-1.5 outline outline-1 outline-gold-500/25 outline-offset-[-4px]"
    >
      <IconShield size={16} className="shrink-0 text-gold-400" />
      <span className="font-display text-xl font-bold leading-none text-parchment-100">
        {total ?? "—"}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-parchment-500">
        {STAT_LABELS.ac}
      </span>
      {total !== null && bonus !== 0 && (
        <span
          className="font-mono text-xs font-bold text-gold-300"
          title={t("character.equipment.bonusTitle")}
        >
          {fmt(bonus)}
        </span>
      )}
    </p>
  );
}

/**
 * One square. What it shows, in order: the piece's own photograph, then the
 * plate for its category, then the plate for whatever the slot can only ever
 * hold — and when even that is unknown, the slot's own monoline mark, which is
 * also what an empty square wears.
 */
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
  const slotName = t(`world.items.slots.${slot}`);
  const bonuses = piece ? statBonusEntries(piece.statBonuses) : [];
  const art = piece ? itemArtSrc(piece, SLOT_CATEGORY[slot] ?? null) : null;
  const label = piece
    ? `${slotName}: ${piece.name}`
    : `${slotName} — ${t("character.equipment.slotEmpty")}`;

  return (
    <div className="w-16 sm:w-20">
      {/*
        No role="img" here: the square can hold the take-off button, and
        labelling the box as an image would hide that button from a screen
        reader. What the square shows is named in the caption underneath.
      */}
      <div
        title={label}
        className={`relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-sm border bg-ink-950/60 sm:h-20 sm:w-20 ${
          piece ? "border-gold-500/70" : "border-dashed border-ink-600"
        }`}
      >
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <SlotIcon
            slot={slot}
            size={26}
            className={piece ? "text-gold-300" : "text-parchment-500/45"}
          />
        )}
        {piece && editable && (
          <form
            action={unequipItem.bind(null, piece.id)}
            className="absolute right-0 top-0"
          >
            <button
              type="submit"
              title={`${t("character.equipment.unequip")} — ${piece.name}`}
              className="flex h-5 w-5 items-center justify-center rounded-bl-sm border-b border-l border-ink-600 bg-ink-900/90 text-parchment-500 transition hover:border-blood-500 hover:text-blood-400 cursor-pointer"
            >
              <IconX size={10} />
              <span className="sr-only">
                {t("character.equipment.unequip")} — {piece.name}
              </span>
            </button>
          </form>
        )}
      </div>
      {piece ? (
        <>
          <p
            className="mt-1 truncate text-center text-[11px] font-semibold text-parchment-100"
            title={piece.name}
          >
            {piece.name}
          </p>
          <p className="truncate text-center text-[10px] text-parchment-500">
            {bonuses.length === 0
              ? t("world.items.noBonuses")
              : bonuses.map(([stat, value]) => `${fmt(value)} ${STAT_LABELS[stat]}`).join(" · ")}
          </p>
        </>
      ) : (
        <p className="mt-1 truncate text-center text-[10px] font-bold uppercase tracking-wide text-parchment-500/70">
          {slotName}
        </p>
      )}
    </div>
  );
}
