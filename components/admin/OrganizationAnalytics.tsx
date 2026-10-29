"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface OrganizationAnalyticsData {
  date: string;
  timezone: string;
  totalCreatedToday: number;
  completedToday: number;
  currentlyWaiting: number;
  currentlyServing: number;
  averageWaitMinutes: number | null;
  skippedToday: number;
  cancelledToday: number;
}

export interface OrganizationAnalyticsProps {
  organizationId: string;
}

function AnalyticsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading organization analytics"
      className="space-y-4 animate-pulse"
    >
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-gray-200" />
          <div className="h-3 w-56 rounded bg-gray-100" />
        </div>
        <div className="h-8 w-24 rounded-lg bg-gray-200" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm space-y-3"
          >
            <div className="mx-auto h-3 w-24 rounded bg-gray-200" />
            <div className="mx-auto h-8 w-16 rounded bg-gray-200" />
            <div className="mx-auto h-2.5 w-32 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatWaitMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined) {
    return "—";
  }
  if (minutes < 1) {
    return "< 1 min";
  }
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}

/**
 * Minimal Organization Analytics dashboard presenting today's key queue performance metrics.
 */
export function OrganizationAnalytics({
  organizationId,
}: OrganizationAnalyticsProps) {
  const [data, setData] = useState<OrganizationAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(organizationId));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Stale request cancellation refs
  const activeControllerRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef<number>(0);

  // Adjust state during render when organizationId prop changes
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setData(null);
    setError(null);
    setIsLoading(Boolean(organizationId));
  }

  const performFetch = useCallback(
    (targetOrgId: string, signal: AbortSignal, fetchGen: number) => {
      Promise.resolve(
        fetch(
          `/api/organizations/${encodeURIComponent(targetOrgId)}/analytics`,
          { signal },
        ),
      )
        .then(async (response) => {
          if (signal.aborted || fetchGenerationRef.current !== fetchGen) {
            return;
          }

          if (!response.ok) {
            let errorMsg =
              "Unable to load analytics at this time. Please try again.";
            try {
              const errData = await response.json();
              if (errData && typeof errData.error === "string") {
                errorMsg = errData.error;
              }
            } catch {
              // Ignore JSON parse error on non-JSON response
            }
            throw new Error(errorMsg);
          }

          const json = (await response.json()) as OrganizationAnalyticsData;

          if (signal.aborted || fetchGenerationRef.current !== fetchGen) {
            return;
          }

          setData(json);
          setLastUpdated(new Date());
          setError(null);
        })
        .catch((err: unknown) => {
          if (signal.aborted || fetchGenerationRef.current !== fetchGen) {
            return;
          }

          const isAbort =
            (err instanceof Error && err.name === "AbortError") ||
            (typeof err === "object" &&
              err !== null &&
              "name" in err &&
              (err as { name: string }).name === "AbortError") ||
            Boolean(signal.aborted);

          if (isAbort) return;

          setError(
            err instanceof Error
              ? err.message
              : "Unable to load analytics at this time. Please try again.",
          );
        })
        .finally(() => {
          if (!signal.aborted && fetchGenerationRef.current === fetchGen) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        });
    },
    [],
  );

  useEffect(() => {
    // Abort in-flight requests from previously selected organization
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    if (!organizationId) {
      return;
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;
    const fetchGen = ++fetchGenerationRef.current;

    performFetch(organizationId, controller.signal, fetchGen);

    return () => {
      controller.abort();
      activeControllerRef.current = null;
    };
  }, [organizationId, performFetch]);

  const handleRefresh = () => {
    if (!organizationId) return;

    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    setIsRefreshing(true);

    const controller = new AbortController();
    activeControllerRef.current = controller;
    const fetchGen = ++fetchGenerationRef.current;

    performFetch(organizationId, controller.signal, fetchGen);
  };

  const handleRetry = () => {
    if (!organizationId) return;

    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();
    activeControllerRef.current = controller;
    const fetchGen = ++fetchGenerationRef.current;

    performFetch(organizationId, controller.signal, fetchGen);
  };

  if (isLoading && !data) {
    return <AnalyticsSkeleton />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
      >
        <p className="text-sm font-medium">{error}</p>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 active:scale-[0.98]"
        >
          Retry Analytics
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <section aria-labelledby="analytics-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 id="analytics-heading" className="text-lg font-bold text-gray-900">
            Today&apos;s Analytics
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Live queue metrics and daily activity overview • {data.timezone}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            aria-label="Refresh analytics data"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 active:scale-[0.98] disabled:opacity-50"
          >
            <svg
              className={`h-3.5 w-3.5 text-gray-500 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Total Tickets Created Today */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total Created
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              {data.totalCreatedToday}
            </p>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Tickets issued today
          </p>
        </div>

        {/* Card 2: Tickets Completed Today */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Completed Today
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              {data.completedToday}
            </p>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Successfully served tickets
          </p>
        </div>

        {/* Card 3: Currently Waiting Tickets */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Currently Waiting
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-blue-600">
              {data.currentlyWaiting}
            </p>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Tickets in line right now
          </p>
        </div>

        {/* Card 4: Currently Serving Tickets */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Currently Serving
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-600">
              {data.currentlyServing}
            </p>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Active at service counters
          </p>
        </div>

        {/* Card 5: Average Actual Waiting Time */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Avg Actual Wait
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              {formatWaitMinutes(data.averageWaitMinutes)}
            </p>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Time in line before being called
          </p>
        </div>

        {/* Card 6: Skipped and Cancelled Tickets Today */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Skipped &amp; Cancelled
            </p>
            <div className="mt-2 flex items-baseline justify-center gap-3">
              <div className="text-center">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-600">
                  {data.skippedToday}
                </span>
                <span className="ml-1 text-xs font-medium text-gray-500">skipped</span>
              </div>
              <span className="text-gray-300 font-light">/</span>
              <div className="text-center">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-red-600">
                  {data.cancelledToday}
                </span>
                <span className="ml-1 text-xs font-medium text-gray-500">cancelled</span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Unserved tickets today
          </p>
        </div>
      </div>
    </section>
  );
}
