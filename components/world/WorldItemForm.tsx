"use client";

import { useActionState, useRef } from "react";
import {
  WORLD_ITEM_CATEGORIES,
  WORLD_ITEM_SLOTS,
  WORLD_ITEM_STATS,
  type WorldItem,
} from "@/lib/db/schema";
import { createWorldItem, updateWorldItem } from "@/lib/world-item-actions";
import type { FormState } from "@/lib/actions";
import { makeT, type Locale } from "@/lib/i18n";
import {
  parseStatBonuses,
  STAT_BONUS_MAX,
  STAT_BONUS_MIN,
  STAT_LABELS,
} from "@/lib/world-items";
import { Button, ErrorText, Input, Label, Select, Textarea } from "@/components/ui";

/** Mirrors IMAGE_MAX_BYTES in lib/world-item-actions.ts. */
const MAX_BYTES = 4 * 1024 * 1024;

export type EditableWorldItem = Pick<
  WorldItem,
  "id" | "name" | "description" | "category" | "slot" | "statBonuses" | "visibility"
>;

/**
 * Forge (or re-forge) one library item. Same form both ways — with an `item`
 * it edits in place and leaves the picture alone unless a new file is picked.
 */
export function WorldItemForm({
  worldId,
  item,
  locale,
}: {
  worldId: string;
  item?: EditableWorldItem;
  locale: Locale;
}) {
  const t = makeT(locale);
  const formRef = useRef<HTMLFormElement>(null);
  const bonuses = parseStatBonuses(item?.statBonuses);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      // Pre-check the size client-side; past the action body limit the server
      // would reject the whole request with an opaque error.
      const file = formData.get("image");
      if (file instanceof File && file.size > MAX_BYTES) {
        return { error: t("errors.worldItems.tooLarge") };
      }
      const result = item
        ? await updateWorldItem(item.id, prev, formData)
        : await createWorldItem(worldId, prev, formData);
      // Only the add form empties itself; an edit form keeps showing the item.
      if (!result.error && !item) formRef.current?.reset();
      return result;
    },
    {}
  );

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <label className="block">
        <Label>{t("world.items.nameLabel")}</Label>
        <Input
          name="name"
          required
          maxLength={120}
          defaultValue={item?.name}
          placeholder={t("world.items.namePh")}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <Label>{t("world.items.categoryLabel")}</Label>
          <Select name="category" defaultValue={item?.category ?? "gear"}>
            {WORLD_ITEM_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`world.items.categories.${category}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <Label>{t("world.items.slotLabel")}</Label>
          <Select name="slot" defaultValue={item?.slot ?? ""}>
            <option value="">{t("world.items.slotNone")}</option>
            {WORLD_ITEM_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {t(`world.items.slots.${slot}`)}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <Label>{t("world.items.visibilityLabel")}</Label>
          {/* The same two answers a map has: shared with the table, or kept
              for the encounter it was forged for. */}
          <Select name="visibility" defaultValue={item?.visibility ?? "everyone"}>
            <option value="everyone">{t("world.items.visEveryone")}</option>
            <option value="dm">{t("world.items.visDm")}</option>
          </Select>
        </label>
      </div>

      <fieldset>
        <legend>
          <Label>{t("world.items.bonusesLabel")}</Label>
        </legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {WORLD_ITEM_STATS.map((stat) => (
            <label key={stat} className="block">
              <span className="mb-1 block text-center text-[11px] font-semibold uppercase tracking-wider text-parchment-500">
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
                className="px-1 text-center"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-parchment-500">{t("world.items.bonusesHint")}</p>
      </fieldset>

      <label className="block">
        <Label>{t("world.items.descLabel")}</Label>
        <Textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={item?.description ?? undefined}
          placeholder={t("world.items.descPh")}
        />
      </label>

      <label className="block">
        <Label>{t("world.items.imageLabel")}</Label>
        <input
          type="file"
          name="image"
          accept="image/png,image/jpeg,image/webp"
          className="w-full cursor-pointer rounded-sm border border-ink-600 bg-ink-950/70 px-3 py-2 text-sm text-parchment-300 file:mr-3 file:cursor-pointer file:rounded-sm file:border-0 file:bg-gold-500 file:px-3 file:py-1 file:text-xs file:font-bold file:text-ink-900"
        />
        <span className="mt-1 block text-xs text-parchment-500">
          {t("world.items.imageHint")}
        </span>
      </label>

      <ErrorText>{state.error}</ErrorText>
      <Button type="submit" disabled={pending}>
        {pending
          ? t("world.items.saving")
          : item
            ? t("world.items.saveChanges")
            : t("world.items.create")}
      </Button>
    </form>
  );
}
