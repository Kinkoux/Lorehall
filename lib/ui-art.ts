import { matchClass } from "@/lib/class-match";

/**
 * URLs for the engraving plates under `public/art/`, written by
 * `scripts/convert-ui-art.mjs`.
 *
 * These are plain string constants, so a client component can reach for a
 * plate without dragging the compendium's JSON into its bundle. The one import
 * is lib/class-match.ts, which is a list of strings and imports nothing itself
 * — the reading of a free-text class lives there because the spell slot table
 * needs the same answer this module does.
 */

const ART = (name: string) => `/art/${name}.webp`;

/** The class plate for a written class, or null when nothing is recognised. */
export function classArtFor(klass: string | null | undefined): string | null {
  const slug = matchClass(klass);
  return slug ? ART(`class-${slug}`) : null;
}

/** The sigil plate for a spell school. SRD school names are English. */
export function schoolArt(school: string): string {
  return ART(`school-${school.toLowerCase()}`);
}

/** The category plate for an item: weapon, armor, gear, tool, vehicle, magic. */
export function categoryArt(category: string): string {
  return ART(`cat-${category}`);
}

/** Vignettes for the empty states, one per ledger that can stand empty. */
export const EMPTY_ART = {
  codex: ART("empty-codex"),
  inventory: ART("empty-inventory"),
  quests: ART("empty-quests"),
  journal: ART("empty-journal"),
  maps: ART("empty-maps"),
  party: ART("empty-party"),
  spells: ART("empty-spells"),
  library: ART("empty-library"),
  encounters: ART("empty-encounters"),
  treasury: ART("empty-treasury"),
} as const;
