import { ListSkeleton, PageSkeleton, SkeletonBar } from "../Skeleton";

/** Three shelves answer one query, so the fallback draws three short groups. */
export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonBar className="h-3.5 w-28" />
      <SkeletonBar className="mt-3 mb-6 h-8 w-52" />
      <div className="mb-6 flex flex-wrap gap-2">
        <SkeletonBar className="h-9 w-72 max-w-full" />
        <SkeletonBar className="h-9 w-24" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <section key={i} className="mb-8">
          <div className="flex items-center gap-3">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="h-[3px] flex-1" />
          </div>
          <div className="mt-3">
            <ListSkeleton rows={4} badge={i < 2} />
          </div>
        </section>
      ))}
    </PageSkeleton>
  );
}
