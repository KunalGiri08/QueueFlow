"use client";

import { useState, useEffect, useCallback } from "react";
import type { QueueItem, UpdateQueuePayload } from "./types";
import { validateQueueFormInputs } from "./validation";

export interface EditQueueDialogProps {
  queue: QueueItem | null;
  isOpen: boolean;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: UpdateQueuePayload) => void | Promise<void>;
  onClearError?: () => void;
}

/**
 * Accessible modal dialog for editing queue name and capacity limits.
 * Handles form field state, client-side validation, error alerts,
 * backdrop click-to-close, and keyboard dismiss behavior (Escape key).
 */
export function EditQueueDialog({
  queue,
  isOpen,
  isSaving,
  error,
  onClose,
  onSave,
  onClearError,
}: EditQueueDialogProps) {
  const [editName, setEditName] = useState(queue?.name ?? "");
  const [editMaxWaitingTickets, setEditMaxWaitingTickets] = useState(
    queue?.maxWaitingTickets != null ? String(queue.maxWaitingTickets) : "",
  );
  const [editMaxDailyTickets, setEditMaxDailyTickets] = useState(
    queue?.maxDailyTickets != null ? String(queue.maxDailyTickets) : "",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  // Synchronously update form state during render when editing target changes
  const [prevQueueId, setPrevQueueId] = useState<string | null>(queue?.id ?? null);
  if (queue && queue.id !== prevQueueId) {
    setPrevQueueId(queue.id);
    setEditName(queue.name);
    setEditMaxWaitingTickets(
      queue.maxWaitingTickets != null ? String(queue.maxWaitingTickets) : "",
    );
    setEditMaxDailyTickets(
      queue.maxDailyTickets != null ? String(queue.maxDailyTickets) : "",
    );
    setLocalError(null);
  }

  const handleClose = useCallback(() => {
    if (isSaving) return;
    setLocalError(null);
    if (onClearError) onClearError();
    onClose();
  }, [isSaving, onClearError, onClose]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving, handleClose]);

  if (!isOpen || !queue) return null;

  const displayError = localError || error;

  const handleInputChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    if (localError) setLocalError(null);
    if (onClearError) onClearError();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const validation = validateQueueFormInputs(
      editName,
      editMaxWaitingTickets,
      editMaxDailyTickets,
    );

    if (!validation.isValid) {
      setLocalError(validation.error || "Invalid queue parameters.");
      return;
    }

    setLocalError(null);
    onSave({
      name: validation.trimmedName,
      maxWaitingTickets: validation.parsedMaxWaiting,
      maxDailyTickets: validation.parsedMaxDaily,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          handleClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-queue-dialog-title"
        className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xl transition-all space-y-4"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3
              id="edit-queue-dialog-title"
              className="text-base font-bold text-gray-900"
            >
              Edit Queue
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Update queue parameters and capacity limits for &ldquo;{queue.name}&rdquo;.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            aria-label="Close edit queue dialog"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="edit-queue-name"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Queue Name <span className="text-red-500">*</span>
            </label>
            <input
              id="edit-queue-name"
              type="text"
              value={editName}
              onChange={(e) => handleInputChange(setEditName, e.target.value)}
              disabled={isSaving}
              aria-invalid={Boolean(displayError)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="edit-queue-max-waiting"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                Max Waiting Limit{" "}
                <span className="font-normal text-gray-400">(Optional)</span>
              </label>
              <input
                id="edit-queue-max-waiting"
                type="number"
                min="1"
                max="10000"
                value={editMaxWaitingTickets}
                onChange={(e) =>
                  handleInputChange(setEditMaxWaitingTickets, e.target.value)
                }
                placeholder="Unlimited"
                disabled={isSaving}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div>
              <label
                htmlFor="edit-queue-max-daily"
                className="block text-xs font-semibold text-gray-700 mb-1"
              >
                Max Daily Limit{" "}
                <span className="font-normal text-gray-400">(Optional)</span>
              </label>
              <input
                id="edit-queue-max-daily"
                type="number"
                min="1"
                max="100000"
                value={editMaxDailyTickets}
                onChange={(e) =>
                  handleInputChange(setEditMaxDailyTickets, e.target.value)
                }
                placeholder="Unlimited"
                disabled={isSaving}
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Leave limits empty for unlimited admittance. Configured limits are strictly enforced via transactional row locks.
          </p>

          {displayError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs font-medium text-red-800 flex items-center gap-2"
            >
              <svg
                className="h-4 w-4 text-red-600 shrink-0"
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
              <span>{displayError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !editName.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSaving ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin text-white"
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
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
