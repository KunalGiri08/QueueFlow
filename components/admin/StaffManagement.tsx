"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface StaffCounterItem {
  id: string;
  name: string;
}

export interface StaffMemberItem {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "STAFF";
  counters: StaffCounterItem[];
}

export interface CounterOption {
  id: string;
  name: string;
  isActive: boolean;
}

export interface StaffManagementProps {
  organizationId: string;
}

function StaffSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading staff members and assignments"
      className="space-y-4 animate-pulse"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-5 w-36 rounded bg-gray-200" />
                <div className="h-3 w-48 rounded bg-gray-100" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-200" />
            </div>
            <div className="h-10 w-full rounded bg-gray-100" />
            <div className="h-8 w-full rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StaffManagement({ organizationId }: StaffManagementProps) {
  const router = useRouter();

  // Data states
  const [staff, setStaff] = useState<StaffMemberItem[]>([]);
  const [counters, setCounters] = useState<CounterOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchRetryTrigger, setFetchRetryTrigger] = useState(0);

  // Onboard staff form states
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Counter assignment / member removal operational states
  const [selectedCounterByStaffId, setSelectedCounterByStaffId] = useState<Record<string, string>>({});
  const [assigningStaffId, setAssigningStaffId] = useState<string | null>(null);
  const [unassigningKey, setUnassigningKey] = useState<string | null>(null);
  const [removingStaffId, setRemovingStaffId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Concurrency & lifecycle refs
  const activeControllerRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef<number>(0);
  const currentOrgIdRef = useRef<string>(organizationId);
  const isOnboardingRef = useRef<boolean>(false);
  const isAssigningRef = useRef<boolean>(false);
  const isRemovingRef = useRef<boolean>(false);
  const activeActionRequestIdRef = useRef<number>(0);

  // Reset inputs and feedback when organizationId changes
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setStaff([]);
    setCounters([]);
    setFetchError(null);
    setNewName("");
    setNewEmail("");
    setIsOnboarding(false);
    isOnboardingRef.current = false;
    isAssigningRef.current = false;
    isRemovingRef.current = false;
    setFormError(null);
    setFormSuccess(null);
    setSelectedCounterByStaffId({});
    setAssigningStaffId(null);
    setUnassigningKey(null);
    setRemovingStaffId(null);
    setActionError(null);
    setActionSuccess(null);
  }

  useEffect(() => {
    currentOrgIdRef.current = organizationId;
    activeActionRequestIdRef.current += 1;
  }, [organizationId]);

  // Fetch staff members and available counters in parallel
  const fetchStaffAndCounters = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;

    const fetchGen = ++fetchGenerationRef.current;
    setIsLoading(true);
    setFetchError(null);

    try {
      const [staffRes, countersRes] = await Promise.all([
        fetch(`/api/staff?organizationId=${encodeURIComponent(organizationId)}`, { signal }),
        fetch(`/api/organizations/${encodeURIComponent(organizationId)}/counters`, { signal }),
      ]);

      if (signal?.aborted || fetchGenerationRef.current !== fetchGen) return;

      if (staffRes.status === 401 || countersRes.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (!staffRes.ok) {
        throw new Error(`Failed to load staff members (status ${staffRes.status})`);
      }

      if (!countersRes.ok) {
        throw new Error(`Failed to load counters (status ${countersRes.status})`);
      }

      const staffData: unknown = await staffRes.json();
      const countersData: unknown = await countersRes.json();

      if (signal?.aborted || fetchGenerationRef.current !== fetchGen) return;

      if (!Array.isArray(staffData)) {
        throw new Error("Malformed staff response");
      }

      const validatedStaff: StaffMemberItem[] = staffData.filter(
        (item): item is StaffMemberItem =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { email?: unknown }).email === "string" &&
          ((item as { role?: unknown }).role === "ADMIN" || (item as { role?: unknown }).role === "STAFF") &&
          Array.isArray((item as { counters?: unknown }).counters),
      );

      const validatedCounters: CounterOption[] = Array.isArray(countersData)
        ? countersData.filter(
            (c): c is CounterOption =>
              typeof c === "object" &&
              c !== null &&
              typeof (c as { id?: unknown }).id === "string" &&
              typeof (c as { name?: unknown }).name === "string" &&
              typeof (c as { isActive?: unknown }).isActive === "boolean",
          )
        : [];

      setStaff(validatedStaff);
      setCounters(validatedCounters);
    } catch (err: unknown) {
      if (signal?.aborted || fetchGenerationRef.current !== fetchGen) return;
      const isAbort =
        (err instanceof Error && err.name === "AbortError") ||
        (typeof err === "object" &&
          err !== null &&
          "name" in err &&
          (err as { name: string }).name === "AbortError") ||
        Boolean(signal?.aborted);
      if (isAbort) return;

      setFetchError("Unable to load staff members and counters. Please try again.");
    } finally {
      if (!signal?.aborted && fetchGenerationRef.current === fetchGen) {
        setIsLoading(false);
      }
    }
  }, [organizationId, router]);

  useEffect(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;
    void fetchStaffAndCounters(controller.signal);

    return () => {
      controller.abort();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    };
  }, [fetchStaffAndCounters, fetchRetryTrigger]);

  const handleManualRefresh = () => {
    setActionError(null);
    setActionSuccess(null);
    setFetchRetryTrigger((prev) => prev + 1);
  };

  // Onboard a new staff operator
  const handleOnboardStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!trimmedName) {
      setFormError("Staff member name is required.");
      return;
    }

    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setFormError("A valid email address is required.");
      return;
    }

    if (isOnboardingRef.current) return;
    isOnboardingRef.current = true;
    setIsOnboarding(true);

    const actionRequestId = ++activeActionRequestIdRef.current;
    const targetOrgId = organizationId;

    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: targetOrgId,
          name: trimmedName,
          email: trimmedEmail,
        }),
      });

      if (currentOrgIdRef.current !== targetOrgId || activeActionRequestIdRef.current !== actionRequestId) {
        return;
      }

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      const data = await response.json().catch(() => null);

      if (response.status === 409) {
        setFormError(data?.error || "User is already a member of this organization.");
        return;
      }

      if (response.status === 403) {
        setFormError(data?.error || "Only organization administrators can onboard staff.");
        return;
      }

      if (!response.ok) {
        setFormError(data?.error || `Failed to onboard staff member (status ${response.status}).`);
        return;
      }

      if (data && typeof data.id === "string") {
        const newMember: StaffMemberItem = {
          id: data.id,
          name: data.name ?? trimmedName,
          email: data.email ?? trimmedEmail,
          role: data.role === "ADMIN" ? "ADMIN" : "STAFF",
          counters: [],
        };

        setStaff((prev) => [...prev, newMember]);
        setNewName("");
        setNewEmail("");
        setFormSuccess(`Staff operator ${newMember.name} onboarded successfully.`);
      }
    } catch {
      if (currentOrgIdRef.current === targetOrgId && activeActionRequestIdRef.current === actionRequestId) {
        setFormError("Network error. Unable to onboard staff operator.");
      }
    } finally {
      if (currentOrgIdRef.current === targetOrgId && activeActionRequestIdRef.current === actionRequestId) {
        isOnboardingRef.current = false;
        setIsOnboarding(false);
      }
    }
  };

  // Assign counter to a staff member
  const handleAssignCounter = async (staffId: string) => {
    setActionError(null);
    setActionSuccess(null);

    const counterId = selectedCounterByStaffId[staffId];
    if (!counterId) {
      setActionError("Please select a counter to assign.");
      return;
    }

    if (isAssigningRef.current) return;
    isAssigningRef.current = true;
    setAssigningStaffId(staffId);

    const actionRequestId = ++activeActionRequestIdRef.current;
    const targetOrgId = organizationId;

    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/staff/${encodeURIComponent(staffId)}/counters`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ counterId }),
        },
      );

      if (currentOrgIdRef.current !== targetOrgId || activeActionRequestIdRef.current !== actionRequestId) {
        return;
      }

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setActionError(data?.error || `Failed to assign counter (status ${response.status}).`);
        return;
      }

      if (data?.counter) {
        const assignedCounter: StaffCounterItem = {
          id: data.counter.id,
          name: data.counter.name,
        };

        setStaff((prev) =>
          prev.map((m) =>
            m.id === staffId
              ? {
                  ...m,
                  counters: m.counters.some((c) => c.id === assignedCounter.id)
                    ? m.counters
                    : [...m.counters, assignedCounter],
                }
              : m,
          ),
        );

        setSelectedCounterByStaffId((prev) => ({ ...prev, [staffId]: "" }));
        setActionSuccess(`Counter assigned successfully.`);
      }
    } catch {
      if (currentOrgIdRef.current === targetOrgId && activeActionRequestIdRef.current === actionRequestId) {
        setActionError("Network error. Unable to assign counter.");
      }
    } finally {
      if (currentOrgIdRef.current === targetOrgId && activeActionRequestIdRef.current === actionRequestId) {
        isAssigningRef.current = false;
        setAssigningStaffId(null);
      }
    }
  };

  // Unassign counter from a staff member
  const handleUnassignCounter = async (staffId: string, counterId: string) => {
    setActionError(null);
    setActionSuccess(null);

    const key = `${staffId}-${counterId}`;
    setUnassigningKey(key);

    const actionRequestId = ++activeActionRequestIdRef.current;
    const targetOrgId = organizationId;

    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/staff/${encodeURIComponent(staffId)}/counters/${encodeURIComponent(counterId)}`,
        { method: "DELETE" },
      );

      if (currentOrgIdRef.current !== targetOrgId || activeActionRequestIdRef.current !== actionRequestId) {
        return;
      }

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (response.status === 409) {
        const data = await response.json().catch(() => null);
        setActionError(data?.error || "Cannot remove assignment while the staff member has an active ticket.");
        return;
      }

      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => null);
        setActionError(data?.error || "Failed to remove counter assignment.");
        return;
      }

      setStaff((prev) =>
        prev.map((m) =>
          m.id === staffId
            ? {
                ...m,
                counters: m.counters.filter((c) => c.id !== counterId),
              }
            : m,
        ),
      );
      setActionSuccess("Counter assignment removed.");
    } catch {
      if (currentOrgIdRef.current === targetOrgId && activeActionRequestIdRef.current === actionRequestId) {
        setActionError("Network error. Unable to remove counter assignment.");
      }
    } finally {
      if (currentOrgIdRef.current === targetOrgId && activeActionRequestIdRef.current === actionRequestId) {
        setUnassigningKey(null);
      }
    }
  };

  // Remove staff member from organization
  const handleRemoveMember = async (staffId: string, memberLabel: string) => {
    if (!window.confirm(`Are you sure you want to remove ${memberLabel} from this organization?`)) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);

    if (isRemovingRef.current) return;
    isRemovingRef.current = true;
    setRemovingStaffId(staffId);

    const actionRequestId = ++activeActionRequestIdRef.current;
    const targetOrgId = organizationId;

    try {
      const response = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/staff/${encodeURIComponent(staffId)}`,
        { method: "DELETE" },
      );

      if (currentOrgIdRef.current !== targetOrgId || activeActionRequestIdRef.current !== actionRequestId) {
        return;
      }

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (response.status === 409) {
        const data = await response.json().catch(() => null);
        setActionError(data?.error || "Cannot remove member with active ticket or last administrator.");
        return;
      }

      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => null);
        setActionError(data?.error || "Failed to remove member.");
        return;
      }

      setStaff((prev) => prev.filter((m) => m.id !== staffId));
      setActionSuccess(`${memberLabel} was removed from the organization.`);
    } catch {
      if (currentOrgIdRef.current === targetOrgId && activeActionRequestIdRef.current === actionRequestId) {
        setActionError("Network error. Unable to remove staff member.");
      }
    } finally {
      if (currentOrgIdRef.current === targetOrgId && activeActionRequestIdRef.current === actionRequestId) {
        isRemovingRef.current = false;
        setRemovingStaffId(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-gray-900 sm:text-xl">
              Staff & Assignments
            </h3>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
              {staff.length} {staff.length === 1 ? "member" : "members"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            Onboard staff operators, view active roles, and assign them to physical service counters.
          </p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isLoading}
          aria-label="Refresh staff list"
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
        >
          <svg
            className={`h-3.5 w-3.5 text-gray-500 ${isLoading ? "animate-spin" : ""}`}
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
          Refresh
        </button>
      </div>

      {/* Global Action Feedback Alerts */}
      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800 shadow-sm flex items-start justify-between gap-3"
        >
          <p>{actionError}</p>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-600 hover:text-red-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800 shadow-sm flex items-start justify-between gap-3"
        >
          <p>{actionSuccess}</p>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Content State: Loading, Error, or List */}
      {isLoading ? (
        <StaffSkeleton />
      ) : fetchError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
        >
          <p className="text-sm font-medium">{fetchError}</p>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            Retry
          </button>
        </div>
      ) : staff.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-900">No staff members found</p>
          <p className="mt-1 text-xs text-gray-500">
            Onboard your first staff operator using the form below.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {staff.map((member) => {
            const memberAssignedCounterIds = new Set(member.counters.map((c) => c.id));
            const availableToAssign = counters.filter(
              (c) => c.isActive && !memberAssignedCounterIds.has(c.id),
            );
            const selectedCounterId = selectedCounterByStaffId[member.id] ?? "";
            const isMemberAssigning = assigningStaffId === member.id;
            const isMemberRemoving = removingStaffId === member.id;

            return (
              <div
                key={member.id}
                data-testid={`staff-card-${member.id}`}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 flex flex-col justify-between"
              >
                {/* Member Header */}
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">
                        {member.name || "Unnamed Operator"}
                      </h4>
                      <p className="text-xs text-gray-500">{member.email}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                          member.role === "ADMIN"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                      >
                        {member.role === "ADMIN" ? "Admin" : "Staff"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.id, member.name ?? member.email)}
                        disabled={isMemberRemoving}
                        aria-label={`Remove member ${member.name ?? member.email}`}
                        className="rounded p-1 text-gray-400 hover:text-red-600 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-600 disabled:opacity-50"
                        title="Remove member"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="1.5"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Assigned Counters */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Assigned Counters
                    </span>
                    <span className="text-xs text-gray-400">
                      {member.counters.length} assigned
                    </span>
                  </div>

                  {member.counters.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No counters assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {member.counters.map((c) => {
                        const isThisUnassigning = unassigningKey === `${member.id}-${c.id}`;
                        return (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800"
                          >
                            <span>{c.name}</span>
                            <button
                              type="button"
                              onClick={() => handleUnassignCounter(member.id, c.id)}
                              disabled={isThisUnassigning}
                              aria-label={`Unassign ${c.name} from ${member.name ?? member.email}`}
                              className="text-gray-400 hover:text-red-600 transition-colors focus-visible:outline-none"
                            >
                              <span aria-hidden="true">&times;</span>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Counter Assignment Selector */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex gap-2">
                    <select
                      aria-label={`Select counter to assign to ${member.name ?? member.email}`}
                      value={selectedCounterId}
                      onChange={(e) =>
                        setSelectedCounterByStaffId((prev) => ({
                          ...prev,
                          [member.id]: e.target.value,
                        }))
                      }
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
                      disabled={availableToAssign.length === 0 || isMemberAssigning}
                    >
                      <option value="">
                        {availableToAssign.length === 0
                          ? "No available counters"
                          : "Select counter to assign..."}
                      </option>
                      {availableToAssign.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAssignCounter(member.id)}
                      disabled={!selectedCounterId || isMemberAssigning}
                      className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
                    >
                      {isMemberAssigning ? "Assigning..." : "Assign"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Onboarding Form Card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <h4 className="text-base font-semibold text-gray-900">
            Onboard Staff Operator
          </h4>
          <p className="text-xs text-gray-500">
            Add a new staff member to this organization by name and email.
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
          >
            {formError}
          </div>
        )}

        {formSuccess && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
          >
            {formSuccess}
          </div>
        )}

        <form onSubmit={handleOnboardStaff} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="new-staff-name"
                className="block text-xs font-semibold text-gray-700"
              >
                Full Name
              </label>
              <input
                id="new-staff-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Alex Morgan"
                disabled={isOnboarding}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
              />
            </div>
            <div>
              <label
                htmlFor="new-staff-email"
                className="block text-xs font-semibold text-gray-700"
              >
                Email Address
              </label>
              <input
                id="new-staff-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="alex.morgan@example.com"
                disabled={isOnboarding}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isOnboarding}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 active:scale-[0.98] disabled:opacity-50"
            >
              {isOnboarding ? (
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
                      d="M4 12a8 8 0 018-8v8z"
                    />
                  </svg>
                  Onboarding...
                </>
              ) : (
                "Onboard Staff"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
