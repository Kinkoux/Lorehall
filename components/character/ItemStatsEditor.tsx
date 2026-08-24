"use client";

import { useActionState } from "react";
import { AC_DEX_RULES, WORLD_ITEM_SLOTS, WORLD_ITEM_STATS } from "@/lib/db/schema";
import { setItemStats } from "@/lib/character-actions";
import type { FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import {
  ABILITY_FLOOR_MAX,
  ABILITY_FLOOR_MIN,
  ABILITY_STATS,
  AC_BASE_MAX,
  AC_BASE_MIN,
  parseStatBonuses,
  STAT_BONUS_MAX,
  STAT_BONUS_MIN,
  STAT_LABELS,
} from "@/lib/world-items";
import { ErrorText, GhostButton, Input, Label, Select } from "@/components/ui";
import type { InventoryLineShape } from "@/components/character/sheet-data";

/**
 * What this copy of the thing actually does, in the player's own words.
 *
 * The compendium answers for a longsword and the world's library answers for
 * homebrew, but SRD magic armour answers for nothing: "Adamantine Armor" keeps
 * its whole mechanic in prose, so wearing it moved no number on the sheet at
 * all. This is the escape hatch — the same one every inventory-driven RPG has
 * — and it is folded away because the great majority of lines never need it.
 *
 * The slot is a label rather than a select whenever the line's source insists
 * on one, for the same reason the equip button is: setItemStats would overrule
 * a select that offered otherwise, and a control whose answer is ignored is
 * worse than no control.
 *
 * The six floors below the bonuses — the scores a piece *states* rather than
 * adds to — are new, and they change what a save means. The action used to
 * carry a stored floor through untouched because this form had no way to speak
 * about one; now it speaks about them in every submission, filled in from the
 * line, so an emptied field is a deletion the player asked for. That is the
 * price of being able to type one at all, and it is the deal the other eleven
 * fields on this form have always offered.
 *
 * Client-side only so the action's refusal has somewhere to land — a sheet
 * that has left the table, or a line that has since been struck out from
 * another phone, used to answer with an unchanged page. The fields themselves
 * are uncontrolled, and the form is still a plain POST without scripting
 * because the action is handed to `useActionState` already `.bind`-ed: React
 * writes a POST target into the markup for a server function reference and for
 * nothing else, so a closure around it would have made this a button that does
 * nothing until hydration lands.
 */
export function ItemStatsEditor({
  item,
  locale,
}: {
  item: InventoryLineShape;
  locale: Locale;
}) {
  const t = makeT(locale);
  const [state, action] = useActionState<FormState, FormData>(
    setItemStats.bind(null, item.id),
    {}
  );
  // The bonuses in play, not only the ones stored on the row: a line stocked
  // before the snapshot columns existed reads its source's, and the editor has
  // to show what the sheet is actually counting.
  const bonuses = parseStatBonuses(item.bonuses);

  return (
    <details className="mt-2 border-t border-ink-700 pt-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center px-1 text-xs font-bold uppercase tracking-wide text-parchment-500 transition hover:text-gold-300">
        {t("character.itemStats.title")}
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block">
            <Label>{t("character.itemStats.slotLabel")}</Label>
            {item.requiredSlot ? (
              <p
                title={t("character.itemStats.slotLocked")}
                className="rounded-sm border border-ink-700 bg-ink-950/40 px-2 py-1.5 text-xs text-parchment-300"
              >
                {t(`world.items.slots.${item.requiredSlot}`)}
              </p>
            ) : (
              <Select name="slot" defaultValue={item.slot ?? ""} className="min-h-11 !py-1 text-xs">
                <option value="">{t("character.itemStats.carried")}</option>
                {WORLD_ITEM_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {t(`world.items.slots.${slot}`)}
                  </option>
                ))}
              </Select>
            )}
          </label>
          <label className="block">
            <Label>{t("character.itemStats.acBaseLabel")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              name="acBase"
              min={AC_BASE_MIN}
              max={AC_BASE_MAX}
              step={1}
              defaultValue={item.acBase ?? ""}
              className="min-h-11 !py-1 text-xs"
            />
          </label>
          <label className="block">
            <Label>{t("character.itemStats.acDexLabel")}</Label>
            <Select name="acDex" defaultValue={item.acDex ?? "none"} className="min-h-11 !py-1 text-xs">
              {AC_DEX_RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {t(`character.itemStats.dex.${rule}`)}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <p className="text-xs text-parchment-500">{t("character.itemStats.hint")}</p>

        <fieldset>
          <legend>
            <Label>{t("character.itemStats.bonusesLabel")}</Label>
          </legend>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
            {WORLD_ITEM_STATS.map((stat) => (
              <label key={stat} className="block">
                <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wider text-parchment-500">
                  {STAT_LABELS[stat]}
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  name={`bonus_${stat}`}
                  min={STAT_BONUS_MIN}
                  max={STAT_BONUS_MAX}
                  step={1}
                  defaultValue={bonuses[stat] ?? ""}
                  className="min-h-11 px-1 py-1 text-center text-xs"
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-parchment-500">{t("character.itemStats.bonusesHint")}</p>
        </fieldset>

        {/*
          Folded away, and for the same reason the whole editor is: a floor is
          the rare sentence, six more boxes in the open would bury the eight
          that answer for nearly every line. The fields are in the document
          either way — a closed `details` hides them, it does not withhold
          them — so a player who never opens this posts the floors back exactly
          as they arrived, and only a hand that clears one clears one.
        */}
        <details className="border-t border-ink-700 pt-2">
          <summary className="inline-flex min-h-11 cursor-pointer items-center px-1 text-xs font-bold uppercase tracking-wide text-parchment-500 transition hover:text-gold-300">
            {t("character.itemStats.floorsLabel")}
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {ABILITY_STATS.map((stat) => (
              <label key={stat} className="block">
                <span className="mb-1 block text-center text-[10px] font-semibold uppercase tracking-wider text-parchment-500">
                  {STAT_LABELS[stat]}
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  name={`floor_${stat}`}
                  min={ABILITY_FLOOR_MIN}
                  max={ABILITY_FLOOR_MAX}
                  step={1}
                  placeholder={t("character.itemStats.floorsPh")}
                  defaultValue={bonuses.floors?.[stat] ?? ""}
                  className="min-h-11 px-1 py-1 text-center text-xs"
                />
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-parchment-500">{t("character.itemStats.floorsHint")}</p>
        </details>

        <GhostButton type="submit" className="min-h-11 !px-3 !py-1 text-xs">
          {t("character.itemStats.save")}
        </GhostButton>
        <ErrorText>{state.error}</ErrorText>
      </form>
    </details>
  );
}
