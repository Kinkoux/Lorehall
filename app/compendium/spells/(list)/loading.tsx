import { FilterBarSkeleton, ListSkeleton, PageSkeleton, SkeletonBar } from "../../Skeleton";

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonBar className="h-3.5 w-28" />
      <SkeletonBar className="mt-3 mb-6 h-8 w-36" />
      {/* Level, class, school, subclass. Nothing derives this number — it is
          hand-matched to the count of `<Select>`s in the form on page.tsx, and
          moves when that form does. */}
      <FilterBarSkeleton facets={4} />
      <SkeletonBar className="mb-4 h-4 w-24" />
      <ListSkeleton badge />
    </PageSkeleton>
  );
}
