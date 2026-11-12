import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/formatters/date";
import { useAvailableSlots, getTodayInTimezone } from "@/hooks/useAvailableSlots";
import { SlotPickerGrid } from "./SlotPickerGrid";
import type { AvailableSlot } from "@/hooks/useAvailableSlots";
import type {
  BookAppointmentService,
  BookAppointmentOrganization,
  BookedAppointmentSuccessData,
} from "./types";

export interface BookAppointmentDialogProps {
  isOpen: boolean;
  service: BookAppointmentService | null;
  organization: BookAppointmentOrganization | null;
  isSubmitting: boolean;
  error: string | null;
  errorStatus?: number | null;
  successData: BookedAppointmentSuccessData | null;
  onConfirm: (scheduledAtIso: string) => void;
  onClose: () => void;
}

export function BookAppointmentDialog({
  isOpen,
  service,
  organization,
  isSubmitting,
  error,
  errorStatus,
  successData,
  onConfirm,
  onClose,
}: BookAppointmentDialogProps) {
  const orgTimezone = organization?.timezone || "Asia/Kolkata";

  const {
    selectedDate,
    slots,
    isLoading: isSlotsLoading,
    error: slotsError,
    setSelectedDate,
    refreshSlots,
  } = useAvailableSlots({
    organizationId: organization?.id,
    serviceId: service?.id,
    timezone: orgTimezone,
  });

  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Synchronize state during render when service or dialog state changes (React 19 pattern)
  const [prevServiceId, setPrevServiceId] = useState<string | null>(null);
  const activeId = isOpen && service ? service.id : null;
  if (activeId !== prevServiceId) {
    setPrevServiceId(activeId);
    setValidationError(null);
    setSelectedSlot(null);
  }

  // Clear contested slot during render when an HTTP 409 conflict error arrives (React 19 pattern)
  const [prevErrorState, setPrevErrorState] = useState<{
    error: string | null;
    errorStatus?: number | null;
  }>({ error: null, errorStatus: null });
  if (
    error !== prevErrorState.error ||
    errorStatus !== prevErrorState.errorStatus
  ) {
    setPrevErrorState({ error, errorStatus });
    if (error && errorStatus === 409) {
      setSelectedSlot(null);
    }
  }

  // Refresh slots side-effect ONLY when a server HTTP 409 conflict error arrives
  const prevConflictRef = useRef<string | null>(null);
  useEffect(() => {
    if (error && errorStatus === 409 && error !== prevConflictRef.current) {
      prevConflictRef.current = error;
      void refreshSlots();
    } else if (!error || errorStatus !== 409) {
      prevConflictRef.current = null;
    }
  }, [error, errorStatus, refreshSlots]);

  // Handle Escape key to dismiss dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !service || !organization) {
    return null;
  }

  const minDate = getTodayInTimezone(orgTimezone);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setSelectedSlot(null);
    setValidationError(null);
  };

  const handleSelectSlot = (slot: AvailableSlot) => {
    setSelectedSlot(slot);
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (isSubmitting) return;

    if (!selectedSlot) {
      setValidationError("Please select an appointment time slot.");
      return;
    }

    if (!selectedSlot.isAvailable || selectedSlot.remainingCapacity <= 0) {
      setValidationError(
        "The selected time slot is no longer available. Please choose another time.",
      );
      return;
    }

    onConfirm(selectedSlot.slotStart);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-appointment-dialog-title"
        aria-describedby="book-appointment-dialog-description"
        className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xl transition-all"
      >
        {successData ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
              <svg
                className="h-6 w-6"
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
            </div>

            <h2
              id="book-appointment-dialog-title"
              className="mt-4 text-xl font-bold text-gray-900"
            >
              Appointment Booked!
            </h2>

            <p
              id="book-appointment-dialog-description"
              className="mt-2 text-sm text-gray-600"
            >
              Your appointment for{" "}
              <span className="font-semibold text-gray-900">
                {service.name}
              </span>{" "}
              at{" "}
              <span className="font-semibold text-gray-900">
                {organization.name}
              </span>{" "}
              has been confirmed for:
            </p>

            <div className="mt-4 rounded-xl bg-gray-50 p-4 border border-gray-100 text-center">
              <span className="text-base font-semibold text-gray-900">
                {formatDateTime(successData.scheduledAt, {
                  timeZone: orgTimezone,
                })}
              </span>
              <p className="mt-1 text-xs text-gray-500">
                Appointment time: {orgTimezone}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link
                href="/appointments"
                className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                View My Appointments &rarr;
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
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
                    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                  />
                </svg>
              </div>
              <div>
                <h2
                  id="book-appointment-dialog-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Book Appointment
                </h2>
                <p className="text-xs text-gray-500">
                  {organization.name} • Timezone: {orgTimezone}
                </p>
              </div>
            </div>

            <p
              id="book-appointment-dialog-description"
              className="mt-3 text-xs text-gray-600"
            >
              Select your preferred date and time for{" "}
              <span className="font-semibold text-gray-900">
                {service.name}
              </span>
              .
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <SlotPickerGrid
                selectedDate={selectedDate}
                onDateChange={handleDateChange}
                slots={slots}
                selectedSlot={selectedSlot}
                onSelectSlot={handleSelectSlot}
                isLoading={isSlotsLoading}
                timezone={orgTimezone}
                minDate={minDate}
                disabled={isSubmitting}
                emptyMessage={slotsError || undefined}
              />

              {validationError && (
                <p
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-red-600"
                >
                  {validationError}
                </p>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
                >
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !selectedSlot ||
                    !selectedSlot.isAvailable ||
                    selectedSlot.remainingCapacity <= 0
                  }
                  className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
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
                      Booking...
                    </>
                  ) : (
                    "Confirm Booking"
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
