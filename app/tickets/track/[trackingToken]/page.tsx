"use client";

import { use, useState, useEffect, useCallback, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export type TicketStatus =
  | "WAITING"
  | "CALLED"
  | "SERVING"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED";

interface PublicTicketTrackingData {
  ticketNumber: number;
  status: TicketStatus | string;
  peopleAhead: number;
  currentlyServing: number | null;
  queue: {
    name: string;
  };
  service: {
    name: string;
  };
  organization: {
    name: string;
  };
  counter: {
    name: string;
  } | null;
}

interface PageProps {
  params: Promise<{ trackingToken: string }>;
}

function getStatusBadgeConfig(status: string) {
  switch (status) {
    case "WAITING":
      return {
        label: "Waiting in Line",
        badgeClasses: "bg-amber-50 text-amber-800 border-amber-200/80",
        dotClass: "bg-amber-500",
        message: "You are currently in line. Please keep this page open to watch your position.",
      };
    case "CALLED":
      return {
        label: "Ticket Called",
        badgeClasses: "bg-blue-50 text-blue-800 border-blue-200/80 animate-pulse",
        dotClass: "bg-blue-600",
        message: "Your ticket has been called! Please head to the counter.",
      };
    case "SERVING":
      return {
        label: "Now Serving",
        badgeClasses: "bg-green-50 text-green-800 border-green-200/80",
        dotClass: "bg-green-600",
        message: "You are currently being served.",
      };
    case "COMPLETED":
      return {
        label: "Completed",
        badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
        dotClass: "bg-gray-500",
        message: "This service session has been completed. Thank you!",
      };
    case "SKIPPED":
      return {
        label: "Skipped",
        badgeClasses: "bg-orange-50 text-orange-800 border-orange-200/80",
        dotClass: "bg-orange-500",
        message: "Your ticket was skipped. Please speak with staff if you need assistance.",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        badgeClasses: "bg-red-50 text-red-800 border-red-200/80",
        dotClass: "bg-red-500",
        message: "This ticket has been cancelled.",
      };
    default:
      return {
        label: status,
        badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
        dotClass: "bg-gray-500",
        message: `Ticket status: ${status}`,
      };
  }
}

function TicketTrackingSkeleton() {
  return (
    <div aria-label="Loading ticket details" className="animate-pulse">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto h-4 w-40 rounded bg-gray-200" />
        <div className="mx-auto mt-4 h-16 w-36 rounded bg-gray-200" />
        <div className="mx-auto mt-4 h-6 w-28 rounded-full bg-gray-100" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-3 w-20 rounded bg-gray-200" />
          <div className="mx-auto mt-3 h-8 w-12 rounded bg-gray-200" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-3 w-24 rounded bg-gray-200" />
          <div className="mx-auto mt-3 h-8 w-12 rounded bg-gray-200" />
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 h-4 w-28 rounded bg-gray-200" />
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-full rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

function TicketTrackingContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ trackingToken: string }>;
}) {
  const resolvedParams = use(paramsPromise);
  const navParams = useParams<{ trackingToken: string }>();
  const trackingToken =
    resolvedParams?.trackingToken || navParams?.trackingToken;

  const [data, setData] = useState<PublicTicketTrackingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const fetchTicket = useCallback(
    async (isManualRefresh = false) => {
      if (!trackingToken) return;

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      setIsNotFound(false);

      try {
        const response = await fetch(
          `/api/tickets/track/${encodeURIComponent(trackingToken)}`,
        );

        if (response.status === 404) {
          setIsNotFound(true);
          setData(null);
          return;
        }

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const json: unknown = await response.json();

        if (
          !json ||
          typeof json !== "object" ||
          !("ticketNumber" in json) ||
          !("status" in json) ||
          !("queue" in json) ||
          !("service" in json) ||
          !("organization" in json)
        ) {
          throw new Error("Malformed response format");
        }

        setData(json as PublicTicketTrackingData);
      } catch {
        setError(
          "Unable to load ticket details at this time. Please try again.",
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [trackingToken],
  );

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  if (isLoading) {
    return <TicketTrackingSkeleton />;
  }

  if (isNotFound) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-xl font-semibold text-gray-900">
          Ticket not found
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          We couldn&apos;t find an active ticket matching this tracking link. Please check your link or discover organizations to join a queue.
        </p>
        <div className="mt-6">
          <Link
            href="/organizations"
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Explore Organizations
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
      >
        <p className="text-base font-medium">{error}</p>
        <button
          type="button"
          onClick={() => fetchTicket(false)}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const statusConfig = getStatusBadgeConfig(data.status);
  const isWaitingOrCalled = data.status === "WAITING" || data.status === "CALLED";

  return (
    <div>
      {/* Hero Ticket Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-gray-500">
          {data.organization.name} &bull; {data.service.name}
        </p>

        <div className="mt-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Your Ticket Number
          </span>
          <h1 className="mt-1 text-6xl font-black tracking-tight text-gray-900 sm:text-7xl">
            #{data.ticketNumber}
          </h1>
        </div>

        <div className="mt-5 flex justify-center">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusConfig.badgeClasses}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`}
              aria-hidden="true"
            />
            {statusConfig.label}
          </span>
        </div>

        <p className="mt-3 text-sm text-gray-600">{statusConfig.message}</p>

        {data.counter && (
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/80 p-3.5 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Assigned Counter
            </span>
            <p className="mt-0.5 text-base font-bold text-blue-900">
              {data.counter.name}
            </p>
          </div>
        )}
      </div>

      {/* Position Metrics (Visible when waiting or called) */}
      {isWaitingOrCalled && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              People Ahead
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              {data.peopleAhead}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {data.peopleAhead === 0
                ? "You are next in line!"
                : data.peopleAhead === 1
                  ? "1 person ahead of you"
                  : `${data.peopleAhead} people ahead of you`}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Currently Serving
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              {data.currentlyServing !== null
                ? `#${data.currentlyServing}`
                : "None"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {data.currentlyServing !== null
                ? "Active ticket at counter"
                : "No ticket being served yet"}
            </p>
          </div>
        </div>
      )}

      {/* Details Card */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Queue Details
        </h2>
        <dl className="divide-y divide-gray-100 text-sm">
          <div className="flex justify-between py-2.5">
            <dt className="text-gray-500">Organization</dt>
            <dd className="font-medium text-gray-900">
              {data.organization.name}
            </dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-gray-500">Service</dt>
            <dd className="font-medium text-gray-900">{data.service.name}</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-gray-500">Queue</dt>
            <dd className="font-medium text-gray-900">{data.queue.name}</dd>
          </div>
          {data.counter && (
            <div className="flex justify-between py-2.5">
              <dt className="text-gray-500">Counter</dt>
              <dd className="font-medium text-gray-900">
                {data.counter.name}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Manual Refresh Action */}
      <div className="mt-8 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fetchTicket(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 active:scale-[0.98] disabled:opacity-50"
        >
          <svg
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
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
          {isRefreshing ? "Updating..." : "Refresh Status"}
        </button>

        <Link
          href="/organizations"
          className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 rounded"
        >
          Explore other organizations &rarr;
        </Link>
      </div>
    </div>
  );
}

export default function TicketTrackingPage({ params }: PageProps) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <Suspense fallback={<TicketTrackingSkeleton />}>
            <TicketTrackingContent paramsPromise={params} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
