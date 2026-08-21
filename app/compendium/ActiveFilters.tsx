import Link from "next/link";

export type FilterChip = {
  /** The search param this chip stands for; the chip drops exactly this key. */
  key: string;
  /** What the chip reads, already translated: "Level: 3", "CR 1/2". */
  label: string;
};

/**
 * The filters currently narrowing a compendium list, each droppable on its own.
 *
 * Every chip is a link back to this same list with one key taken out of the
 * search params — no scripting involved, which is the whole point: the lists
 * are server-rendered, and so is the way out of a filter. `page` is dropped
 * along with it, because page 7 of the old result set means nothing in the new
 * one. The trailing link clears the lot by going to the bare path.
 */
export function ActiveFilters({
  basePath,
  params,
  chips,
  heading,
  removeLabel,
  clearLabel,
}: {
  basePath: string;
  /** The list's current search params; "" means "not set". */
  params: Record<string, string>;
  chips: FilterChip[];
  heading: string;
  /** Builds the accessible name of a chip: "Remove filter: Level: 3". */
  removeLabel: (label: string) => string;
  clearLabel: string;
}) {
  if (chips.length === 0) return null;

  const withoutKey = (dropped: string) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(
        ([key, value]) => value !== "" && key !== "page" && key !== dropped
      )
    );
    const qs = query.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  return (
    <nav aria-label={heading} className="mb-4 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-parchment-500">
        {heading}
      </span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={withoutKey(chip.key) as never}
          aria-label={removeLabel(chip.label)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-gold-500 bg-gold-500/10 px-2.5 py-1 text-xs font-bold text-gold-300 transition hover:border-blood-500 hover:text-blood-400"
        >
          {chip.label}
          <span aria-hidden className="text-sm leading-none">
            ×
          </span>
        </Link>
      ))}
      <Link
        href={basePath as never}
        className="ml-1 text-xs font-semibold text-parchment-500 underline underline-offset-2 transition hover:text-gold-300"
      >
        {clearLabel}
      </Link>
    </nav>
  );
}
