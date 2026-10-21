import { useEffect, useRef } from "react";
import { formatDateTime } from "@/lib/formatters/date";
import type { CustomerAppointment } from "./types";

export interface CancelAppointmentDialogProps {
  isOpen: boolean;
  appointment: CustomerAppointment | null;
  isCancelling: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function CancelAppointmentDialog({
  isOpen,
  appointment,
  isCancelling,
  error,
  onConfirm,
  onClose,
}: CancelAppointmentDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      cancelButtonRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isCancelling) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isCancelling, onClose]);

  if (!isOpen || !appointment) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isCancelling) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-appointment-dialog-title"
        aria-describedby="cancel-appointment-dialog-description"
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
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
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div>
            <h2
              id="cancel-appointment-dialog-title"
              className="text-lg font-semibold text-gray-900"
            >
              Cancel Appointment
            </h2>
            <p className="text-xs text-gray-500">
              {appointment.service.organization.name}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <p
            id="cancel-appointment-dialog-description"
            className="text-sm text-gray-600"
          >
            Are you sure you want to cancel your appointment for{" "}
            <span className="font-semibold text-gray-900">
              {appointment.service.name}
            </span>{" "}
            scheduled for{" "}
            <span className="font-semibold text-gray-900">
              {formatDateTime(appointment.scheduledAt)}
            </span>
            ? This action cannot be undone.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onClose}
            disabled={isCancelling}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Keep Appointment
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isCancelling}
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCancelling ? (
              <>
                <svg
                  className="mr-2 h-4 w-4 animate-spin text-white"
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
              "Yes, Cancel Appointment"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
