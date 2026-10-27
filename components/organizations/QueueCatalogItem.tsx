"use client";

import Link from "next/link";
import type {
  PublicQueue,
  QueueAvailabilityEntry,
} from "./types";

export interface QueueCatalogItemProps {
  queue: PublicQueue;
  availability?: QueueAvailabilityEntry;
  isSubmitting: boolean;
  isAnyQueueSubmitting: boolean;
  queueError: {
    queueId: string;
    message: string;
    code?: string;
  } | null;
  onJoinQueue: (queueId: string) => void;
  onRetryAvailability: (queueId: string) => void;
}

export function QueueCatalogItem({
  queue,
  availability,
  isSubmitting,
  isAnyQueueSubmitting,
  queueError,
  onJoinQueue,
  onRetryAvailability,
}: QueueCatalogItemProps) {
  const hasError = Boolean(queueError);
  const errorId = `queue-error-${queue.id}`;

  const availData = availability?.data;
  const isAvailLoading = availability?.isLoading ?? true;
  const availError = availability?.error;
  const isKnownUnavailable = availData ? !availData.isJoinable : false;

  return (
    <div
      className={`flex flex-col rounded-lg border p-3.5 transition-colors ${
        isKnownUnavailable
          ? "border-amber-200/70 bg-amber-50/20"
          : "border-gray-200/80 bg-gray-50/60 hover:border-gray-300"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              isKnownUnavailable
                ? "bg-amber-500"
                : hasError
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold text-gray-900">
            {queue.name}
          </span>

          {/* Status badge */}
          {availData ? (
            availData.isJoinable ? (
              <span className="inline-flex items-center rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                Available
              </span>
            ) : availData.isWaitingCapacityFull ? (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Queue Full
              </span>
            ) : availData.isDailyQuotaReached ? (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Daily Quota Reached
              </span>
            ) : availData.admissionStatus &&
              !availData.admissionStatus.isAdmitted ? (
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Admission Closed
              </span>
            ) : availData.organizationStatus &&
              !availData.organizationStatus.isOpen ? (
              <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                Closed
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                Unavailable
              </span>
            )
          ) : isAvailLoading ? (
            <span className="inline-flex items-center text-[11px] font-medium text-gray-400 animate-pulse">
              Checking...
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onJoinQueue(queue.id)}
          disabled={
            isKnownUnavailable ||
            isSubmitting ||
            isAnyQueueSubmitting
          }
          aria-describedby={hasError ? errorId : undefined}
          aria-label={
            isKnownUnavailable
              ? `Join ${queue.name} (Currently unavailable: ${availData?.unavailabilityReason || "Unavailable"})`
              : isSubmitting
                ? `Joining ${queue.name}...`
                : `Join ${queue.name}`
          }
          aria-disabled={
            isKnownUnavailable ||
            isSubmitting ||
            isAnyQueueSubmitting
          }
          className={`inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
            isKnownUnavailable
              ? "cursor-not-allowed bg-gray-200 text-gray-500 shadow-none"
              : "bg-gray-900 text-white shadow-sm hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          }`}
        >
          {isKnownUnavailable ? (
            "Queue Unavailable"
          ) : isSubmitting ? (
            <span className="inline-flex items-center gap-1.5">
              <svg
                className="h-3.5 w-3.5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                />
              </svg>
              Joining...
            </span>
          ) : (
            "Join Queue"
          )}
        </button>
      </div>

      {/* Live Availability Metrics Row */}
      {availData && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
          <div
            className="inline-flex items-center gap-1.5"
            title="Currently waiting tickets"
          >
            <svg
              className="h-3.5 w-3.5 text-gray-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
              />
            </svg>
            <span className="font-medium text-gray-800">
              {availData.maxWaitingTickets !== null ? (
                <>
                  Waiting: {availData.waitingCount} /{" "}
                  {availData.maxWaitingTickets}
                </>
              ) : (
                <>Waiting: {availData.waitingCount}</>
              )}
            </span>
          </div>

          {availData.estimatedWaitMinutes !== null ? (
            <div
              className="inline-flex items-center gap-1.5"
              title="Estimated wait time"
            >
              <svg
                className="h-3.5 w-3.5 text-gray-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              <span className="font-medium text-gray-800">
                Est. wait: ~{availData.estimatedWaitMinutes} min
              </span>
            </div>
          ) : availData.waitingCount === 0 ? (
            <div className="inline-flex items-center gap-1.5 text-gray-500">
              <svg
                className="h-3.5 w-3.5 text-gray-400 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              <span>No wait</span>
            </div>
          ) : null}

          {availData.currentlyServing !== null && (
            <div className="inline-flex items-center gap-1 text-gray-600">
              <span className="text-gray-400">Serving:</span>
              <span className="font-semibold text-gray-900">
                #{availData.currentlyServing}
              </span>
            </div>
          )}

          {availData.maxDailyTickets !== null && (
            <div className="inline-flex items-center gap-1 text-[11px] text-gray-500">
              <span>
                Daily: {availData.dailyCount} / {availData.maxDailyTickets}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Service Admission Cutoff Note */}
      {availData?.admissionStatus &&
        availData.admissionStatus.cutoffMinutes !== null &&
        availData.admissionStatus.cutoffMinutes > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
            <span>
              {availData.admissionStatus.isAdmitted
                ? `Admission closes ${availData.admissionStatus.cutoffMinutes}m before closing (${availData.admissionStatus.effectiveCutoffTime})`
                : `Admission closed for today at ${availData.admissionStatus.effectiveCutoffTime}`}
            </span>
          </div>
        )}

      {/* Loading State Placeholder */}
      {isAvailLoading && !availData && (
        <div className="mt-2 text-xs text-gray-400 animate-pulse">
          Checking queue availability...
        </div>
      )}

      {/* Error Loading Availability */}
      {availError && !availData && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>Availability information unavailable</span>
          <button
            type="button"
            onClick={() => onRetryAvailability(queue.id)}
            className="text-xs font-medium text-gray-700 underline hover:text-gray-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Known Unavailability Reason Alert */}
      {isKnownUnavailable && availData?.unavailabilityReason && (
        <div
          role="status"
          aria-live="polite"
          data-testid={`queue-unavailable-banner-${queue.id}`}
          className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/90 p-2.5 text-xs text-amber-900"
        >
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="font-medium leading-relaxed">
                {availData.unavailabilityReason}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Submission Error Banner */}
      {hasError && queueError && (
        <div
          id={errorId}
          role="alert"
          className="mt-2.5 rounded-lg border border-red-200 bg-red-50/90 p-2.5 text-xs text-red-800"
        >
          <div className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="font-medium leading-relaxed">
                {queueError.message}
              </p>
              {(queueError.code === "ACTIVE_TICKET_EXISTS" ||
                queueError.message.includes(
                  "already have an active ticket",
                )) && (
                <Link
                  href="/tickets"
                  className="mt-1.5 inline-flex items-center gap-1 font-semibold text-red-800 underline hover:text-red-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                >
                  Track your ticket in My Tickets &rarr;
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
