import Link from "next/link";

import type { CharacterAbility } from "@/lib/db";
import { fmt } from "@/lib/dnd";
import type { Locale, T } from "@/lib/i18n";
import {
  getItem,
  getSpell,
  itemNameTr,
  itemSummary,
  spellSummary,
  srdItemBonuses,
} from "@/lib/srd-data";
import { categoryArtMid, schoolArtMid } from "@/lib/ui-art";
import { STAT_LABELS, statBonusEntries } from "@/lib/world-items";
import { itemArtSrc, slotCategory } from "@/components/character/item-art";
import type { InventoryLineShape } from "@/components/character/sheet-data";

/**
 * The card a line on a character sheet shows when its name is pressed: the
 * engraving, what the thing is, the one line of mechanics, what it grants, and
 * the way through to the full entry.
 *
 * Why a card at all. A sheet at a table is read in seconds — "what does this
 * one do again?" — and the answer has always been a page away, which on a
 * phone means losing the sheet to go and find it. The compendium already holds
 * that answer; this is the smallest piece of it that settles the question
 * without anybody leaving the row they were looking at.
 *
 * Why the platform's popover rather than a fold. `<details>` is this repo's
 * usual zero-script answer and it is the wrong one here on three counts: it
 * does not close when you press somewhere else, it does not answer Escape, and
 * it pushes the rest of the sheet down, which moves the next target out from
 * under the finger that is already reaching for it. A `popover` gets all three
 * from the browser — light dismiss, Escape, and the top layer, so the card is
 * never clipped by the inventory grid's own `overflow-hidden`. It costs no
 * script either: `popovertarget` is the whole mechanism, so this file is plain
 * server markup and the sheet stays a server component.
 *
 * Everything is resolved on the server. Not a byte of the compendium's JSON
 * crosses into a bundle: `getItem`, `getSpell` and the summaries all run while
 * the page is being written, and what reaches the browser is the same finished
 * HTML the rest of the sheet is.
 */

/** What one card says, once the row's source has been asked. */
export type PreviewFacts = {
  /** The engraving, already chosen at the size the card draws it. */
  art: string | null;
  /** The heading — the name in the reader's own language where we have one. */
  title: string;
  /** Provenance under the heading: the SRD's own spelling, the kind, the slot. */
  subtitle: string | null;
  /** The mechanical one-liner — `itemSummary` / `spellSummary`. */
  summary: string | null;
  /** The opening of the entry's prose, clipped to a card's worth. */
  detail: string | null;
  /** The stored `stat_bonuses` shape, drawn as the gold strip. */
  bonuses: string | null;
  /** The full entry this is a miniature of. */
  href: string;
  /** What the way through is called — the compendium, or a world's library. */
  linkLabel: string;
};

/** As much prose as a card can hold before it stops being a glance. */
const DETAIL_MAX = 240;

function clip(text: string | null | undefined, max: number): string | null {
  const flat = text?.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}

/**
 * An inventory line's card, or null for a line that came from nowhere.
 *
 * Two sources answer, and they answer differently: the SRD knows the shape of
 * the thing and states its mechanics in one line, while a world's library
 * knows this particular piece — its photograph, and whatever its DM wrote
 * about it. A hand-typed heirloom has neither, so it gets no card at all and
 * its name stays the plain text it already was.
 */
