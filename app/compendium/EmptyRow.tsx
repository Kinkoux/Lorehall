import Link from "next/link";

/**
 * A shelf the filters have swept bare.
 *
 * The lists used to answer with one grey sentence in a bordered box, which
 * looked less like an empty shelf than like a broken one. This puts the
 * matching vignette above it and, when something is actually narrowing the
 * list, the way back out: the bare list path, which is the very URL the
 * "clear all" link in ActiveFilters goes to.
 */
export function EmptyRow({
  art,
  message,
  clearHref,
  clearLabel,
}: {
  art: string;
  message: string;
  /** The bare list path, or null when nothing is filtering anything. */
  clearHref: string | null;
  clearLabel: string;
}) {
  return (
    <li className="px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art}
        alt=""
        loading="lazy"
        decoding="async"
        className="mx-auto mb-3 w-24 opacity-70"
      />
      <p className="text-center text-sm text-parchment-500">{message}</p>
      {clearHref && (
        <p className="mt-2 text-center">
          <Link
            href={clearHref as never}
            className="text-xs font-semibold text-parchment-500 underline underline-offset-2 transition hover:text-gold-300"
          >
            {clearLabel}
          </Link>
        </p>
      )}
    </li>
  );
}
