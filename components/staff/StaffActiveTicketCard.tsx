import type { ReactElement } from "react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/formatters/date";

export type ActiveTicketAction = "start" | "complete" | "skip";

export interface ActiveTicket {
  id: string;
  number: number;
  status: "CALLED" | "SERVING";
  queueId: string;
  counterId: string | null;
  createdAt: string;
  updatedAt: string;
  queue: {
    id: string;
    name: string;
    service?: {
      id: string;
      name: string;
    };
  };
  service: {
    id: string;
    name: string;
  };
  counter: {
    id: string;
    name: string;
  } | null;
}

export interface StaffActiveTicketCardProps {
  activeTicket: ActiveTicket | null;
  activeTicketAction: ActiveTicketAction | null;
  isActionDisabled?: boolean;
  onStartService: () => void;
  onCompleteService: () => void;
  onSkipTicket: () => void;
  ticketActionError?: string | null;
  onDismissError?: () => void;
}

export function StaffActiveTicketCard({
  activeTicket,
  activeTicketAction,
  isActionDisabled = false,
  onStartService,
  onCompleteService,
  onSkipTicket,
  ticketActionError,
  onDismissError,
}: StaffActiveTicketCardProps): ReactElement {
  const isButtonDisabled = Boolean(
    activeTicketAction !== null || isActionDisabled,
  );

  return (
    <>
      {/* Active Ticket Action Error Alert Banner */}
      {ticketActionError && (
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
              <p className="font-semibold">Ticket Action Failed</p>
              <p className="mt-0.5 text-xs text-red-700">{ticketActionError}</p>
            </div>
          </div>
          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              className="text-red-700 hover:text-red-900 font-medium text-xs p-1"
              aria-label="Dismiss ticket action error"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Active Ticket Card or Idle State */}
      {activeTicket ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                Current Active Ticket
              </span>
              <StatusBadge status={activeTicket.status} audience="staff" />
            </div>
            <span className="text-xs text-gray-500">
              Updated {formatDateTime(activeTicket.updatedAt)}
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl">
                #{activeTicket.number}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                <span className="font-medium text-gray-900">
                  {activeTicket.service.name}
                </span>
                <span className="text-gray-300">•</span>
                <span>Queue: {activeTicket.queue.name}</span>
                <span className="text-gray-300">•</span>
                <span>
                  Counter: {activeTicket.counter?.name ?? "Unavailable"}
                </span>
              </div>
            </div>

            {/* Ticket Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {activeTicket.status === "CALLED" && (
                <button
                  type="button"
                  onClick={onStartService}
                  disabled={isButtonDisabled}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed active:scale-[0.98]"
                  aria-label={`Start service for ticket #${activeTicket.number}`}
                >
                  {activeTicketAction === "start" ? (
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
                      <span>Starting Service...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                        />
                      </svg>
                      <span>Start Service</span>
                    </>
                  )}
                </button>
              )}

              {activeTicket.status === "SERVING" && (
                <button
                  type="button"
                  onClick={onCompleteService}
                  disabled={isButtonDisabled}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed active:scale-[0.98]"
                  aria-label={`Complete service for ticket #${activeTicket.number}`}
                >
                  {activeTicketAction === "complete" ? (
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
                      <span>Completing Service...</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                      <span>Complete Service</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={onSkipTicket}
                disabled={isButtonDisabled}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:bg-red-50 hover:text-red-700 hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed active:scale-[0.98]"
                aria-label={`Skip ticket #${activeTicket.number}`}
              >
                {activeTicketAction === "skip" ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin text-gray-600"
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
                    <span>Skipping Ticket...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811V8.69ZM12.75 8.689c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061a1.125 1.125 0 0 1-1.683-.977V8.69Z"
                      />
                    </svg>
                    <span>Skip Ticket</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <h3 className="mt-3 text-base font-semibold text-gray-900">
            No Active Ticket
          </h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            You are not currently serving any ticket in this organization. Select
            an active desk to prepare for queue operations.
          </p>
        </div>
      )}
    </>
  );
}
