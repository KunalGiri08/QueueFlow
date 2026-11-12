import type { AvailableSlot } from "@/hooks/useAvailableSlots";

export interface SlotPickerGridProps {
  /** Currently selected calendar date in YYYY-MM-DD format */
  selectedDate: string;
  /** Callback fired when user changes the calendar date */
  onDateChange: (newDate: string) => void;
  /** List of slots for the selected date */
  slots: AvailableSlot[];
  /** Currently selected slot, or null if none selected */
  selectedSlot?: AvailableSlot | null;
  /** Callback fired when an available slot is clicked */
  onSelectSlot: (slot: AvailableSlot) => void;
  /** Whether slots are currently loading */
  isLoading?: boolean;
  /** Organization's IANA timezone (e.g. "Asia/Kolkata", "America/New_York") */
  timezone?: string;
  /** Optional minimum date allowed for selection (YYYY-MM-DD) */
  minDate?: string;
  /** Optional maximum date allowed for selection (YYYY-MM-DD) */
  maxDate?: string;
  /** Optional disabled state for the entire picker (e.g. during form submission) */
  disabled?: boolean;
  /** Optional custom message when no slots are available */
  emptyMessage?: string;
}

export function SlotPickerGrid({
  selectedDate,
  onDateChange,
  slots,
  selectedSlot,
  onSelectSlot,
  isLoading = false,
  timezone,
  minDate,
  maxDate,
  disabled = false,
  emptyMessage,
}: SlotPickerGridProps) {
  return (
    <div className="space-y-4">
      {/* Date selection and Timezone header */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label
            htmlFor="slot-picker-date"
            className="block text-xs font-semibold text-gray-700"
          >
            Select Date
          </label>
          {timezone && (
            <span
              className="text-xs text-gray-500 truncate"
              title={`Organization timezone: ${timezone}`}
            >
              Timezone:{" "}
              <span className="font-medium text-gray-700">{timezone}</span>
            </span>
          )}
        </div>
        <input
          id="slot-picker-date"
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          min={minDate}
          max={maxDate}
          disabled={disabled || isLoading}
          aria-label="Appointment date"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Slots Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700">
            Available Times
          </span>
          {timezone && (
            <span className="text-[11px] text-gray-400">
              Times displayed in {timezone}
            </span>
          )}
        </div>

        {isLoading ? (
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading available slots"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 animate-pulse"
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="h-12 rounded-lg bg-gray-100 border border-gray-200"
              />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div
            role="status"
            className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center"
          >
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
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
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-900">
              No available slots
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {emptyMessage ||
                "There are no appointment slots available on this date. Please select another day."}
            </p>
          </div>
        ) : (
          <div
            role="group"
            aria-label="Available appointment slots"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"
          >
            {slots.map((slot) => {
              const isSelected = selectedSlot?.slotStart === slot.slotStart;
              const isAvailable = slot.isAvailable && slot.remainingCapacity > 0;
              const isMultiCapacity = slot.maxCapacity > 1;

              return (
                <button
                  key={slot.slotStart}
                  type="button"
                  disabled={disabled || !isAvailable}
                  onClick={() => {
                    if (isAvailable && !disabled) {
                      onSelectSlot(slot);
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-disabled={!isAvailable}
                  aria-label={`${slot.localStartTime} to ${slot.localEndTime}${
                    !isAvailable
                      ? ", unavailable"
                      : isMultiCapacity
                        ? `, ${slot.remainingCapacity} of ${slot.maxCapacity} spots left`
                        : ", available"
                  }`}
                  className={`flex flex-col items-center justify-center p-2 min-h-[48px] rounded-lg border text-xs transition-all select-none ${
                    isSelected
                      ? "border-gray-900 bg-gray-900 text-white shadow-sm ring-2 ring-gray-900 ring-offset-1 font-semibold"
                      : !isAvailable
                        ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60"
                        : "border-gray-200 bg-white text-gray-900 hover:border-gray-900 hover:bg-gray-50 shadow-sm active:scale-[0.98] font-medium"
                  }`}
                >
                  <span className="text-xs sm:text-sm font-semibold tracking-tight">
                    {slot.localStartTime} - {slot.localEndTime}
                  </span>
                  {!isAvailable ? (
                    <span className="mt-0.5 text-[10px] text-gray-400 font-normal">
                      Full
                    </span>
                  ) : isMultiCapacity ? (
                    <span
                      className={`mt-0.5 text-[10px] ${
                        isSelected
                          ? "text-gray-200"
                          : "text-blue-600 font-semibold"
                      }`}
                    >
                      {slot.remainingCapacity} left
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

