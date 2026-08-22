import { type AcDexRule, type WorldItemSlot } from "@/lib/db/schema";
import { unequipItem } from "@/lib/character-actions";
import { acGearBonus, acTitle, fmt, type AcBreakdown } from "@/lib/dnd";
import { statBonusEntries, STAT_LABELS } from "@/lib/world-items";
import type { T } from "@/lib/i18n";
import { categoryArtMid } from "@/lib/ui-art";
import { IconShield, IconX, SlotIcon } from "@/components/Icons";
import { Card, Portrait, SectionTitle } from "@/components/ui";
import { itemArtSrc, SLOT_CATEGORY } from "@/components/character/item-art";
import { SlotDrop } from "@/components/character/DragEquip";

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
  /** Where the line came from, so the armour rules can read its SRD entry. */
  srdIndex: string | null;
  /** The row's own snapshot, or its source's — resolved by the caller. */
  statBonuses: string | null;
  /** The armour class typed onto the line, when a player typed one. */
  acBase: number | null;
  /** How DEX joins that typed base — see lib/armor.ts. */
  acDex: AcDexRule | null;
  /** The library entry's photograph, when it has one. */
  photo: string | null;
  /** The SRD plate for the piece or its kind, resolved by the page. */
  plate: string | null;
  /** The item's category, for the plate that stands in for both of those. */
  category: string | null;
};

/**
 * The two columns, read top to bottom. Head down to hand on the left, the
 * smaller wearables on the right — the arrangement an ARPG player already has
 * muscle memory for.
 */
const LEFT_SLOTS: readonly WorldItemSlot[] = ["head", "armor", "hands", "weapon"];
const RIGHT_SLOTS: readonly WorldItemSlot[] = ["neck", "wrist", "ring", "boots"];

export function EquipmentPanel({
  equipped,
  portrait,
  ac,
  editable,
  t,
}: {
  equipped: EquippedPiece[];
  portrait: { src: string | null; alt: string; fallbackSrc: string | null };
  /** Armour class as effectiveAc() worked it out, terms and all. */
  ac: AcBreakdown;
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
            <AcPlate ac={ac} t={t} />
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
 * before it has anything else, and it is also where worn armour shows up
 * first, so it must not hide behind the stat block's gate.
 *
 * The hover text is the sum written out ("11 + DEX 3 + Shield 2"), which is
 * the only way a player can tell a working number from a wrong one.
 */
function AcPlate({ ac, t }: { ac: AcBreakdown; t: T }) {
  const total = ac.value;
  const bonus = acGearBonus(ac);
  const label = t("character.sheet.form.armorClass");
  return (
    <p
      title={total === null ? label : `${label}: ${acTitle(ac)}`}
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
 * engraving of the piece itself (or of its kind), then the plate for its
 * category, then the plate for whatever the slot can only ever hold — and when
 * even that is unknown, the slot's own monoline mark, which is also what an
 * empty square wears.
 *
 * An empty square for a slot that can only ever hold one kind of thing gets
 * that kind's plate as a watermark behind the mark: the weapon square is
 * faintly a sword, the armour square faintly a breastplate. It is set low
 * enough to read as the paper's own grain rather than as a piece — the gaps
 * are the information a paper doll exists to show, and a plate at full
 * strength would fill them in.
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
  // Only the three slots that can hold one kind of thing say anything about an
  // empty square; a cloak, a pair of boots or a pair of gloves could be
  // anything, so those keep the bare mark.
  const emptyPlate = piece ? null : (SLOT_CATEGORY[slot] ?? null);
  const label = piece
    ? `${slotName}: ${piece.name}`
    : `${slotName} — ${t("character.equipment.slotEmpty")}`;

  return (
    <div className="w-16 sm:w-20">
      {/*
        No role="img" here: the square can hold the take-off button, and
        labelling the box as an image would hide that button from a screen
        reader. What the square shows is named in the caption underneath.

        SlotDrop is the only client-side thing on the doll — it lends this box
        a dragover and a drop, and lends a worn piece the ability to be dragged
        back to the pack. The button below is untouched and remains the way to
        do it with a keyboard, or with a finger.
      */}
      <SlotDrop
        slot={slot}
        pieceId={piece?.id ?? null}
        enabled={editable}
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
            // Images drag themselves by default, which would hand the browser
            // a picture to drag instead of the piece this square is holding.
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : (
          <>
            {emptyPlate && (
              // The 256px cut. The square is 64px, 80 from `sm` up, so a
              // doubled screen asks for 160 — and this is a watermark at
              // eighteen percent, not a picture anyone studies. The full plate
              // is 512px and up to 80KB, and the doll shows several empty
              // squares at once.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={categoryArtMid(emptyPlate)}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover opacity-[0.18]"
              />
            )}
            <SlotIcon
              slot={slot}
              size={26}
              className={`relative ${piece ? "text-gold-300" : "text-parchment-500/45"}`}
            />
          </>
        )}
        {piece && editable && (
          <form
            action={unequipItem.bind(null, piece.id)}
            className="absolute right-0 top-0"
          >
            {/*
              The mark stays the small corner tab it has always been; the
              button around it is 44px square of transparent room, because a
              20px target is one a finger misses. The square underneath is
              still draggable — the pad sits on top of picture, not of any
              other control.
            */}
            <button
              type="submit"
              title={`${t("character.equipment.unequip")} — ${piece.name}`}
              className="group flex h-11 w-11 items-start justify-end cursor-pointer"
            >
              <span
                aria-hidden
                className="flex h-5 w-5 items-center justify-center rounded-bl-sm border-b border-l border-ink-600 bg-ink-900/90 text-parchment-500 transition group-hover:border-blood-500 group-hover:text-blood-400"
              >
                <IconX size={10} />
              </span>
              <span className="sr-only">
                {t("character.equipment.unequip")} — {piece.name}
              </span>
            </button>
          </form>
        )}
      </SlotDrop>
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
