export interface TrackingPositionMetricsProps {
  peopleAhead: number;
  currentlyServing: number | null;
  estimatedWaitMinutes?: number | null;
}

/**
 * Metric cards presenting real-time queue position ("People Ahead"),
 * current counter activity ("Currently Serving"), and waiting time estimate ("Estimated Wait").
 */
export function TrackingPositionMetrics({
  peopleAhead,
  currentlyServing,
  estimatedWaitMinutes,
}: TrackingPositionMetricsProps) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          People Ahead
        </p>
        <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
          {peopleAhead}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {peopleAhead === 0
            ? "You are next in line!"
            : peopleAhead === 1
              ? "1 person ahead of you"
              : `${peopleAhead} people ahead of you`}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Currently Serving
        </p>
        <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
          {currentlyServing !== null ? `#${currentlyServing}` : "None"}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {currentlyServing !== null
            ? "Active ticket at counter"
            : "No ticket being served yet"}
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Estimated Wait
        </p>
        <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
          {estimatedWaitMinutes !== null && estimatedWaitMinutes !== undefined
            ? `~${estimatedWaitMinutes} min`
            : "Unavailable"}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {estimatedWaitMinutes !== null && estimatedWaitMinutes !== undefined
            ? "Estimated time, not a guarantee"
            : "Estimate currently unavailable"}
        </p>
      </div>
    </div>
  );
}
