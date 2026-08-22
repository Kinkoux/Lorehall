"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevron } from "@/components/Icons";

/**
 * The battle map, with a lid on it where the screen is narrow.
 *
 * A phone held over the table gives the map five hundred pixels and the
 * initiative order whatever is left, which is nothing — the list everyone
 * actually reads starts below the fold. On a wide screen there is room for
 * both, so the lid starts off.
 *
 * The measurement only answers a question the reader has not: the first time
 * they work the lid themselves, their answer stands for the rest of the
 * session. A DM who folds the map away on a wide screen meant it, and a tablet
 * turned from landscape to portrait is a change of grip, not of mind.
 *
 * The open state is React's, not the DOM's, because the session page re-renders
 * itself every three seconds; an uncontrolled `<details>` would have the
 * server's idea of "open" pushed back over the reader's every time.
 */
export function MapFold({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  // Open until the first measurement: with no script at all the map is simply
  // there, which is the wide screen's answer anyway.
  const [open, setOpen] = useState(true);
  // A ref, not state: the media listener reads this without wanting to be torn
  // down and rebuilt — and rebuilding it would re-run the measurement, which is
  // the one thing a reader's own choice is meant to stop.
  const userToggled = useRef(false);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      if (userToggled.current) return;
      setOpen(wide.matches);
    };
    apply();
    wide.addEventListener("change", apply);
    return () => wide.removeEventListener("change", apply);
  }, []);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="[&>summary]:list-none [&>summary::-webkit-details-marker]:hidden"
    >
      {/* The click is what marks the reader's intent. The toggle event cannot:
          it fires for the media listener's own opening and closing too, and
          would have the lid claim it was asked for. */}
      <summary
        onClick={() => {
          userToggled.current = true;
        }}
        className="flex min-h-11 cursor-pointer items-center gap-2"
      >
        <span className="flex flex-1 flex-wrap items-center gap-2">{summary}</span>
        {/* A shut lid has to show its handle at every width — the play bar's
            map mark scrolls the table here, and a closed box with no chevron
            is a dead end for the rest of the session. Open on a wide screen
            there is nothing to offer, so the mark steps out and the row reads
            as the plain heading it was. */}
        <IconChevron
          size={16}
          className={`shrink-0 text-parchment-500 transition-transform ${
            open ? "rotate-90 lg:hidden" : ""
          }`}
        />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
