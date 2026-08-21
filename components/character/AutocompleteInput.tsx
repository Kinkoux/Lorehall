"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  searchItemsForCharacter,
  searchSpellsForCharacter,
  type ItemSuggestion,
  type SpellSuggestion,
} from "@/lib/search-actions";
import { makeT, type Locale } from "@/lib/i18n";
import { Input } from "@/components/ui";

/**
 * The name field on the sheet's "add item" / "add spell" forms, with a
 * lookahead over the world's item library and the SRD behind it. Picking a
 * suggestion fills the name *and* attaches a hidden reference, which is what
 * gives the resulting row its slot, its bonuses and its link back to the
 * source. Typing something the list has never heard of is still a complete
 * answer — the reference simply stays empty.
 *
 * The reference is no longer the *only* thing that attaches a source, though,
 * and deliberately so: the actions behind these forms resolve the name too
 * when no reference arrives, because at a table full of phones there are
 * several ordinary ways for a hidden field to be left behind. What follows is
 * belt to that braces — it keeps the picked reference from being lost, rather
 * than being the only thing standing between a sword and a plain line.
 *
 * Every field here is uncontrolled on purpose: React clears an uncontrolled
 * form after a server action resolves, so the name and the hidden references
 * empty themselves together. A controlled value would survive the reset and
 * the next item would silently inherit the last one's source.
 */

/** Long enough that a pause reads as "done typing", short enough to feel live. */
const DEBOUNCE_MS = 250;

type Suggestion =
  | { kind: "item"; value: ItemSuggestion }
  | { kind: "spell"; value: SpellSuggestion };

export function AutocompleteInput({
  characterId,
  kind,
  name,
  placeholder,
  locale,
  required = false,
  className = "",
}: {
  characterId: string;
  kind: "item" | "spell";
  name: string;
  placeholder?: string;
  locale: Locale;
  required?: boolean;
  className?: string;
}) {
  const t = makeT(locale);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const srdRef = useRef<HTMLInputElement>(null);
  const worldRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /** Answers arrive out of order; only the newest question's answer counts. */
  const asked = useRef(0);

  // Only ever asks; emptying the list is the keystroke handler's job, so this
  // effect has no synchronous state write to cascade off.
  useEffect(() => {
    if (!query) return;
    const ticket = (asked.current += 1);
    const timer = setTimeout(async () => {
      const found: Suggestion[] =
        kind === "item"
          ? (await searchItemsForCharacter(characterId, query)).map((value) => ({
              kind: "item" as const,
              value,
            }))
          : (await searchSpellsForCharacter(characterId, query)).map((value) => ({
              kind: "spell" as const,
              value,
            }));
      if (ticket !== asked.current) return;
      setItems(found);
      setActive(-1);
      setOpen(found.length > 0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [characterId, kind, query]);

  /** Any keystroke of their own detaches whatever they picked before. */
  function clearRefs() {
    if (srdRef.current) srdRef.current.value = "";
    if (worldRef.current) worldRef.current.value = "";
  }

  function choose(suggestion: Suggestion) {
    if (inputRef.current) inputRef.current.value = suggestion.value.name;
    clearRefs();
    // A library entry is named by its row id, everything else by its SRD index.
    const field =
      suggestion.kind === "item" && suggestion.value.source === "world" ? worldRef : srdRef;
    if (field.current) field.current.value = suggestion.value.ref;
    setOpen(false);
    setActive(-1);
    setQuery("");
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      // An open list makes Enter a choice, never a submit: with a row
      // highlighted it takes that row, and with none it takes the first, which
      // is the row the typist was looking at. Submitting here was how a
      // half-typed "Leath" used to become a hand-typed line — and it is only
      // ever an Enter *while suggestions are showing* that is stolen; a closed
      // list (Escape, no matches, nothing typed) submits as it always did.
      event.preventDefault();
      choose(active >= 0 ? items[active] : items[0]);
    }
  }

  return (
    <div className="relative w-full min-w-0">
      <Input
        ref={inputRef}
        name={name}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={className}
        onChange={(event) => {
          clearRefs();
          const next = event.currentTarget.value.trim();
          setQuery(next);
          if (!next) {
            setItems([]);
            setOpen(false);
          }
        }}
        onKeyDown={onKeyDown}
        // Reads the field rather than the query state: after the form submits,
        // React empties the input but no keystroke ran to clear the last
        // list, and coming back to a blank box should not reopen it.
        onFocus={() => setOpen(items.length > 0 && inputRef.current?.value.trim() !== "")}
        onBlur={() => setOpen(false)}
      />
      {/*
        What the row will point at — empty unless something was picked, and
        re-emptied by the form's own reset. Only the reference travels: the
        slot and the bonuses are re-read server-side from the row it names, so
        a hand-edited field cannot mint a +10 ring out of nothing.
      */}
      <input type="hidden" name="srdIndex" ref={srdRef} defaultValue="" />
      {kind === "item" && (
        <input type="hidden" name="worldItemId" ref={worldRef} defaultValue="" />
      )}

      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-sm border border-ink-600 bg-ink-900 shadow-lg shadow-ink-950/60"
        >
          {items.map((suggestion, i) => (
            <li key={`${suggestion.kind}-${suggestion.value.ref}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                // Pointer, not mouse: a finger produces `pointerdown` first
                // and reliably, while the synthesised `mousedown` arrives late
                // enough that the field's own blur can close the list out from
                // under the tap — which is exactly how a phone used to lose a
                // pick. preventDefault here also suppresses that compatibility
                // mousedown, so the choice is made once.
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(suggestion);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm transition ${
                  i === active ? "bg-gold-500/15 text-gold-300" : "text-parchment-100"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{suggestion.value.name}</span>
                <span className="shrink-0 text-[11px] text-parchment-500">
                  {meta(suggestion, t)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The dim right-hand line: where it comes from and what it does. */
function meta(suggestion: Suggestion, t: ReturnType<typeof makeT>) {
  if (suggestion.kind === "spell") {
    const { level, school } = suggestion.value;
    const levelText =
      level === 0 ? t("compendium.spells.cantrip") : t("character.sheet.levelN", { n: level });
    return `${levelText} · ${school}`;
  }
  const { source, category, slot, bonuses } = suggestion.value;
  return [
    t(`character.autocomplete.${source}`),
    t(`world.items.categories.${category}`),
    slot && t(`world.items.slots.${slot}`),
    bonuses,
  ]
    .filter(Boolean)
    .join(" · ");
}
