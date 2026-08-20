"use client";

import { useState, useTransition, type ReactNode } from "react";
import { equipItem, unequipItem } from "@/lib/character-actions";

/**
 * Dragging gear onto the paper doll.
 *
 * Three wrappers, and nothing else: the inventory square announces what it is
 * and where it may go, the doll's squares accept what belongs in them, and the
 * inventory as a whole accepts anything taken off. Everything they wrap — the
 * pictures, the captions, the equip and take-off buttons — is server markup
 * handed in as children, so the sheet stays a server component and the
 * existing button flows (which are the keyboard and touch route, and the only
 * route on a phone) are untouched by any of this. No drag polyfill: a device
 * without HTML5 drag already has the buttons.
 *
 * What may be dropped where is decided *during* the drag, which is the only
 * time the highlight can be honest. A drag's payload is unreadable until the
 * drop — the browser hides it on purpose — but the list of MIME types it
 * carries is public the whole way, so the permitted slot is spelled into a
 * type name rather than into the data. A square that does not find its own
 * name among the types simply never calls preventDefault, which is how the
 * platform spells "not here": no glow, and the cursor says no.
 *
 * The refusal is belt and braces. equipItem re-derives the slot from the
 * item's own source and turns down anything that disagrees, exactly as it does
 * for the buttons — dropping a breastplate on a helm square is refused by the
 * server even if a browser somehow let go of it there.
 */

/** The dragged line's id. Only readable on drop, like every dataTransfer value. */
const ITEM = "application/x-lorehall-item";
/** A worn piece being dragged off the doll; the value is the row id. */
const EQUIPPED = "application/x-lorehall-equipped";
/**
 * The permission, encoded as a type name because types (unlike values) can be
 * read while the drag is still in the air. Lower case: the platform folds
 * type names, and the slot names already are.
 */
const slotType = (slot: string) => `application/x-lorehall-slot-${slot}`;
/** A line no source ever placed — the player's word decides, so anywhere goes. */
const ANY = slotType("any");

/**
 * The glow a square wears while something it can take is over it. A ring
 * rather than a border colour: the squares already carry a border utility, and
 * two colours of the same utility on one element are settled by stylesheet
 * order rather than by which was written last.
 */
const OVER = "ring-2 ring-gold-500";

/**
 * An inventory square, made draggable. `slot` is where the line may go —
 * `requiredSlot ?? slot` as the row reports it, the same answer the equip
 * button offers — or null for a line nobody has ever placed.
 */
export function DragItem({
  itemId,
  slot,
  enabled,
  className = "",
  children,
}: {
  itemId: string;
  slot: string | null;
  enabled: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!enabled) return <span className={className}>{children}</span>;
  return (
    <span
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(ITEM, itemId);
        event.dataTransfer.setData(slot ? slotType(slot) : ANY, "1");
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`cursor-grab active:cursor-grabbing ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * One square of the paper doll: a drop target for anything that belongs in
 * this slot, and — when something is already worn here — the handle that drags
 * that piece back to the pack.
 */
export function SlotDrop({
  slot,
  pieceId,
  enabled,
  title,
  className = "",
  children,
}: {
  slot: string;
  /** The row worn here, when there is one; it is what a drag off carries. */
  pieceId: string | null;
  enabled: boolean;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [, startTransition] = useTransition();

  if (!enabled) {
    return (
      <div title={title} className={className}>
        {children}
      </div>
    );
  }

  const accepts = (transfer: DataTransfer) =>
    transfer.types.includes(slotType(slot)) || transfer.types.includes(ANY);

  return (
    <div
      title={title}
      draggable={pieceId !== null}
      onDragStart={
        pieceId === null
          ? undefined
          : (event) => {
              event.dataTransfer.setData(EQUIPPED, pieceId);
              event.dataTransfer.effectAllowed = "move";
            }
      }
      onDragOver={(event) => {
        if (!accepts(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(event) => {
        // Crossing into a child fires a leave on the parent; only a pointer
        // that has actually left the square should put the glow out.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        if (!accepts(event.dataTransfer)) return;
        event.preventDefault();
        const itemId = event.dataTransfer.getData(ITEM);
        if (!itemId) return;
        // The slot travels as the form field the action already reads, so a
        // drop and a click on the equip button arrive as the same request.
        const formData = new FormData();
        formData.set("slot", slot);
        startTransition(() => equipItem(itemId, formData));
      }}
      className={`${className} ${over ? OVER : ""}`}
    >
      {children}
    </div>
  );
}

/**
 * The backpack, as somewhere to throw a worn piece. It takes only what came
 * off the doll — an inventory square dragged onto its own grid carries no
 * `EQUIPPED` type, finds no taker, and nothing happens.
 */
export function InventoryDrop({
  enabled,
  className = "",
  children,
}: {
  enabled: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const [, startTransition] = useTransition();

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <div
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(EQUIPPED)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        if (!event.dataTransfer.types.includes(EQUIPPED)) return;
        event.preventDefault();
        const itemId = event.dataTransfer.getData(EQUIPPED);
        if (!itemId) return;
        startTransition(() => unequipItem(itemId));
      }}
      className={`${className} ${over ? "rounded-sm ring-2 ring-gold-500/60" : ""}`}
    >
      {children}
    </div>
  );
}
