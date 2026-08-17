import Link from "next/link";

/**
 * Numbered page links for the compendium lists. Preserves the active filters
 * by re-serializing the current search params with the new page number.
 */
export function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  const href = (n: number) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== "")
    );
    if (n > 1) query.set("page", String(n));
    else query.delete("page");
    const qs = query.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  return (
    <nav className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) =>
        n === page ? (
          <span
            key={n}
            aria-current="page"
            className="flex h-8 min-w-8 items-center justify-center rounded-sm bg-gold-500 px-2 font-mono text-sm font-bold text-ink-900"
          >
            {n}
          </span>
        ) : (
          <Link
            key={n}
            href={href(n) as never}
            className="flex h-8 min-w-8 items-center justify-center rounded-sm border border-ink-600 px-2 font-mono text-sm font-bold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300"
          >
            {n}
          </Link>
        )
      )}
    </nav>
  );
}
