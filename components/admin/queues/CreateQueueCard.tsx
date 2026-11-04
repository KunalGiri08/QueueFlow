"use client";

import { useState } from "react";
import type { CreateQueuePayload } from "./types";
import { validateQueueFormInputs } from "./validation";

export interface CreateQueueCardProps {
  serviceId?: string;
  serviceName: string;
  isCreating: boolean;
  formError: string | null;
  formSuccess: string | null;
  onCreateQueue: (payload: CreateQueuePayload) => Promise<boolean> | boolean | void;
  onClearError?: () => void;
  onClearSuccess?: () => void;
}

/**
 * Queue creation form card component.
 * Encapsulates input fields for queue name and capacity limits,
 * client-side validation, error/success banners, and submission handling.
 */
export function CreateQueueCard({
  serviceId,
  serviceName,
  isCreating,
  formError,
  formSuccess,
  onCreateQueue,
  onClearError,
  onClearSuccess,
}: CreateQueueCardProps) {
  const [queueName, setQueueName] = useState("");
  const [maxWaitingTickets, setMaxWaitingTickets] = useState("");
  const [maxDailyTickets, setMaxDailyTickets] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Synchronously reset form inputs when switching active services
  const [prevServiceId, setPrevServiceId] = useState(serviceId);
  if (serviceId !== prevServiceId) {
    setPrevServiceId(serviceId);
    setQueueName("");
    setMaxWaitingTickets("");
    setMaxDailyTickets("");
    setLocalError(null);
  }

  const displayError = localError || formError;

  const handleInputChange = (setter: (val: string) => void, val: string) => {
    setter(val);
    if (localError) setLocalError(null);
    if (onClearError) onClearError();
    if (onClearSuccess) onClearSuccess();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;

    const validation = validateQueueFormInputs(
      queueName,
      maxWaitingTickets,
      maxDailyTickets,
    );

    if (!validation.isValid) {
      setLocalError(validation.error || "Invalid queue parameters.");
      return;
    }

    setLocalError(null);

    const payload: CreateQueuePayload = {
      name: validation.trimmedName,
      ...(validation.parsedMaxWaiting != null
        ? { maxWaitingTickets: validation.parsedMaxWaiting }
        : {}),
      ...(validation.parsedMaxDaily != null
        ? { maxDailyTickets: validation.parsedMaxDaily }
        : {}),
    };

    const result = await onCreateQueue(payload);
    if (result !== false) {
      setQueueName("");
      setMaxWaitingTickets("");
      setMaxDailyTickets("");
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Add Queue to {serviceName}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Enter a unique queue name for this service (e.g., &ldquo;General Walk-in&rdquo;, &ldquo;Priority / Accessible&rdquo;, &ldquo;Fast Track&rdquo;).
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label
              htmlFor="new-queue-name"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Queue Name <span className="text-red-500">*</span>
            </label>
            <input
              id="new-queue-name"
              type="text"
              value={queueName}
              onChange={(e) => handleInputChange(setQueueName, e.target.value)}
              placeholder="e.g., General Walk-in or Priority Desk"
              disabled={isCreating}
              aria-invalid={Boolean(displayError)}
              aria-describedby={
                displayError
                  ? "queue-form-error"
                  : formSuccess
                  ? "queue-form-success"
                  : undefined
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label
              htmlFor="new-queue-max-waiting"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Max Waiting Limit{" "}
              <span className="font-normal text-gray-400">(Optional)</span>
            </label>
            <input
              id="new-queue-max-waiting"
              type="number"
              min="1"
              max="10000"
              value={maxWaitingTickets}
              onChange={(e) =>
                handleInputChange(setMaxWaitingTickets, e.target.value)
              }
              placeholder="Unlimited"
              disabled={isCreating}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label
              htmlFor="new-queue-max-daily"
              className="block text-xs font-semibold text-gray-700 mb-1"
            >
              Max Daily Limit{" "}
              <span className="font-normal text-gray-400">(Optional)</span>
            </label>
            <input
              id="new-queue-max-daily"
              type="number"
              min="1"
              max="100000"
              value={maxDailyTickets}
              onChange={(e) =>
                handleInputChange(setMaxDailyTickets, e.target.value)
              }
              placeholder="Unlimited"
              disabled={isCreating}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
          <p className="text-xs text-gray-500">
            Leave capacity limits empty for unlimited admittance. Configured limits are strictly enforced via transactional row locks.
          </p>
          <button
            type="submit"
            disabled={isCreating || !queueName.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none sm:w-auto"
          >
            {isCreating ? (
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
                Creating...
              </>
            ) : (
              "Create Queue"
            )}
          </button>
        </div>

        {displayError && (
          <div
            id="queue-form-error"
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

        {formSuccess && (
          <div
            id="queue-form-success"
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-xs font-medium text-emerald-800 flex items-center gap-2"
          >
            <svg
              className="h-4 w-4 text-emerald-600 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <span>{formSuccess}</span>
          </div>
        )}
      </form>
    </div>
  );
}

