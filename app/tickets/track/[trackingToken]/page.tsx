"use client";

import { use, useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { TrackingHeroCard } from "@/components/tickets/track/TrackingHeroCard";
import { TrackingPositionMetrics } from "@/components/tickets/track/TrackingPositionMetrics";
import { TrackingDetailsCard } from "@/components/tickets/track/TrackingDetailsCard";
import { TurnNotificationBanner } from "@/components/tickets/track/TurnNotificationBanner";
import { CancelTicketDialog } from "@/components/tickets/track/CancelTicketDialog";
import { playTurnChime } from "@/lib/audio/notification-sound";
import {
  getTicketStatusBadgeConfig,
  isTicketActive,
  type TicketStatus,
} from "@/lib/formatters/ticket";

export type { TicketStatus };

interface PublicTicketTrackingData {
  ticketNumber: number;
  status: TicketStatus | string;
  peopleAhead: number;
  currentlyServing: number | null;
  estimatedWaitMinutes: number | null;
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

function TicketTrackingSkeleton() {
  return (
    <div aria-label="Loading ticket details" className="animate-pulse">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto h-4 w-40 rounded bg-gray-200" />
        <div className="mx-auto mt-4 h-16 w-36 rounded bg-gray-200" />
        <div className="mx-auto mt-4 h-6 w-28 rounded-full bg-gray-100" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-3 w-20 rounded bg-gray-200" />
          <div className="mx-auto mt-3 h-8 w-12 rounded bg-gray-200" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto h-3 w-24 rounded bg-gray-200" />
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
  const rawToken = resolvedParams?.trackingToken || navParams?.trackingToken;
  const trackingToken = typeof rawToken === "string" ? rawToken.trim() : "";

  return (
    <TicketTrackingView
      key={trackingToken}
      trackingToken={trackingToken}
    />
  );
}

function TicketTrackingView({
  trackingToken,
}: {
  trackingToken: string;
}) {
  const [data, setData] = useState<PublicTicketTrackingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const [isTurnAlertDismissed, setIsTurnAlertDismissed] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancellationNotice, setCancellationNotice] = useState<string | null>(
    null,
  );

  const prevStatusRef = useRef<string | null>(null);
  const hasAlertedChimeRef = useRef(false);
  const isCancellingRef = useRef(false);

  const activeAbortRef = useRef<AbortController | null>(null);
  const requestGenRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processTicketData = useCallback(
    (newData: PublicTicketTrackingData) => {
      const prevStatus = prevStatusRef.current;
      const isInitialLoad = prevStatus === null;

      if (isInitialLoad) {
        prevStatusRef.current = newData.status;
        if (newData.status === "CALLED") {
          // Already called on initial load: display banner, suppress auto-chime
          hasAlertedChimeRef.current = true;
          setIsTurnAlertDismissed(false);
        }
      } else {
        if (newData.status === "CALLED") {
          if (prevStatus !== "CALLED" && !hasAlertedChimeRef.current) {
            // Live transition to CALLED: play chime and display banner
            hasAlertedChimeRef.current = true;
            setIsTurnAlertDismissed(false);
            void playTurnChime();
          }
        } else {
          // Status moved away from CALLED: reset cycle state
          hasAlertedChimeRef.current = false;
          setIsTurnAlertDismissed(false);
        }
        prevStatusRef.current = newData.status;
      }

      setData(newData);
    },
    [],
  );

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
      clearPollTimer();
    };
  }, [clearPollTimer]);

  const fetchTicket = useCallback(
    async (isManualRefresh = false) => {
      if (!trackingToken) {
        setIsLoading(false);
        setIsNotFound(true);
        setData(null);
        return;
      }

      clearPollTimer();
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const currentGen = ++requestGenRef.current;

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
          { signal: controller.signal },
        );

        if (currentGen !== requestGenRef.current) return;

        if (response.status === 404) {
          setIsNotFound(true);
          setData(null);
          return;
        }

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const json: unknown = await response.json();

        if (currentGen !== requestGenRef.current) return;

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

        const trackingData = json as PublicTicketTrackingData;
        processTicketData(trackingData);
        if (isTicketActive(trackingData.status)) {
          setPollKey((k) => k + 1);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        if (currentGen === requestGenRef.current) {
          setError(
            "Unable to load ticket details at this time. Please try again.",
          );
        }
      } finally {
        if (currentGen === requestGenRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [trackingToken, clearPollTimer, processTicketData],
  );

  useEffect(() => {
    void Promise.resolve().then(() => fetchTicket());
  }, [fetchTicket]);

  const handleConfirmCancel = useCallback(async () => {
    if (!trackingToken || !data || isCancellingRef.current) {
      return;
    }

    isCancellingRef.current = true;
    setIsCancelling(true);
    setCancelError(null);

    try {
      const response = await fetch(
        `/api/tickets/track/${encodeURIComponent(trackingToken)}/cancel`,
        {
          method: "PATCH",
        },
      );

      if (response.status === 409) {
        setIsCancelDialogOpen(false);
        setCancelError(null);
        setCancellationNotice(
          "This ticket can no longer be cancelled because its status has changed.",
        );
        await fetchTicket(true);
        return;
      }

      if (!response.ok) {
        let msg = "Unable to cancel ticket at this time. Please try again.";
        try {
          const json: unknown = await response.json();
          if (
            json &&
            typeof json === "object" &&
            "error" in json &&
            typeof (json as { error: unknown }).error === "string"
          ) {
            msg = (json as { error: string }).error;
          }
        } catch {
          // ignore json parse error
        }
        setCancelError(msg);
        return;
      }

      // Successful cancellation
      setIsCancelDialogOpen(false);
      setCancelError(null);
      setCancellationNotice(null);
      const updatedData: PublicTicketTrackingData = {
        ...data,
        status: "CANCELLED",
      };
      processTicketData(updatedData);
    } catch {
      setCancelError("Unable to cancel ticket at this time. Please try again.");
    } finally {
      isCancellingRef.current = false;
      setIsCancelling(false);
    }
  }, [trackingToken, data, fetchTicket, processTicketData]);

  const isDataActive = Boolean(data && isTicketActive(data.status));

  // Automatic background polling every 10 seconds while the ticket is active and tab is visible
  useEffect(() => {
    if (!trackingToken || isNotFound || error || !isDataActive) {
      clearPollTimer();
      return;
    }

    let isCancelled = false;

    const schedulePoll = () => {
      if (isCancelled) return;
      clearPollTimer();
      pollTimerRef.current = setTimeout(async () => {
        if (isCancelled) return;
        await runPoll();
      }, 10000);
    };

    const runPoll = async () => {
      if (isCancelled) return;

      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const pollGen = ++requestGenRef.current;
      let shouldScheduleNext = true;

      try {
        const response = await fetch(
          `/api/tickets/track/${encodeURIComponent(trackingToken)}`,
          { signal: controller.signal },
        );

        if (isCancelled || pollGen !== requestGenRef.current) {
          shouldScheduleNext = false;
          return;
        }

        if (response.status === 404) {
          shouldScheduleNext = false;
          setIsNotFound(true);
          setData(null);
          return; // Stop polling when ticket is not found
        }

        if (response.ok) {
          const json: unknown = await response.json();

          if (isCancelled || pollGen !== requestGenRef.current) {
            shouldScheduleNext = false;
            return;
          }

          if (
            json &&
            typeof json === "object" &&
            "ticketNumber" in json &&
            "status" in json &&
            "queue" in json &&
            "service" in json &&
            "organization" in json
          ) {
            const updated = json as PublicTicketTrackingData;
            processTicketData(updated);

            // If updated status is terminal (COMPLETED, SKIPPED, CANCELLED), halt polling
            if (!isTicketActive(updated.status)) {
              shouldScheduleNext = false;
              return;
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          shouldScheduleNext = false;
          return;
        }
        // Non-destructive: transient background errors do not overwrite UI
      } finally {
        if (
          shouldScheduleNext &&
          !isCancelled &&
          pollGen === requestGenRef.current &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          schedulePoll();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearPollTimer();
      } else if (document.visibilityState === "visible") {
        clearPollTimer();
        void runPoll();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    // Only schedule initial poll if tab is currently visible
    if (
      typeof document === "undefined" ||
      document.visibilityState === "visible"
    ) {
      schedulePoll();
    }

    return () => {
      isCancelled = true;
      activeAbortRef.current?.abort();
      clearPollTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
    };
  }, [
    trackingToken,
    isDataActive,
    isNotFound,
    error,
    clearPollTimer,
    pollKey,
    processTicketData,
  ]);

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
          We couldn&apos;t find an active ticket matching this tracking link.
          Please check your link or discover organizations to join a queue.
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

  const statusConfig = getTicketStatusBadgeConfig(data.status, "customer");
  const isWaitingOrCalled =
    data.status === "WAITING" || data.status === "CALLED";

  const liveAnnouncement = [
    `Ticket #${data.ticketNumber} status: ${statusConfig.label}.`,
    isWaitingOrCalled
      ? data.peopleAhead === 0
        ? "You are next in line."
        : `${data.peopleAhead} ${data.peopleAhead === 1 ? "person" : "people"} ahead of you.`
      : null,
    data.counter ? `Assigned to counter ${data.counter.name}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      {/* Screen reader live region for queue updates */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>

      {/* Cancellation Notice Banner (e.g. 409 Conflict) */}
      {cancellationNotice && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm animate-in fade-in duration-200"
        >
          <svg
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          <div className="flex-1">
            <p className="font-medium text-amber-900">{cancellationNotice}</p>
          </div>
          <button
            type="button"
            onClick={() => setCancellationNotice(null)}
            className="shrink-0 rounded p-1 text-amber-600 hover:bg-amber-100 hover:text-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            aria-label="Dismiss notice"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Prominent in-app turn alert banner */}
      {data.status === "CALLED" && !isTurnAlertDismissed && (
        <TurnNotificationBanner
          ticketNumber={data.ticketNumber}
          counter={data.counter}
          onDismiss={() => setIsTurnAlertDismissed(true)}
        />
      )}

      <TrackingHeroCard
        ticketNumber={data.ticketNumber}
        status={data.status}
        statusMessage={statusConfig.message}
        organizationName={data.organization.name}
        serviceName={data.service.name}
        counter={data.counter}
      />

      {isWaitingOrCalled && (
        <TrackingPositionMetrics
          peopleAhead={data.peopleAhead}
          currentlyServing={data.currentlyServing}
          estimatedWaitMinutes={data.estimatedWaitMinutes}
        />
      )}

      <TrackingDetailsCard
        organizationName={data.organization.name}
        serviceName={data.service.name}
        queueName={data.queue.name}
        counter={data.counter}
      />

      {/* Cancel Ticket Action (only while WAITING) */}
      {data.status === "WAITING" && (
        <div className="mt-6 flex flex-col items-center">
          <button
            type="button"
            onClick={() => {
              setCancelError(null);
              setIsCancelDialogOpen(true);
            }}
            disabled={isCancelling}
            className="text-sm font-medium text-red-600 transition-colors hover:text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel this ticket
          </button>
        </div>
      )}

      {/* Cancel Ticket Confirmation Dialog */}
      <CancelTicketDialog
        isOpen={isCancelDialogOpen}
        ticketNumber={data.ticketNumber}
        serviceName={data.service.name}
        isCancelling={isCancelling}
        error={cancelError}
        onConfirm={handleConfirmCancel}
        onClose={() => {
          if (!isCancelling) {
            setIsCancelDialogOpen(false);
            setCancelError(null);
          }
        }}
      />

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
          className="rounded text-xs font-medium text-gray-500 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
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
