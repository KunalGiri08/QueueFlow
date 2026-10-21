"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppointmentStatusBadge } from "@/components/appointments/AppointmentStatusBadge";
import type { AppointmentStatus } from "@/components/appointments/types";
import { formatDateTime } from "@/lib/formatters/date";

export interface StaffOrganizationAppointment {
  id: string;
  scheduledAt: string;
  status: AppointmentStatus | string;
  createdAt: string;
  service: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

export interface StaffAppointmentsManagementProps {
  organizationId: string;
  organizationName?: string;
}

type FilterOption = "ALL" | "BOOKED" | "COMPLETED" | "NO_SHOW" | "CANCELLED";

export function StaffAppointmentsManagement({
  organizationId,
  organizationName,
}: StaffAppointmentsManagementProps) {
  const router = useRouter();

  const [appointments, setAppointments] = useState<StaffOrganizationAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("ALL");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [prevOrgId, setPrevOrgId] = useState(organizationId);

  const [fetchRetryTrigger, setFetchRetryTrigger] = useState(0);

  // Adjust state when organizationId changes (official React pattern)
  if (prevOrgId !== organizationId) {
    setPrevOrgId(organizationId);
    setAppointments([]);
    setIsLoading(true);
    setError(null);
    setActionError(null);
    setActiveFilter("ALL");
  }

  // Stale request and duplicate action guards
  const activeControllerRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef<number>(0);
  const isActionLockedRef = useRef<boolean>(false);

  useEffect(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    let isCurrent = true;
    const fetchGen = ++fetchGenerationRef.current;
    const controller = new AbortController();
    activeControllerRef.current = controller;

    async function load() {
      try {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/appointments`,
          { signal: controller.signal },
        );

        if (!isCurrent || fetchGenerationRef.current !== fetchGen) return;

        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
          return;
        }

        if (res.status === 403) {
          setError(
            "You do not have permission to view appointments for this organization.",
          );
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load appointments (status ${res.status})`);
        }

        const data: unknown = await res.json();
        if (!isCurrent || fetchGenerationRef.current !== fetchGen) return;

        if (!Array.isArray(data)) {
          throw new Error("Malformed appointments response");
        }

        setAppointments(data as StaffOrganizationAppointment[]);
        setError(null);
      } catch (err: unknown) {
        if (!isCurrent || fetchGenerationRef.current !== fetchGen) return;

        const isAbort =
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name: string }).name === "AbortError") ||
          controller.signal.aborted;

        if (isAbort) return;

        setError("Unable to load scheduled appointments. Please try again.");
      } finally {
        if (isCurrent && fetchGenerationRef.current === fetchGen) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isCurrent = false;
      controller.abort();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    };
  }, [organizationId, fetchRetryTrigger, router]);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setActionError(null);
    setFetchRetryTrigger((prev) => prev + 1);
  }, []);

  const handleUpdateStatus = async (
    appointmentId: string,
    nextStatus: "COMPLETED" | "NO_SHOW",
  ) => {
    if (isActionLockedRef.current || updatingId) return;

    isActionLockedRef.current = true;
    setUpdatingId(appointmentId);
    setActionError(null);

    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(organizationId)}/appointments/${encodeURIComponent(appointmentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return;
      }

      if (response.status === 409) {
        setActionError("Appointment status changed or conflict occurred; refreshed list.");
        setFetchRetryTrigger((prev) => prev + 1);
        return;
      }

      if (response.status === 403) {
        setActionError("You do not have permission to manage appointments.");
        return;
      }

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errorJson?.error || `Update failed (status ${response.status})`);
      }

      // Optimistically / locally update the appointment status
      setAppointments((prev) =>
        prev.map((app) =>
          app.id === appointmentId ? { ...app, status: nextStatus } : app,
        ),
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to update appointment status. Please try again.";
      setActionError(msg);
    } finally {
      isActionLockedRef.current = false;
      setUpdatingId(null);
    }
  };

  const counts: Record<FilterOption, number> = {
    ALL: appointments.length,
    BOOKED: appointments.filter((a) => a.status === "BOOKED").length,
    COMPLETED: appointments.filter((a) => a.status === "COMPLETED").length,
    NO_SHOW: appointments.filter((a) => a.status === "NO_SHOW").length,
    CANCELLED: appointments.filter((a) => a.status === "CANCELLED").length,
  };

  const filteredAppointments = appointments.filter((a) => {
    if (activeFilter === "ALL") return true;
    return a.status === activeFilter;
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900">
            Scheduled Appointments
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Manage scheduled customer arrivals for {organizationName || "this organization"}.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading || Boolean(updatingId)}
          aria-label="Refresh appointments"
          className="inline-flex items-center justify-center gap-1.5 self-start sm:self-auto rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
        >
          <svg
            className={`h-4 w-4 text-gray-500 ${isLoading ? "animate-spin" : ""}`}
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
          Refresh Appointments
        </button>
      </div>

      {/* Action Error Alert */}
      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="ml-3 text-xs font-semibold text-amber-900 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading appointments"
          className="space-y-4 animate-pulse py-4"
        >
          <div className="flex gap-2">
            <div className="h-8 w-20 rounded-lg bg-gray-200" />
            <div className="h-8 w-24 rounded-lg bg-gray-100" />
            <div className="h-8 w-24 rounded-lg bg-gray-100" />
          </div>
          <div className="h-16 w-full rounded-xl bg-gray-100" />
          <div className="h-16 w-full rounded-xl bg-gray-100" />
          <div className="h-16 w-full rounded-xl bg-gray-100" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
        >
          <p className="text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            Retry Loading
          </button>
        </div>
      ) : appointments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
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
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
              />
            </svg>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">
            No Appointments Scheduled
          </h3>
          <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
            There are currently no customer appointments booked for{" "}
            {organizationName || "this organization"}.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "ALL", label: "All" },
                { id: "BOOKED", label: "Booked" },
                { id: "COMPLETED", label: "Completed" },
                { id: "NO_SHOW", label: "No Show" },
                { id: "CANCELLED", label: "Cancelled" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setActiveFilter(opt.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  activeFilter === opt.id
                    ? "bg-gray-900 text-white shadow-sm"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <span>{opt.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                    activeFilter === opt.id
                      ? "bg-gray-800 text-gray-200"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  {counts[opt.id]}
                </span>
              </button>
            ))}
          </div>

          {/* Filter Empty State */}
          {filteredAppointments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                No appointments matching the &ldquo;{activeFilter.toLowerCase().replace("_", " ")}&rdquo; filter.
              </p>
              <button
                type="button"
                onClick={() => setActiveFilter("ALL")}
                className="mt-3 text-xs font-semibold text-gray-900 underline hover:no-underline"
              >
                Reset to All ({appointments.length})
              </button>
            </div>
          ) : (
            /* Appointments List */
            <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {filteredAppointments.map((app) => {
                const isBooked = app.status === "BOOKED";
                const isItemUpdating = updatingId === app.id;

                return (
                  <div
                    key={app.id}
                    data-testid={`appointment-row-${app.id}`}
                    className="flex flex-col gap-4 p-4 transition-colors hover:bg-gray-50/70 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {/* Left: Customer & Service Details */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">
                          {app.user.name || "Customer"}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">
                          {app.user.email}
                        </span>
                        <AppointmentStatusBadge status={app.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1 font-medium text-gray-800">
                          <svg
                            className="h-3.5 w-3.5 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z"
                            />
                          </svg>
                          {app.service.name}
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 text-gray-500">
                          <svg
                            className="h-3.5 w-3.5 text-gray-400"
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
                          {formatDateTime(app.scheduledAt)}
                        </span>
                      </div>
                    </div>

                    {/* Right: Actions for BOOKED appointments */}
                    {isBooked ? (
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(app.id, "COMPLETED")}
                          disabled={Boolean(updatingId)}
                          aria-label={`Mark appointment for ${app.user.name || app.user.email} as completed`}
                          className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
                        >
                          {isItemUpdating ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="2.5"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m4.5 12.75 6 6 9-13.5"
                              />
                            </svg>
                          )}
                          Complete
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(app.id, "NO_SHOW")}
                          disabled={Boolean(updatingId)}
                          aria-label={`Mark appointment for ${app.user.name || app.user.email} as no show`}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
                        >
                          No Show
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 italic">
                        No actions available
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
