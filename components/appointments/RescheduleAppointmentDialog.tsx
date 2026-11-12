import { useState, useEffect, useRef } from "react";
import { formatDateTime, getZonedTimeDetails } from "@/lib/formatters/date";
import { useAvailableSlots, getTodayInTimezone } from "@/hooks/useAvailableSlots";
import { SlotPickerGrid } from "./SlotPickerGrid";
import type { AvailableSlot } from "@/hooks/useAvailableSlots";
import type { CustomerAppointment } from "./types";

export interface RescheduleAppointmentDialogProps {
  isOpen: boolean;
  appointment: CustomerAppointment | null;
  isSubmitting: boolean;
  error: string | null;
  errorStatus?: number | null;
  onConfirm: (newScheduledAt: string) => void;
  onClose: () => void;
}

interface RescheduleAppointmentDialogModalProps
  extends Omit<RescheduleAppointmentDialogProps, "appointment"> {
  appointment: CustomerAppointment;
}

function deriveInitialDate(scheduledAt?: string, timezone?: string): string {
  const tz = timezone || "Asia/Kolkata";
  const today = getTodayInTimezone(tz);
  if (!scheduledAt) return today;
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) return today;
  const localDetails = getZonedTimeDetails(parsed, tz);
  if (!localDetails?.dateStr) return today;
  return localDetails.dateStr >= today ? localDetails.dateStr : today;
}

function RescheduleAppointmentDialogModal({
  isOpen,
  appointment,
  isSubmitting,
  error,
  errorStatus,
  onConfirm,
  onClose,
}: RescheduleAppointmentDialogModalProps) {
  const orgTimezone =
    appointment.service.organization.timezone || "Asia/Kolkata";
  const minDate = getTodayInTimezone(orgTimezone);
  const initialDate = deriveInitialDate(appointment.scheduledAt, orgTimezone);

  const {
    selectedDate,
    slots,
    isLoading: isSlotsLoading,
    error: slotsError,
    setSelectedDate,
    refreshSlots,
  } = useAvailableSlots({
    organizationId: appointment.service.organization.id,
    serviceId: appointment.serviceId || appointment.service.id,
    timezone: orgTimezone,
    initialDate,
  });

  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

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
        aria-labelledby="reschedule-dialog-title"
        aria-describedby="reschedule-dialog-description"
        className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xl transition-all"
      >
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
              id="reschedule-dialog-title"
              className="text-lg font-semibold text-gray-900"
            >
              Reschedule Appointment
            </h2>
            <p className="text-xs text-gray-500">
              {appointment.service.organization.name} • Timezone: {orgTimezone}
            </p>
          </div>
        </div>

        <p
          id="reschedule-dialog-description"
          className="mt-3 text-xs text-gray-600"
        >
          Choose a new available slot for{" "}
          <span className="font-semibold text-gray-900">
            {appointment.service.name}
          </span>
          .
        </p>

        <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 border border-gray-100">
          <span className="font-medium text-gray-700">Currently scheduled:</span>{" "}
          {formatDateTime(appointment.scheduledAt, { timeZone: orgTimezone })}
        </div>

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
                  Rescheduling...
                </>
              ) : (
                "Confirm Reschedule"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function RescheduleAppointmentDialog(
  props: RescheduleAppointmentDialogProps,
) {
  if (!props.isOpen || !props.appointment) {
    return null;
  }

  return (
    <RescheduleAppointmentDialogModal
      key={props.appointment.id}
      {...props}
      appointment={props.appointment}
    />
  );
}
