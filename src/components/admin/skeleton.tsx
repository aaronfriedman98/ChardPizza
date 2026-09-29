/** Route loading states. Shown by Next the instant a nav link is tapped, before data arrives. */

export function PageSkeleton({ title = true, stats = 0, rows = 6, cards = 0 }: { title?: boolean; stats?: number; rows?: number; cards?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      {title && (
        <div className="space-y-2">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-72 max-w-full" />
        </div>
      )}
      {stats > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="card space-y-2 p-3">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-6 w-20" />
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
      )}
      {cards > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="card space-y-3">
              <div className="flex justify-between">
                <div className="skeleton h-5 w-36" />
                <div className="skeleton h-5 w-14" />
              </div>
              <div className="flex gap-2">
                <div className="skeleton h-4 w-14 rounded-full" />
                <div className="skeleton h-4 w-20 rounded-full" />
              </div>
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-4 w-32" />
              <div className="flex gap-2 pt-1">
                <div className="skeleton h-8 w-16" />
                <div className="skeleton h-8 w-20" />
                <div className="skeleton h-8 w-16" />
              </div>
            </div>
          ))}
        </div>
      )}
      {rows > 0 && (
        <div className="card divide-y divide-line p-0">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3.5">
              <div className="skeleton h-4 w-20" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-3 w-3/4" />
              </div>
              <div className="skeleton h-4 w-16" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
