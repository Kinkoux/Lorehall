import type { ReactNode } from "react";

/**
 * The shape a compendium page holds while it is still being fetched.
 *
 * These lists are the slow thing the hall does — six hundred engraved plates
 * and a search that picks among them — so the fallback draws the furniture
 * rather than a spinner: the plate square, the name beside it, the meta that
 * trails off the end. Nothing here says anything, on purpose; the bars are
 * marked away from the reading order rather than announced, because a page
 * that is about to arrive has no news for a screen reader.
 *
 * The pulse is a courtesy. A reader who has asked their system for less
 * motion gets the same grey bars, standing still.
 */

/** One grey bar of the ledger. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-sm bg-ink-700/70 motion-reduce:animate-none ${className}`}
    />
  );
}

/**
 * Widths for the name bars, cycled down the list. Rows of identical length
 * read as a table of one repeated word; uneven ones read as names.
 */
const NAME_WIDTHS = ["w-40", "w-56", "w-32", "w-48", "w-64", "w-36", "w-52", "w-44"];

/**
 * A list of entry rows. `badge` reserves the narrow column the spell and
 * monster lists keep for a level or a challenge rating.
 */
export function ListSkeleton({ rows = 10, badge = false }: { rows?: number; badge?: boolean }) {
  return (
    <ul className="divide-y divide-ink-700 rounded-sm border border-ink-700 bg-ink-900/85">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <SkeletonBar className="h-10 w-10 shrink-0" />
          {badge && <SkeletonBar className="h-3 w-10 shrink-0" />}
          <SkeletonBar className={`h-3.5 max-w-full ${NAME_WIDTHS[i % NAME_WIDTHS.length]}`} />
          <SkeletonBar className="ml-auto hidden h-3 w-28 shrink-0 sm:block" />
        </li>
      ))}
    </ul>
  );
}

/** A row of filter controls: the name box, then however many facets. */
export function FilterBarSkeleton({ facets = 0 }: { facets?: number }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <SkeletonBar className="col-span-2 h-9 sm:w-56" />
      {Array.from({ length: facets }, (_, i) => (
        <SkeletonBar key={i} className="h-9 sm:w-36" />
      ))}
      <SkeletonBar className="h-9 sm:w-24" />
    </div>
  );
}

/** Line lengths for a paragraph of prose, the last one short as prose ends. */
const PROSE_WIDTHS = ["w-full", "w-full", "w-11/12", "w-full", "w-2/3"];

/**
 * The shape of one entry rather than a list of them: the way back, a name with
 * its subtitle, the plate beside it, a card of facts, then the description.
 *
 * Each detail segment keeps its own `loading.tsx` built on this, because a
 * fallback is inherited downwards — without one here the nearest ancestor's
 * would answer, and that is the list, so following a name showed ten grey rows
 * of a list the reader had just left. `figure` is the plate's width, which the
 * bestiary draws wider than the other two.
 */
export function DetailSkeleton({
  figure = "w-24 sm:w-28",
  facts = 6,
}: {
  figure?: string;
  facts?: number;
}) {
  return (
    <>
      <SkeletonBar className="h-3.5 w-28" />
      <div className="mt-2 mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <SkeletonBar className="h-8 w-64 max-w-full" />
          <SkeletonBar className="mt-2 h-3.5 w-48 max-w-full" />
        </div>
        <SkeletonBar className={`aspect-square shrink-0 ${figure}`} />
      </div>
      <div className="mb-6 rounded-sm border border-ink-700 bg-ink-900/85 p-4">
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {Array.from({ length: facts }, (_, i) => (
            <SkeletonBar key={i} className="h-3.5 w-full max-w-[15rem]" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {PROSE_WIDTHS.map((width, i) => (
          <SkeletonBar key={i} className={`h-3.5 ${width}`} />
        ))}
      </div>
    </>
  );
}

/**
 * The page frame. The site header is rendered by each page rather than by the
 * layout, so it goes down with the page it belongs to; without a stand-in bar
 * of the same height the whole hall would jump on every navigation.
 *
 * `width` matches the column of the page being waited for — the lists run to
 * `max-w-4xl`, a single entry to `max-w-3xl` — so the text does not shift
 * sideways the moment the real page lands.
 */
export function PageSkeleton({
  children,
  width = "max-w-4xl",
}: {
  children: ReactNode;
  width?: string;
}) {
  return (
    <>
      <div
        aria-hidden
        className="sticky top-0 z-40 border-b border-ink-600/70 bg-ink-900/90 backdrop-blur"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <SkeletonBar className="h-5 w-36" />
          <SkeletonBar className="ml-auto h-4 w-44" />
        </div>
      </div>
      <main aria-hidden className={`mx-auto w-full flex-1 px-4 py-8 ${width}`}>
        {children}
      </main>
    </>
  );
}
