import { formatDateTime } from "@/lib/formatters/date";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";
import type { CustomerAppointment } from "./types";

export interface AppointmentCardProps {
  appointment: CustomerAppointment;
  onCancelClick: (appointment: CustomerAppointment) => void;
  onRescheduleClick: (appointment: CustomerAppointment) => void;
  actionError?: string | null;
}

/**
 * Presentational card for an individual customer appointment.
 * Displays appointment metadata, status badge, organization/service details,
 * scheduled time, and action triggers for booked appointments.
 */
export function AppointmentCard({
  appointment,
  onCancelClick,
  onRescheduleClick,
  actionError = null,
}: AppointmentCardProps) {
  const isBooked = appointment.status === "BOOKED";
  const orgTimezone = appointment.service.organization.timezone;

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <h2 className="text-lg font-bold tracking-tight text-gray-900 sm:text-2xl break-words">
              {appointment.service.name}
            </h2>
            <AppointmentStatusBadge status={appointment.status} />
          </div>

          <p className="mt-1 text-sm font-semibold text-gray-800 break-words">
            {appointment.service.organization.name}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-700">
            <svg
              className="h-4 w-4 shrink-0 text-gray-500"
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
            <span className="font-medium text-gray-900">
              {formatDateTime(
                appointment.scheduledAt,
                orgTimezone ? { timeZone: orgTimezone } : {},
              )}
              {orgTimezone && (
                <span className="ml-1.5 text-xs font-normal text-gray-500">
                  ({orgTimezone})
                </span>
              )}
            </span>
          </div>

          <p className="mt-2 text-xs text-gray-400">
            Booked on {formatDateTime(appointment.createdAt)}
          </p>
        </div>

        {isBooked && (
          <div className="flex w-full flex-col gap-2 pt-3 border-t border-gray-100 sm:w-auto sm:border-t-0 sm:pt-0 sm:items-end sm:justify-center">
            <button
              type="button"
              onClick={() => onRescheduleClick(appointment)}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-gray-300 bg-white px-3.5 py-2 sm:py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Reschedule
            </button>
            <button
              type="button"
              onClick={() => onCancelClick(appointment)}
              className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 sm:py-1.5 text-xs font-medium text-red-700 shadow-sm transition-all hover:bg-red-50 hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Cancel
            </button>
          </div>
        )}
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
