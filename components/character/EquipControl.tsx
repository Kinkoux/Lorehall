"use client";

import { useActionState } from "react";
import { WORLD_ITEM_SLOTS } from "@/lib/db/schema";
import { equipItem } from "@/lib/character-actions";
import type { FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import { ErrorText, GhostButton, Select } from "@/components/ui";
import type { InventoryLineShape } from "@/components/character/sheet-data";

/**
 * How a backpacked item gets worn. A piece whose place is known is one button
 * — either because its source dictates it (a shield is held, and no dropdown
 * should pretend otherwise) or because the row already carries a slot. One
 * that nobody has ever placed — a hand-typed heirloom, a wondrous item the SRD
 * never filed — asks where it goes, and asks it folded away so twenty potions
 * do not each carry a dropdown.
 *
 * The source wins over the stored slot, exactly as equipItem decides it, so
 * the button never offers a placement the action would turn down.
 *
 * A client island for one reason: equipItem can refuse. Two players reaching
 * for the same square at the same instant, a forged slot, a line whose sheet
 * has since left the table — all of those used to come back as an unchanged
 * page, which reads exactly like nothing having been pressed. The control is
 * otherwise the same pair of server-action forms it always was; with scripting
 * off they still post, and the refusal is merely unspoken again.
 *
 * Which is true only because the action arrives here already `.bind`-ed. React
 * writes a form's POST target into the HTML from the action it is *given*, and
 * it can only do that for a server function reference: wrapped in a closure —
 * `(_prev, formData) => equipItem(item.id, formData)` — the markup came back
 * with no target at all and the button was dead until hydration, which is
 * exactly the phone on the far side of the table with a bad signal.
 */
export function EquipControl({
  item,
  locale,
}: {
  item: InventoryLineShape;
  locale: Locale;
}) {
  const t = makeT(locale);
  const [state, action] = useActionState<FormState, FormData>(
    equipItem.bind(null, item.id),
    {}
  );
  const slot = item.requiredSlot ?? item.slot;

  if (slot) {
    return (
      <form action={action}>
        <GhostButton type="submit" className="min-h-11 !px-3 !py-1 text-xs">
          {t("character.equipment.equip")} · {t(`world.items.slots.${slot}`)}
        </GhostButton>
        <ErrorText>{state.error}</ErrorText>
      </form>
    );
  }
  return (
    <details>
      <summary className="inline-flex min-h-11 cursor-pointer items-center px-1 text-xs font-bold text-parchment-500 transition hover:text-gold-300">
        {t("character.equipment.equip")}
      </summary>
      <form action={action} className="mt-1.5 flex flex-wrap items-center gap-2">
        <Select
          name="slot"
          aria-label={t("character.equipment.slotLabel")}
          className="!w-32 min-h-11 !py-1 text-xs"
        >
          {WORLD_ITEM_SLOTS.map((option) => (
            <option key={option} value={option}>
              {t(`world.items.slots.${option}`)}
            </option>
          ))}
        </Select>
        <GhostButton type="submit" className="min-h-11 !px-3 !py-1 text-xs">
          {t("character.equipment.equip")}
        </GhostButton>
        <ErrorText>{state.error}</ErrorText>
      </form>
    </details>
  );
}
