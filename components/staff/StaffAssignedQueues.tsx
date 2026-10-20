import type { ReactElement } from "react";

export interface OperatorQueueItem {
  id: string;
  name: string;
  isActive: boolean;
  service: {
    id: string;
    name: string;
  };
  waitingCount: number;
  currentlyServing: number | null;
}

export interface StaffAssignedQueuesProps {
  assignedQueues: OperatorQueueItem[];
  isRefreshingQueues: boolean;
  isRefreshDisabled?: boolean;
  onRefreshQueues: () => void;
  queuesError?: string | null;
  callActionError?: string | null;
  onDismissCallError?: () => void;
  callingQueueId: string | null;
  onCallNext: (queue: OperatorQueueItem) => void;
  canCallNext: (queue: OperatorQueueItem) => boolean;
  organizationName?: string | null;
}

export function StaffAssignedQueues({
  assignedQueues,
  isRefreshingQueues,
  isRefreshDisabled = false,
  onRefreshQueues,
  queuesError,
  callActionError,
  onDismissCallError,
  callingQueueId,
  onCallNext,
  canCallNext,
  organizationName,
}: StaffAssignedQueuesProps): ReactElement {
  return (
    <div className="space-y-4 pt-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Assigned Queues
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Live waiting volume and current ticket status for your assigned queues.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshQueues}
          disabled={isRefreshingQueues || isRefreshDisabled}
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Refresh queues"
        >
          <svg
            className={`h-4 w-4 text-gray-600 ${isRefreshingQueues ? "animate-spin" : ""}`}
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
          <span>{isRefreshingQueues ? "Refreshing..." : "Refresh"}</span>
        </button>
      </div>

      {queuesError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-800 shadow-sm flex items-center justify-between"
        >
          <span>{queuesError}</span>
          <button
            type="button"
            onClick={onRefreshQueues}
            className="ml-3 font-semibold text-red-900 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {callActionError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <svg
              className="h-5 w-5 text-red-600 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <div>
              <p className="font-semibold">Unable to Call Next Ticket</p>
              <p className="mt-0.5 text-xs text-red-700">{callActionError}</p>
            </div>
          </div>
          {onDismissCallError && (
            <button
              type="button"
              onClick={onDismissCallError}
              className="text-red-700 hover:text-red-900 font-medium text-xs p-1"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {assignedQueues.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
              />
            </svg>
          </div>
          <h4 className="mt-3 text-base font-semibold text-gray-900">
            No Queues Assigned
          </h4>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            You do not currently have any active queues assigned in{" "}
            <span className="font-medium text-gray-700">
              {organizationName}
            </span>
            . An administrator must assign queues to your service
            line before waiting tickets appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assignedQueues.map((q) => (
            <div
              key={q.id}
              className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900">
                      {q.name}
                    </h4>
                    <p className="text-xs font-medium text-gray-500 mt-0.5">
                      Service: {q.service.name}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200/60">
                    Active
                  </span>
                </div>
              </div>

              <div className="mt-5 border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-2.5">
                  <span className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Waiting
                  </span>
                  <span className="mt-1 block text-2xl font-bold tracking-tight text-gray-900">
                    {q.waitingCount}
                  </span>
                </div>
                <div className="rounded-lg bg-gray-50 p-2.5">
                  <span className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                    Serving
                  </span>
                  <span className="mt-1 block text-2xl font-bold tracking-tight text-gray-900">
                    {q.currentlyServing !== null
                      ? `#${q.currentlyServing}`
                      : "None"}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => onCallNext(q)}
                  disabled={!canCallNext(q)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed active:scale-[0.98]"
                  aria-label={`Call next ticket for ${q.name}`}
                >
                  {callingQueueId === q.id ? (
                    <>
                      <svg
                        className="h-4 w-4 animate-spin text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Calling Next Ticket...</span>
                    </>
                  ) : (
                    <span>Call Next Ticket</span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
