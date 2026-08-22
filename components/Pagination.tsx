import Link from "next/link";
import { LinkPendingWash } from "@/components/LinkSpinner";

/**
 * Numbered page links for the compendium lists. Preserves the active filters
 * by re-serializing the current search params with the new page number.
 *
 * Page ten of the items list is sixty plates the browser has not seen, and on
 * a slow line the click can look like nothing happened. Each number carries a
 * wash that lights while its page is on its way — no wider button, no shift.
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
            className="relative flex h-8 min-w-8 items-center justify-center rounded-sm border border-ink-600 px-2 font-mono text-sm font-bold text-parchment-300 transition hover:border-gold-500 hover:text-gold-300"
          >
            {n}
            <LinkPendingWash />
          </Link>
        )
      )}
    </nav>
  );
}
