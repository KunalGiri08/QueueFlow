import type { ReactElement } from "react";

export interface TurnNotificationBannerProps {
  ticketNumber: number;
  counter?: {
    name: string;
  } | null;
  onDismiss: () => void;
}

/**
 * Prominent, accessible in-app turn alert banner displayed when a ticket status is CALLED.
 * Announces the call via role="alert" and aria-live="assertive", shows the assigned counter,
 * and allows user dismissal.
 */
export function TurnNotificationBanner({
  ticketNumber,
  counter,
  onDismiss,
}: TurnNotificationBannerProps): ReactElement {
  const counterName = counter?.name?.trim();
  const instructionMessage = counterName
    ? `Your turn! Please proceed to ${counterName}.`
    : "Your turn! Please proceed to the service counter.";

  return (
    <aside
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="mb-6 overflow-hidden rounded-2xl border-2 border-blue-500 bg-gradient-to-r from-blue-50 via-indigo-50/70 to-blue-50 p-5 shadow-lg shadow-blue-500/10 animate-fade-in sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          {/* Animated indicator icon */}
          <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
            <span className="absolute -right-1 -top-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
            </span>
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-800">
                Ticket #{ticketNumber}
              </span>
              <span className="text-xs font-semibold text-blue-700">
                Called
              </span>
            </div>

            <h2 className="mt-1.5 text-lg font-black tracking-tight text-gray-900 sm:text-xl">
              {instructionMessage}
            </h2>

            {counterName ? (
              <p className="mt-1 text-sm font-medium text-blue-900">
                Assigned to{" "}
                <span className="font-bold underline decoration-blue-400 underline-offset-2">
                  {counterName}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-gray-600">
                Please proceed to the service counter.
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss turn notification"
          className="shrink-0 rounded-lg p-1.5 text-blue-600 transition-colors hover:bg-blue-100/80 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <span className="sr-only">Dismiss</span>
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
