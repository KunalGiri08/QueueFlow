"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatCreationDate } from "@/lib/formatters/date";

export interface CounterItem {
  id: string;
  name: string;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CounterManagementProps {
  organizationId: string;
}

function CountersSkeleton() {
  return (
    <div
      aria-label="Loading service counters"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse"
    >
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-5 w-28 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded-full bg-gray-200" />
          </div>
          <div className="h-3 w-36 rounded bg-gray-100" />
          <div className="h-3 w-24 rounded bg-gray-100 pt-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Counter Management module for organization administrators.
 * Handles listing existing service counters and creating new counters.
 */
export function CounterManagement({ organizationId }: CounterManagementProps) {
  const router = useRouter();

  // Counter management states
  const [counters, setCounters] = useState<CounterItem[]>([]);
  const [countersOrgId, setCountersOrgId] = useState<string | null>(null);
  const [countersError, setCountersError] = useState<string | null>(null);
  const [countersRetryTrigger, setCountersRetryTrigger] = useState(0);

  // Counter creation form states
  const [newCounterName, setNewCounterName] = useState("");
  const [isCreatingCounter, setIsCreatingCounter] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Counter activation/deactivation operational states
  const [updatingCounterId, setUpdatingCounterId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Concurrency & lifecycle refs
  const activeCounterControllerRef = useRef<AbortController | null>(null);
  const counterFetchGenerationRef = useRef<number>(0);
  const activeCreationRequestIdRef = useRef<number>(0);
  const activeActionRequestIdRef = useRef<number>(0);
  const currentOrgIdRef = useRef<string>(organizationId);

  // Reset form inputs and errors when switching organizations
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setNewCounterName("");
    setFormError(null);
    setFormSuccess(null);
    setIsCreatingCounter(false);
    setUpdatingCounterId(null);
    setActionError(null);
    setActionSuccess(null);
  }

  // Synchronize refs with organizationId prop
  useEffect(() => {
    currentOrgIdRef.current = organizationId;
    activeCreationRequestIdRef.current += 1;
    activeActionRequestIdRef.current += 1;
  }, [organizationId]);

  // Counter fetching effect: fetches counters for the active organization
  useEffect(() => {
    if (activeCounterControllerRef.current) {
      activeCounterControllerRef.current.abort();
    }

    let isCurrent = true;
    const fetchGen = ++counterFetchGenerationRef.current;
    const controller = new AbortController();
    activeCounterControllerRef.current = controller;

    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/counters`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!isCurrent || counterFetchGenerationRef.current !== fetchGen) return;

        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load counters (status ${res.status})`);
        }

        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Malformed counters response");
        }

        const validated: CounterItem[] = data.filter(
          (c): c is CounterItem =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as { id?: unknown }).id === "string" &&
            typeof (c as { name?: unknown }).name === "string" &&
            typeof (c as { organizationId?: unknown }).organizationId === "string" &&
            typeof (c as { isActive?: unknown }).isActive === "boolean" &&
            typeof (c as { createdAt?: unknown }).createdAt === "string",
        );

        validated.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );

        if (!isCurrent || counterFetchGenerationRef.current !== fetchGen) return;