export function itemPreview(
  item: InventoryLineShape,
  locale: Locale,
  t: T
): PreviewFacts | null {
  // Photograph, then this line's own plate, then its category's — the same
  // chain the inventory square walks, so a card cannot show a different
  // picture than the square that opened it.
  const art = itemArtSrc(item, slotCategory(item.slot)) ?? categoryArtMid("gear");

  if (item.srdIndex) {
    const srd = getItem(item.srdIndex);
    if (!srd) return null;
    // The stored name is the English the whole app resolves against; a locale
    // with its own word for the thing gets to say that word here, and the
    // SRD's spelling drops to the line beneath — which is where a reader wants
    // it, because the prose under that is in the SRD's language too.
    const title = (locale === "tr" && itemNameTr(item.srdIndex)) || item.name;
    return {
      art,
      title,
      subtitle:
        [
          title !== srd.name ? srd.name : null,
          t(`compendium.items.categories.${srd.category}`),
          srd.attunement ? t("compendium.items.attunement") : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      summary: itemSummary(srd),
      detail: clip(srd.desc, DETAIL_MAX),
      // What this copy grants, which is the number the armour maths actually
      // counts. The book's own answer is the net beneath it: every SRD line is
      // stocked with `srdItemBonuses` as its snapshot, so the two are one fact
      // by construction, and the fallback only ever answers for a row stocked
      // before there was a column to snapshot into.
      bonuses: item.bonuses ?? srdItemBonuses(srd),
      href: `/compendium/items/${item.srdIndex}`,
      linkLabel: t("character.sheet.openInCompendium"),
    };
  }

  if (item.worldItemId && item.sourceWorldId) {
    return {
      art,
      title: item.name,
      subtitle:
        [
          item.category ? t(`world.items.categories.${item.category}`) : null,
          item.slot ? t(`world.items.slots.${item.slot}`) : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      // A forged piece states no SRD mechanics, so its own description is the
      // whole of what it has to say — and it says it as the detail, where the
      // clamp is, because a DM's prose has no length to promise.
      summary: null,
      detail: clip(item.sourceDescription, DETAIL_MAX),
      bonuses: item.bonuses,
      href: `/w/${item.sourceWorldId}#wi-${item.worldItemId}`,
      linkLabel: t("character.sheet.openInLibrary"),
    };
  }

  return null;
}

/**
 * A spell line's card. The SRD is the only source a spell line can name, and
 * spell names are the one thing the app deliberately leaves untranslated (see
 * lib/srd-data.ts) — so there is no second spelling to show, and the subtitle
 * carries instead what `spellSummary` leaves out: who may cast the thing, and
 * whether it can be cast as a ritual.
 */
export function spellPreview(ability: CharacterAbility, t: T): PreviewFacts | null {
  if (!ability.srdIndex) return null;
  const spell = getSpell(ability.srdIndex);
  if (!spell) return null;
  return {
    art: schoolArtMid(spell.school),
    title: ability.name,
    subtitle:
      [spell.classes.join(", ") || null, spell.ritual ? t("compendium.spells.ritual") : null]
        .filter(Boolean)
        .join(" · ") || null,
    summary: spellSummary(spell),
    detail: clip(spell.desc, DETAIL_MAX),
    bonuses: null,
    href: `/compendium/spells/${ability.srdIndex}`,
    linkLabel: t("character.sheet.openInCompendium"),
  };
}

/** The face a row's name wears, whether it opens a card or merely links. */
export const NAME_CLASS =
  "text-parchment-100 underline decoration-ink-600 underline-offset-2 transition hover:text-gold-300 hover:decoration-gold-500";

/**
 * A row's name, as the thing that opens its card.
 *
 * Three elements, two of which are the same name twice over. The button is the
 * real one — it invokes the popover, and it is what every browser of the last
 * three years draws. The link beside it is the floor: a browser with no
 * popover at all is served the plain link the sheet had before any of this,
 * and the `title` both of them carry is the floor beneath *that*. Which of the
 * two is drawn is settled by one `@supports` rule in app/globals.css, so
 * neither has to ask a script what the browser can do.
 *
 * The press box comes to 44px without the row growing by a pixel: the button
 * is `display: inline`, so its vertical padding widens what a thumb can land
 * on while the line it sits in keeps its own height.
 */
export function PreviewLink({
  id,
  name,
  facts,
  title,
  linkTitle,
  t,
}: {
  /** The row's own id — what ties this invoker to this card, and only this one. */
  id: string;
  /** What the row is called on the sheet. */
  name: string;
  facts: PreviewFacts;
  /** The native tooltip on the press — the layer under the card. */
  title: string;
  /** The native tooltip on the plain link that stands in where cards cannot. */
  linkTitle: string;
  t: T;
}) {
  const cardId = `pv-${id}`;
  // The anchor a card hangs off wherever the browser can hang it: one dashed
  // ident per row, which is what keeps two cards from borrowing each other's
  // position. A browser without anchor positioning ignores it wholesale, which
  // is why the card's own placement never depends on it (see globals.css).
  const anchorName = `--pv-${id}`;
  const bonuses = statBonusEntries(facts.bonuses);

  return (
    <>
      <button
        type="button"
        popoverTarget={cardId}
        title={title}
        data-preview-invoker=""
        style={{ anchorName }}
        className={`${NAME_CLASS} inline cursor-pointer py-2.5 text-left focus-visible:outline-2 focus-visible:outline-gold-400`}
      >
        {name}
      </button>
      <Link href={facts.href} title={linkTitle} data-preview-fallback="" className={NAME_CLASS}>
        {name}
      </Link>

      <div
        id={cardId}
        popover="auto"
        data-preview=""
        style={{ positionAnchor: anchorName }}
        className="max-h-[min(70vh,26rem)] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-sm border border-ink-600 bg-ink-900 p-3 text-parchment-100 shadow-lg shadow-[#5e4420]/25 outline outline-1 outline-ink-700/45 outline-offset-[-5px]"
      >
        <div className="flex gap-3">
          {facts.art && (
            // The card is a miniature of the compendium entry, so it shows that
            // entry's picture — at 64px, 80 from `sm` up, which the 256px cut
            // covers on a doubled screen. The plate is already on the page for
            // the square that opened this, so drawing it twice costs nothing.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={facts.art}
              alt=""
              width={80}
              height={80}
              loading="lazy"
              decoding="async"
              className="h-16 w-16 shrink-0 rounded-sm border border-ink-700 object-cover sm:h-20 sm:w-20"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold leading-snug text-parchment-100">
              {facts.title}
            </p>
            {facts.subtitle && (
              <p className="mt-0.5 text-[11px] italic leading-snug text-parchment-500">
                {facts.subtitle}
              </p>
            )}
            {facts.summary && (
              <p className="mt-1.5 text-xs leading-relaxed text-parchment-300">{facts.summary}</p>
            )}
            {bonuses.length > 0 && (
              <p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                {bonuses.map(([stat, value]) => (
                  <span key={stat} className="font-semibold text-gold-300">
                    {fmt(value)} {STAT_LABELS[stat]}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>

        {facts.detail && (
          <p className="mt-2.5 line-clamp-4 border-t border-ink-700 pt-2 text-xs leading-relaxed text-parchment-300">
            {facts.detail}
          </p>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <Link
            href={facts.href}
            className="inline-flex min-h-11 items-center text-xs font-bold text-gold-300 underline decoration-gold-500/50 underline-offset-2 transition hover:text-gold-400"
          >
            {facts.linkLabel}
          </Link>
          {/* Light dismiss covers a mouse, and Escape covers a keyboard; this
              knob is for the thumb already holding the phone by its edge, and
              for anybody who would rather be told the card can be put away. */}
          <button
            type="button"
            popoverTarget={cardId}
            popoverTargetAction="hide"
            aria-label={t("character.sheet.closePreview")}
            className="h-11 w-11 shrink-0 cursor-pointer rounded border border-ink-600 text-xs font-bold text-parchment-500 transition hover:border-gold-500 hover:text-gold-300"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
