import { FilterBarSkeleton, ListSkeleton, PageSkeleton, SkeletonBar } from "../../Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonBar className="h-3.5 w-28" />
      <SkeletonBar className="mt-3 mb-6 h-8 w-48" />
      {/* Challenge rating, type, size. Hand-matched to the count of
          `<Select>`s in the form on page.tsx; there is no constant to read it
          from, so it moves when that form does. */}
      <FilterBarSkeleton facets={3} />
      <SkeletonBar className="mb-4 h-4 w-24" />
      <ListSkeleton badge />
    </PageSkeleton>
  );
}
