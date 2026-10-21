export function AppointmentsLoadingSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading your appointments"
      className="space-y-4 animate-pulse"
    >
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-6 w-32 rounded bg-gray-200" />
                <div className="h-5 w-20 rounded-full bg-gray-100" />
              </div>
              <div className="h-5 w-48 rounded bg-gray-200" />
              <div className="h-4 w-40 rounded bg-gray-100" />
              <div className="h-3 w-28 rounded bg-gray-100" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-9 w-24 rounded-lg bg-gray-200" />
              <div className="h-9 w-20 rounded-lg bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
