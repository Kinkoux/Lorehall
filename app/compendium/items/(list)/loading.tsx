import { ITEM_CATEGORIES } from "@/lib/srd-data";
import { FilterBarSkeleton, ListSkeleton, PageSkeleton, SkeletonBar } from "../../Skeleton";

/**
 * Widths for the category chip row, cycled. How many there are is not written
 * down twice: it is the real category list, plus the "all" chip that leads it,
 * read from the constant the page itself maps over. A `loading.tsx` is a server
 * component like any other, so the import costs the browser nothing — and a
 * seventh category added to the SRD would otherwise have left this fallback one
 * chip short of the page it stands in for, quietly and forever.
 */
const CHIP_WIDTHS = ["w-20", "w-24", "w-20", "w-32", "w-16", "w-28", "w-24"];
const CHIP_COUNT = ITEM_CATEGORIES.length + 1;

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonBar className="h-3.5 w-28" />
      <SkeletonBar className="mt-3 mb-6 h-8 w-40" />
      {/* No facets: this list filters by name only, since the categories are
          the chip row below rather than a select. */}
      <FilterBarSkeleton />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Array.from({ length: CHIP_COUNT }, (_, i) => (
          <SkeletonBar key={i} className={`h-7 ${CHIP_WIDTHS[i % CHIP_WIDTHS.length]}`} />
        ))}
      </div>
      <SkeletonBar className="mb-4 h-4 w-24" />
      <ListSkeleton />
    </PageSkeleton>
  );
}
