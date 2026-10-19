import Link from "next/link";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/formatters/date";
import type { CustomerTicket } from "@/app/tickets/page";

export interface CustomerTicketCardProps {
  ticket: CustomerTicket;
  isCancelling?: boolean;
  actionError?: string | null;
  onCancel: (ticket: CustomerTicket) => void;
}

/**
 * Presentational card for an individual customer ticket in My Tickets view.
 * Displays ticket number, customer status badge, organization/queue details,
 * tracking link, cancellation trigger for waiting tickets, and per-ticket action errors.
 */
export function CustomerTicketCard({
  ticket,
  isCancelling = false,
  actionError = null,
  onCancel,
}: CustomerTicketCardProps) {
  const hasValidToken =
    typeof ticket.trackingToken === "string" &&
    ticket.trackingToken.trim() !== "";

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">
              #{ticket.number}
            </span>
            <StatusBadge status={ticket.status} audience="customer" />
          </div>

          <p className="mt-1 text-sm font-semibold text-gray-800">
            {ticket.queue.service.organization.name}
          </p>

          <p className="mt-0.5 text-xs text-gray-500">
            {ticket.queue.service.name} &bull; {ticket.queue.name}
          </p>

          <p className="mt-2 text-xs text-gray-400">
            Joined {formatDateTime(ticket.createdAt)}
          </p>
        </div>

        <div className="flex sm:flex-col sm:items-end justify-between items-center gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-100 flex-wrap">
          {hasValidToken ? (
            <Link
              href={`/tickets/track/${encodeURIComponent(ticket.trackingToken!)}`}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Track Status &rarr;
            </Link>
          ) : (
            <span className="text-xs text-gray-400 italic">
              Tracking unavailable
            </span>
          )}

          {ticket.status === "WAITING" && (
            <button
              type="button"
              onClick={() => onCancel(ticket)}
              disabled={isCancelling}
              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm transition-all hover:bg-red-50 hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCancelling ? (
                <>
                  <svg
                    className="mr-1.5 h-3.5 w-3.5 animate-spin"
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
                  Cancelling...
                </>
              ) : (
                "Cancel Ticket"
              )}
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50/80 p-2.5 text-xs font-medium text-red-800"
        >
          {actionError}
        </div>
      )}
    </article>
  );
}
