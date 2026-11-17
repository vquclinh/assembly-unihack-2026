import { CardSkeleton, Skeleton } from "@/components/ui";

/** Shown while a route's code loads. Mirrors the usual page shape so nothing jumps. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-1/2 max-w-sm" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={3} />
      </div>
    </div>
  );
}
