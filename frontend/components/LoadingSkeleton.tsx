interface SkeletonProps {
  className?: string;
}

function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded bg-slate-800 ${className}`} />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-36 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-800">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="divide-y divide-slate-800">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-5">
      <Skeleton className="h-5 w-40 mb-4" />
      <div className="animate-pulse rounded-lg bg-slate-800 w-full" style={{ height }} />
    </div>
  );
}

export default Skeleton;
