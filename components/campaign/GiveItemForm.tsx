"use client";

import { useActionState, useState } from "react";
import { giveItem, type GiveItemState } from "@/lib/character-actions";
import type { ItemSuggestion } from "@/lib/search-actions";
import { AutocompleteInput } from "@/components/character/AutocompleteInput";
import { makeT, type Locale } from "@/lib/i18n";
import { Button, ErrorText, Input, Label, Select } from "@/components/ui";

/** One line of the "who gets it" list: the sheet's id and how to name it. */
export type GiveItemTarget = { id: string; label: string };

/**
 * The DM's hand-over form. The only reason this is a client component is the
 * character select: the lookahead below it searches *as* the chosen character
 * — that is the permission the suggestions are read under, and the world
 * library it draws from is the one that sheet sits in — so the field has to
 * know which sheet is selected before anything is typed into it.
 *
 * The remount key is two things joined, and each is deliberate.
 *
 * The character, because the field keeps what was picked in two hidden
 * reference fields, and a reference chosen while another character was
 * selected has no business riding along to a different sheet. A remount
 * empties the name, the references and the cached suggestion list together.
 *
 * The last hand-over's own id, because that clean slate is otherwise never
 * reached again: this form's fields are cleared by *remounting*, not by
 * React's post-action reset, and giving twice in a row used to leave the
 * second submission carrying the first one's reference behind a name the DM
 * had retyped. The id changes with every line written, which is what makes two
 * word-for-word identical hand-overs two different keys.
 *
 * The DM never sees where the thing lands — the sheet is someone else's page —
 * so the form says so itself: what was picked, in a strip under the field, and
 * what was actually given, on the line under that. Both of those are read off
 * the key above rather than cleared by hand, because both are claims about a
 * particular field and a particular player, and the DM moves on from both.
 *
 * The action is `.bind`-ed rather than wrapped: React only writes a POST
 * target into a form's markup when it is handed a server function reference,
 * so a closure here — however convenient for the bookkeeping that used to live
 * in it — is a give button that does nothing until hydration lands.
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

  const [state, action] = useActionState<GiveItemState, FormData>(
    giveItem.bind(null, campaignId),
    {}
  );

  // Which instance of the lookahead field is standing here now. Both the strip
  // and the receipt below are answers *this* field gave, so both are shown by
  // agreeing with it rather than by being cleared when it changes.
  const field = `${characterId}-${state.given?.id ?? ""}`;
  const [picked, setPicked] = useState<{ field: string; item: ItemSuggestion } | null>(null);
  // "Rope ×2 → Vex" stops being true the moment the DM selects a different
  // player, and a line that outlives its own subject is worse than no line:
  // the next press is aimed at somebody the form is still talking about.
  const receipt = state.given?.characterId === characterId ? state.given : null;

  return (
    <form action={action} className="space-y-2">
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
            key={field}
            characterId={characterId}
            kind="item"
            name="name"
            required
            locale={locale}
            placeholder={t("campaign.giveItem.itemPh")}
            onPick={(item) => setPicked(item && { field, item })}
          />
          <Button type="submit" className="shrink-0">
            {t("campaign.giveItem.submit")}
          </Button>
        </div>
      </div>
      {picked?.field === field && <PickedStrip picked={picked.item} t={t} />}
      {/* The name is resolved server-side when nothing was picked from the
          list; this is how a DM says "no, I mean my own thing". */}
      <label className="flex items-center gap-2 text-sm text-parchment-300">
        <input type="checkbox" name="custom" value="1" className="accent-[#8a6516]" />
        {t("character.custom")}
      </label>
      <ErrorText>{state.error}</ErrorText>
      {receipt && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-gold-300"
        >
          {t("campaign.giveItem.gave", {
            name: receipt.name,
            n: receipt.qty,
            character: receipt.character,
          })}
        </p>
      )}
    </form>
  );
}

/**
 * What the list handed back, while it is still only a choice. Everything drawn
 * here already travelled with the suggestion — the plate, the slot, the
 * bonuses — so the strip costs nothing beyond the picture it shows, and it is
 * the only place a DM can check that "Ring" meant the enchanted one before the
 * thing is on someone else's sheet.
 *
 * Which is why this is the one place the library entry's real photograph is
 * drawn: checking that it is the right ring is what the strip is *for*, and a
 * category plate saying "something enchanted" cannot answer that. One item,
 * already chosen — the suggestion list itself stays on the small cuts.
 */
function PickedStrip({
  picked,
  t,
}: {
  picked: ItemSuggestion;
  t: ReturnType<typeof makeT>;
}) {
  const where = picked.slot
    ? t(`world.items.slots.${picked.slot}`)
    : t("campaign.giveItem.carried");
  return (
    <p className="flex items-center gap-2 rounded-sm border border-ink-600 bg-ink-950/50 px-2 py-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={picked.photo ?? picked.art}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-8 w-8 shrink-0 rounded-sm border border-ink-600 object-cover"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-parchment-100">
          {picked.display ?? picked.name}
        </span>
        <span className="block truncate text-[11px] text-parchment-500">
          {[
            t(`character.autocomplete.${picked.source}`),
            where,
            picked.bonuses ?? t("campaign.giveItem.noBonuses"),
          ].join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gold-300">
        {t("campaign.giveItem.picked")}
      </span>
    </p>
  );
}
