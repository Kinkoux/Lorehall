"use client";

import { useLinkStatus } from "next/link";

/**
 * Pending marks for links that re-fetch a whole list.
 *
 * Both must be rendered *inside* the `<Link>` they speak for — that is what
 * `useLinkStatus` reads. Both are always in the layout and only change
 * opacity, so nothing shifts a pixel when the mark appears, and both stand
 * still for a reader who has asked for less motion. When the destination is
 * already in the prefetch cache the pending phase never happens and neither
 * one is ever seen, which is the intended outcome rather than a failure of it.
 */

/** A hairline ring that turns beside a chip's label while the list re-fetches. */
export function LinkSpinner() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`inline-block h-3 w-3 shrink-0 rounded-full border-2 border-current border-r-transparent transition-opacity duration-150 motion-reduce:animate-none ${
        pending ? "animate-spin opacity-70" : "opacity-0"
      }`}
    />
  );
}

/**
 * A gilt wash over a control too small to hold a ring — a page number, say,
 * where a spinner beside the digit would double the button's width.
 */
export function LinkPendingWash() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-sm bg-gold-500/25 transition-opacity duration-150 ${
        pending ? "animate-pulse opacity-100 motion-reduce:animate-none" : "opacity-0"
      }`}
    />
  );
}
