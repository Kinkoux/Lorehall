import type { ComponentType } from "react";
import { ITEMS, MONSTERS, SPELLS } from "@/lib/srd-data";
import { IconBook, IconChest, IconClaw, IconScroll } from "@/components/Icons";

/**
 * The four shelves anyone may walk up to without an account.
 *
 * The landing page and the compendium hub each used to keep their own list,
 * and the two had drifted: the landing offered no items, the hub no rules.
 * One list, two readings — each page renders it in its own furniture, but
 * neither one decides any more *what* the hall holds. The counts come off the
 * data rather than out of a sentence, so a shelf can never advertise a number
 * it no longer has; the copy beside them says nothing about size.
 */
export type Shelf = {
  href: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Dictionary key for the shelf's name, e.g. "landing.browse.spells". */
  titleKey: string;
  /** Dictionary key for the line beneath it. */
  bodyKey: string;
  /** How many entries sit on the shelf; null where counting means nothing. */
  count: number | null;
};

export const SHELVES: Shelf[] = [
  {
    href: "/compendium/spells",
    icon: IconBook,
    titleKey: "landing.browse.spells",
    bodyKey: "landing.browse.spellsBody",
    count: SPELLS.length,
  },
  {
    href: "/compendium/monsters",
    icon: IconClaw,
    titleKey: "landing.browse.monsters",
    bodyKey: "landing.browse.monstersBody",
    count: MONSTERS.length,
  },
  {
    href: "/compendium/items",
    icon: IconChest,
    titleKey: "landing.browse.items",
    bodyKey: "landing.browse.itemsBody",
    count: ITEMS.length,
  },
  {
    // The rules are prose, not entries: a tally of them would mean nothing.
    href: "/reference",
    icon: IconScroll,
    titleKey: "landing.browse.reference",
    bodyKey: "landing.browse.referenceBody",
    count: null,
  },
];
