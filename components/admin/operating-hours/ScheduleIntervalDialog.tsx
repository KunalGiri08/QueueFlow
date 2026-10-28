"use client";

import { useState } from "react";
import {
  doIntervalsOverlap,
  timeToMinutes,
  timeStringSchema,
} from "@/lib/validations/schedule";
import {
  DAYS_OF_WEEK,
  type ScheduleIntervalItem,
} from "./types";

export interface ScheduleIntervalFormData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface ScheduleIntervalDialogProps {
  isOpen: boolean;
  editingInterval: ScheduleIntervalItem | null;
  defaultDayOfWeek: number;
  existingIntervals: ScheduleIntervalItem[];
  isSaving: boolean;
  onSave: (data: ScheduleIntervalFormData) => Promise<void>;
  onClose: () => void;
}

export function ScheduleIntervalDialog({
  isOpen,
  editingInterval,
  defaultDayOfWeek,
  existingIntervals,
  isSaving,
  onSave,
  onClose,
}: ScheduleIntervalDialogProps) {
  const [dayOfWeek, setDayOfWeek] = useState<number>(
    editingInterval ? editingInterval.dayOfWeek : defaultDayOfWeek,
  );
  const [startTime, setStartTime] = useState(
    editingInterval ? editingInterval.startTime : "09:00",
  );
  const [endTime, setEndTime] = useState(
    editingInterval ? editingInterval.endTime : "17:00",
  );
  const [isActive, setIsActive] = useState(
    editingInterval ? editingInterval.isActive : true,
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Derived-state reset: detect when the dialog opens, the editing target changes,
  // or the default day changes, and synchronously re-initialise form fields during
  // render (React's recommended "store previous props in state" pattern — no useEffect).
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevEditingInterval, setPrevEditingInterval] = useState(editingInterval);
  const [prevDefaultDayOfWeek, setPrevDefaultDayOfWeek] = useState(defaultDayOfWeek);

  if (
    isOpen !== prevIsOpen ||
    editingInterval !== prevEditingInterval ||
    defaultDayOfWeek !== prevDefaultDayOfWeek
  ) {
    setPrevIsOpen(isOpen);
    setPrevEditingInterval(editingInterval);
    setPrevDefaultDayOfWeek(defaultDayOfWeek);
    if (editingInterval) {
      setDayOfWeek(editingInterval.dayOfWeek);
      setStartTime(editingInterval.startTime);
      setEndTime(editingInterval.endTime);
      setIsActive(editingInterval.isActive);
    } else {
      setDayOfWeek(defaultDayOfWeek);
      setStartTime("09:00");
      setEndTime("17:00");
      setIsActive(true);
    }
    setFormError(null);
  }

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const startCheck = timeStringSchema.safeParse(startTime);
    const endCheck = timeStringSchema.safeParse(endTime);

    if (!startCheck.success || !endCheck.success) {
      setFormError("Time must be in 24-hour HH:mm format (e.g., 09:00).");
      return;
    }

    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);

    if (startMin >= endMin) {
      setFormError("Start time must be earlier than end time.");
      return;
    }

    // Client-side overlap validation against other active intervals for this day
    if (isActive) {
      const otherActive = existingIntervals.filter(
        (i) =>
          i.dayOfWeek === dayOfWeek &&
          i.isActive &&
          (!editingInterval || i.id !== editingInterval.id),
      );

      for (const other of otherActive) {
        if (
          doIntervalsOverlap(
            { startTime, endTime },
            other,
          )
        ) {
          setFormError(
            `Interval overlaps with existing active hours (${other.startTime} - ${other.endTime}).`,
          );
          return;
        }
      }
    }

    try {
      await onSave({
        dayOfWeek,
        startTime,
        endTime,
        isActive,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving schedule interval";
      setFormError(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interval-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h4 id="interval-modal-title" className="text-base font-bold text-gray-900">
            {editingInterval ? "Edit Operating Hours" : "Add Operating Hours"}
          </h4>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close interval modal"
            className="text-gray-400 hover:text-gray-600 rounded p-1"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="interval-day-select"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Day of Week
            </label>
            <select
              id="interval-day-select"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              disabled={isSaving}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            >
              {DAYS_OF_WEEK.map(({ day, name }) => (
                <option key={day} value={day}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="interval-start-time"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                Opening Time (24h)
              </label>
              <input
                id="interval-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                disabled={isSaving}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <div>
              <label
                htmlFor="interval-end-time"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                Closing Time (24h)
              </label>
              <input
                id="interval-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                disabled={isSaving}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="interval-is-active"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={isSaving}
              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
            />
            <label
              htmlFor="interval-is-active"
              className="text-xs font-medium text-gray-700 select-none cursor-pointer"
            >
              Enable this interval immediately (Active)
            </label>
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
            >
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Interval"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