        setCounters(validated);
        setCountersOrgId(organizationId);
        setCountersError(null);
      })
      .catch((err: unknown) => {
        if (!isCurrent || counterFetchGenerationRef.current !== fetchGen) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setCountersOrgId(organizationId);
        setCountersError(
          "Unable to load service counters at this time. Please try again.",
        );
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [organizationId, countersRetryTrigger, router]);

  const handleRetryCounters = () => {
    setCountersOrgId(null);
    setCountersError(null);
    setActionError(null);
    setActionSuccess(null);
    setCountersRetryTrigger((prev) => prev + 1);
  };

  const handleCreateCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingCounter) return;

    const trimmed = newCounterName.trim();
    if (!trimmed) {
      setFormError("Counter name is required.");
      return;
    }

    const creationRequestId = ++activeCreationRequestIdRef.current;
    setIsCreatingCounter(true);
    setFormError(null);
    setFormSuccess(null);

    const targetOrgId = organizationId;

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/counters`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: trimmed }),
        },
      );

      // Verify the user is still on the same organization and this is still the active request
      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(
          data.error || "A counter with this name already exists in this organization.",
        );
        return;
      }

      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: { name?: string[] } };
        };
        const message =
          data.details?.fieldErrors?.name?.[0] || data.error || "Invalid counter name.";
        setFormError(message);
        return;
      }

      if (res.status === 403) {
        setFormError("Only organization admins can create counters.");
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const newCounter: unknown = await res.json();

      // Check again after parsing JSON in case of race
      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      // Cancel any in-flight GET requests and bump fetch generation so older GET responses cannot overwrite this creation
      counterFetchGenerationRef.current += 1;
      if (activeCounterControllerRef.current) {
        activeCounterControllerRef.current.abort();
        activeCounterControllerRef.current = null;
      }

      if (
        typeof newCounter === "object" &&
        newCounter !== null &&
        typeof (newCounter as { id?: unknown }).id === "string" &&
        typeof (newCounter as { name?: unknown }).name === "string" &&
        typeof (newCounter as { organizationId?: unknown }).organizationId === "string" &&
        typeof (newCounter as { isActive?: unknown }).isActive === "boolean" &&
        typeof (newCounter as { createdAt?: unknown }).createdAt === "string"
      ) {
        const validCounter = newCounter as CounterItem;
        setCounters((prev) => {
          const updated = [...prev, validCounter];
          updated.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true }),
          );
          return updated;
        });
        setNewCounterName("");
        setFormSuccess(`Counter "${validCounter.name}" created successfully.`);
      } else {
        handleRetryCounters();
        setNewCounterName("");
        setFormSuccess(`Counter "${trimmed}" created successfully.`);
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeCreationRequestIdRef.current === creationRequestId
      ) {
        setFormError(
          "Failed to create counter due to a network error. Please try again.",
        );
      }
    } finally {
      if (activeCreationRequestIdRef.current === creationRequestId) {
        setIsCreatingCounter(false);
      }
    }
  };

  const handleToggleCounterStatus = async (counter: CounterItem) => {
    if (updatingCounterId || isCountersLoading) return;

    setActionError(null);
    setActionSuccess(null);
    setUpdatingCounterId(counter.id);

    const actionRequestId = ++activeActionRequestIdRef.current;
    const targetOrgId = organizationId;
    const targetIsActive = !counter.isActive;

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/counters/${encodeURIComponent(counter.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isActive: targetIsActive }),
        },
      );

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeActionRequestIdRef.current !== actionRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(
          data.error ||
            `Failed to ${targetIsActive ? "activate" : "deactivate"} counter "${counter.name}".`,
        );
        return;
      }

      const updated: unknown = await res.json();

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeActionRequestIdRef.current !== actionRequestId
      ) {
        return;
      }

      if (
        typeof updated === "object" &&
        updated !== null &&
        typeof (updated as { id?: unknown }).id === "string" &&
        typeof (updated as { isActive?: unknown }).isActive === "boolean"
      ) {
        const validUpdated = updated as CounterItem;
        setCounters((prev) =>
          prev.map((c) =>
            c.id === counter.id ? { ...c, isActive: validUpdated.isActive } : c,
          ),
        );
        setActionSuccess(
          `Counter "${counter.name}" ${
            validUpdated.isActive ? "activated" : "deactivated"
          } successfully.`,
        );
      } else {
        setCounters((prev) =>
          prev.map((c) =>
            c.id === counter.id ? { ...c, isActive: targetIsActive } : c,
          ),
        );
        setActionSuccess(
          `Counter "${counter.name}" ${
            targetIsActive ? "activated" : "deactivated"
          } successfully.`,
        );
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeActionRequestIdRef.current === actionRequestId
      ) {
        setActionError(
          `Failed to ${targetIsActive ? "activate" : "deactivate"} counter due to a network error. Please try again.`,
        );
      }
    } finally {
      if (activeActionRequestIdRef.current === actionRequestId) {
        setUpdatingCounterId(null);
      }
    }
  };

  const isCountersLoading = Boolean(countersOrgId !== organizationId);
  const displayedCounters = countersOrgId === organizationId ? counters : [];

  return (
    <div className="space-y-6">
      {/* Counter Section Header & Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-gray-900">
              Service Counters
            </h2>
            {!isCountersLoading &&
              countersOrgId === organizationId &&
              !countersError && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                  {displayedCounters.length}{" "}
                  {displayedCounters.length === 1 ? "counter" : "counters"}
                </span>
              )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Create and manage physical or virtual service desks used by staff operators to call tickets.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRetryCounters}
          disabled={isCountersLoading || isCreatingCounter}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
          aria-label="Refresh service counters"
        >
          <svg
            className={`h-3.5 w-3.5 text-gray-500 ${
              isCountersLoading ? "animate-spin" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* Create Counter Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Add Service Counter
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Enter a unique counter name for this organization (e.g., &ldquo;Counter 1&rdquo;, &ldquo;Window A&rdquo;, &ldquo;Consultation Desk 2&rdquo;).
          </p>
        </div>

        <form onSubmit={handleCreateCounter} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1">
              <label htmlFor="new-counter-name" className="sr-only">
                Counter Name
              </label>
              <input
                id="new-counter-name"
                type="text"
                value={newCounterName}
                onChange={(e) => {
                  setNewCounterName(e.target.value);
                  if (formError) setFormError(null);
                  if (formSuccess) setFormSuccess(null);
                }}
                placeholder="e.g., Counter 1 or Window A"
                disabled={isCreatingCounter}
                aria-invalid={Boolean(formError)}
                aria-describedby={
                  formError
                    ? "counter-form-error"
                    : formSuccess
                    ? "counter-form-success"
                    : undefined
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <button
              type="submit"
              disabled={isCreatingCounter || !newCounterName.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none sm:w-auto"
            >
              {isCreatingCounter ? (
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
                "Create Counter"
              )}
            </button>
          </div>

          {formError && (
            <div
              id="counter-form-error"
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
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div
              id="counter-form-success"
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

      {/* Global Counter Action Feedback Alerts */}
      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs sm:text-sm font-medium text-red-800 shadow-sm flex items-start justify-between gap-3"
        >
          <div className="flex items-center gap-2">
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
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-900 text-xs font-semibold shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs sm:text-sm font-medium text-emerald-800 shadow-sm flex items-start justify-between gap-3"
        >
          <div className="flex items-center gap-2">
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
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Counters List State Container */}
      <div>
        {isCountersLoading ? (
          <CountersSkeleton />
        ) : countersError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
          >
            <p className="text-sm font-medium">{countersError}</p>
            <button
              type="button"
              onClick={handleRetryCounters}
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Retry Loading Counters
            </button>
          </div>
        ) : displayedCounters.length === 0 ? (
          /* Empty State: No counters configured yet */
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
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
                  d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3"
                />
              </svg>
            </div>
            <h4 className="mt-3 text-sm font-semibold text-gray-900">
              No Service Counters Configured
            </h4>
            <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
              Add your first counter above. Staff operators need active counters assigned to call and serve customer tickets.
            </p>
          </div>
        ) : (
          /* Populated State: Grid of Counters */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayedCounters.map((counter) => {
              const isCounterUpdating = updatingCounterId === counter.id;
              const isAnyCounterUpdating = Boolean(updatingCounterId);

              return (
                <div
                  key={counter.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <h4 className="text-base font-semibold text-gray-900">
                        {counter.name}
                      </h4>
                      <span className="block font-mono text-xs text-gray-400">
                        ID: {counter.id}
                      </span>
                    </div>
                    {counter.isActive ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/80">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 border border-gray-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                        Inactive
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-400">
                    <span>{formatCreationDate(counter.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleCounterStatus(counter)}
                      disabled={
                        isAnyCounterUpdating ||
                        isCountersLoading ||
                        isCreatingCounter
                      }
                      aria-label={`${
                        counter.isActive ? "Deactivate" : "Activate"
                      } ${counter.name}`}
                      className={`inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
                        counter.isActive
                          ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-red-700 hover:border-red-200"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                      }`}
                    >
                      {isCounterUpdating ? (
                        <>
                          <svg
                            className="mr-1.5 h-3.5 w-3.5 animate-spin text-gray-500"
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
                          {counter.isActive
                            ? "Deactivating..."
                            : "Activating..."}
                        </>
                      ) : counter.isActive ? (
                        "Deactivate"
                      ) : (
                        "Activate"
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
