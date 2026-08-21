"use client";

import { useState } from "react";
import { giveItem } from "@/lib/character-actions";
import { AutocompleteInput } from "@/components/character/AutocompleteInput";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, Input, Label, Select } from "@/components/ui";

/** One line of the "who gets it" list: the sheet's id and how to name it. */
export type GiveItemTarget = { id: string; label: string };

/**
 * The DM's hand-over form. The only reason this is a client component is the
 * character select: the lookahead below it searches *as* the chosen character
 * — that is the permission the suggestions are read under, and the world
 * library it draws from is the one that sheet sits in — so the field has to
 * know which sheet is selected before anything is typed into it.
 *
 * `key={characterId}` remounts the lookahead whenever the target changes, and
 * that is deliberate: the field keeps what was picked in two hidden reference
 * fields, and a reference chosen while another character was selected has no
 * business riding along to a different sheet. A remount empties the name, the
 * references and the cached suggestion list together, which is the same clean
 * slate the form gets after a submit.
 */
export function GiveItemForm({
  campaignId,
  targets,
  locale,
}: {
  campaignId: string;
  targets: GiveItemTarget[];
  locale: Locale;
}) {
  const t = makeT(locale);
  // Controlled on purpose — React resets the uncontrolled fields after the
  // action resolves, and a DM handing three things to the same player should
  // not have to re-pick them each time.
  const [characterId, setCharacterId] = useState(targets[0].id);

  return (
    <form action={giveItem.bind(null, campaignId)} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1">
          <Label>{t("campaign.giveItem.character")}</Label>
          <Select
            name="characterId"
            value={characterId}
            onChange={(event) => setCharacterId(event.currentTarget.value)}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block w-20">
          <Label>{t("campaign.giveItem.qty")}</Label>
          <Input name="qty" type="number" min={1} max={999} defaultValue={1} />
        </label>
      </div>
      {/* Not a <label>: the submit button sits on this row, and a button
          inside a label would also be forwarding its click to the field. */}
      <div>
        <Label>{t("campaign.giveItem.item")}</Label>
        <div className="flex gap-2">
          {/* Carries its own hidden srdIndex / worldItemId fields — they sit
              inside this form, exactly as they do on the sheet. */}
          <AutocompleteInput
            key={characterId}
            characterId={characterId}
            kind="item"
            name="name"
            required
            locale={locale}
            placeholder={t("campaign.giveItem.itemPh")}
          />
          <Button type="submit" className="shrink-0">
            {t("campaign.giveItem.submit")}
          </Button>
        </div>
      </div>
      {/* The name is resolved server-side when nothing was picked from the
          list; this is how a DM says "no, I mean my own thing". */}
      <label className="flex items-center gap-2 text-sm text-parchment-300">
        <input type="checkbox" name="custom" value="1" className="accent-[#8a6516]" />
        {t("character.custom")}
      </label>
    </form>
  );
}
