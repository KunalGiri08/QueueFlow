"use client";

import { useState } from "react";
import { isValidCalendarDateString } from "@/lib/validations/schedule";
import {
  getTodayIsoDate,
  type ClosureItem,
} from "./types";

export interface ClosureFormData {
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface ClosureDialogProps {
  isOpen: boolean;
  editingClosure: ClosureItem | null;
  isSaving: boolean;
  onSave: (data: ClosureFormData) => Promise<void>;
  onClose: () => void;
}

export function ClosureDialog({
  isOpen,
  editingClosure,
  isSaving,
  onSave,
  onClose,
}: ClosureDialogProps) {
  const [startDate, setStartDate] = useState(
    editingClosure ? editingClosure.startDate : getTodayIsoDate(),
  );
  const [endDate, setEndDate] = useState(
    editingClosure ? editingClosure.endDate : getTodayIsoDate(),
  );
  const [reason, setReason] = useState(editingClosure?.reason ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  // Derived-state reset: detect when the dialog opens or the editing target changes
  // and synchronously re-initialise form fields during render (React's recommended
  // "store previous props in state" pattern — no useEffect needed).
  // Uses record ID rather than object identity so parent re-renders with fresh
  // object references do not discard in-progress user input.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevClosureId, setPrevClosureId] = useState(editingClosure?.id ?? null);

  const isOpening = isOpen && !prevIsOpen;
  const currentClosureId = editingClosure?.id ?? null;
  const isRecordChanged = isOpen && currentClosureId !== prevClosureId;

  if (isOpening || isRecordChanged) {
    setPrevIsOpen(isOpen);
    setPrevClosureId(currentClosureId);
    if (editingClosure) {
      setStartDate(editingClosure.startDate);
      setEndDate(editingClosure.endDate);
      setReason(editingClosure.reason ?? "");
    } else {
      const today = getTodayIsoDate();
      setStartDate(today);
      setEndDate(today);
      setReason("");
    }
    setFormError(null);
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (
      !isValidCalendarDateString(startDate) ||
      !isValidCalendarDateString(endDate)
    ) {
      setFormError("Please select valid calendar dates (YYYY-MM-DD).");
      return;
    }

    if (endDate < startDate) {
      setFormError("End date must be greater than or equal to start date.");
      return;
    }

    if (reason.trim().length > 255) {
      setFormError("Reason must be 255 characters or fewer.");
      return;
    }

    try {
      await onSave({
        startDate,
        endDate,
        reason: reason.trim() || null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving closure";
      setFormError(msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="closure-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h4 id="closure-modal-title" className="text-base font-bold text-gray-900">
            {editingClosure ? "Edit Exceptional Closure" : "Add Exceptional Closure"}
          </h4>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close closure modal"
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="closure-start-date"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                id="closure-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) {
                    setEndDate(e.target.value);
                  }
                }}
                required
                disabled={isSaving}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <div>
              <label
                htmlFor="closure-end-date"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                id="closure-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                min={startDate}
                disabled={isSaving}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="closure-reason"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Reason / Holiday Note{" "}
              <span className="font-normal text-gray-400">(Optional)</span>
            </label>
            <input
              id="closure-reason"
              type="text"
              placeholder="e.g. Christmas Holiday, Emergency Maintenance"
              maxLength={255}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isSaving}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
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
              {isSaving ? "Saving..." : "Save Closure"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
