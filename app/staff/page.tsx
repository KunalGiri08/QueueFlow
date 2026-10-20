"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import {
  StaffOrgSelector,
  type OrganizationItem,
} from "@/components/staff/StaffOrgSelector";
import {
  StaffCounterSelector,
  type AssignedCounterItem,
  type CounterData,
} from "@/components/staff/StaffCounterSelector";
import {
  StaffActiveTicketCard,
  type ActiveTicket,
  type ActiveTicketAction,
} from "@/components/staff/StaffActiveTicketCard";
import {
  StaffAssignedQueues,
  type OperatorQueueItem,
} from "@/components/staff/StaffAssignedQueues";
import {
  useStaffSession,
  type CurrentUser,
} from "@/hooks/useStaffSession";
import { useStaffOrgData } from "@/hooks/useStaffOrgData";

function isValidCalledTicketResponse(data: unknown): data is {
  id: string;
  number: number;
  status: string;
  queueId: string;
  counterId: string | null;
  createdAt: string;
  updatedAt: string;
} {
  if (typeof data !== "object" || data === null) return false;
  const rec = data as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    typeof rec.number === "number" &&
    typeof rec.status === "string" &&
    typeof rec.queueId === "string" &&
    (rec.counterId === null || typeof rec.counterId === "string") &&
    typeof rec.createdAt === "string" &&
    typeof rec.updatedAt === "string"
  );
}

function StaffLoadingSkeleton() {
  return (
    <div aria-label="Loading staff console" className="space-y-6 animate-pulse">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded bg-gray-200" />
            <div className="h-4 w-64 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-44 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-36 rounded bg-gray-200 mb-4" />
        <div className="h-20 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}

function OrgDataSkeleton() {
  return (
    <div aria-label="Loading operator data" className="space-y-6 animate-pulse">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="h-4 w-60 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-48 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-32 rounded bg-gray-200 mb-4" />
        <div className="h-16 w-full rounded bg-gray-100" />
      </div>
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-gray-200 pb-4">
          <div className="h-6 w-36 rounded bg-gray-200" />
          <div className="h-9 w-24 rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-36 rounded-xl bg-gray-100" />
          <div className="h-36 rounded-xl bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

export default function StaffOperatorPage() {
  const router = useRouter();
  const {
    user,
    organizations,
    selectedOrgId,
    selectedOrganization,
    isLoading,
    error,
    setSelectedOrgId,
    retrySession,
  } = useStaffSession();

  const {
    assignedCounters,
    selectedCounterId,
    activeTicket,
    counterWarning,
    assignedQueues,
    isOrgDataLoading,
    orgDataError,
    isRefreshingQueues,
    queuesError,
    setSelectedCounterId,
    setCounterWarning,
    setActiveTicket,
    setAssignedQueues,
    retryOrgData,
    refreshQueues,
    fetchQueueStatuses,
    recoverActiveTicket,
    resetOrgData,
  } = useStaffOrgData({
    orgId: selectedOrgId,
    staffId: user?.id ?? null,
  });

  const selectedOrgIdRef = useRef<string | null>(null);

  // Step 4 state: Calling next ticket state & mutation error
  const [callingQueueId, setCallingQueueId] = useState<string | null>(null);
  const [callActionError, setCallActionError] = useState<string | null>(null);

  // Step 5 state: Active ticket lifecycle action state & error
  const [activeTicketAction, setActiveTicketAction] = useState<
    "start" | "complete" | "skip" | null
  >(null);
  const [ticketActionError, setTicketActionError] = useState<string | null>(null);

  useEffect(() => {
    selectedOrgIdRef.current = selectedOrgId;
  }, [selectedOrgId]);

  const handleOrgChange = (newOrgId: string) => {
    if (newOrgId === selectedOrgId) return;
    resetOrgData();
    setCallActionError(null);
    setCallingQueueId(null);
    setActiveTicketAction(null);
    setTicketActionError(null);
    setSelectedOrgId(newOrgId);
  };

  const handleCallNext = async (queue: OperatorQueueItem) => {
    if (
      !selectedOrgId ||
      !user?.id ||
      !selectedCounterId ||
      callingQueueId !== null ||
      activeTicket !== null ||
      queue.waitingCount <= 0
    ) {
      return;
    }

    const selectedCounterItem = assignedCounters.find(
      (a) => a.counter.id === selectedCounterId && a.counter.isActive,
    );
    if (!selectedCounterItem) {
      setCallActionError(
        "Please select an active assigned counter before calling a ticket.",
      );
      return;
    }

    const currentOrg = selectedOrgId;
    const currentStaff = user.id;

    setCallingQueueId(queue.id);
    setCallActionError(null);

    try {
      const res = await fetch(
        `/api/queues/${encodeURIComponent(queue.id)}/next`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            counterId: selectedCounterId,
          }),
        },
      );

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return;
      }

      if (res.status === 409) {
        let conflictMsg = "Unable to call next ticket due to a conflict.";
        try {
          const errJson: unknown = await res.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            typeof (errJson as Record<string, unknown>).error === "string"
          ) {
            conflictMsg = (errJson as Record<string, unknown>).error as string;
          }
        } catch {
          // fallback
        }

        if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
          setCallActionError(conflictMsg);
        }

        // Recover active ticket state and refresh queue counts
        try {
          const recoveredTicket = await recoverActiveTicket(
            currentOrg,
            currentStaff,
          );
          if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
            setActiveTicket(recoveredTicket);
            if (recoveredTicket && recoveredTicket.counterId) {
              const matching = assignedCounters.find(
                (a) => a.counter.id === recoveredTicket.counterId,
              );
              if (matching && matching.counter.isActive) {
                setSelectedCounterId(matching.counter.id);
                setCounterWarning(null);
              } else if (!matching) {
                const cName = recoveredTicket.counter?.name || recoveredTicket.counterId;
                setCounterWarning(
                  `This active ticket is tied to Counter "${cName}", which is no longer assigned to your account in this organization.`,
                );
              } else {
                setCounterWarning(
                  `This active ticket is tied to Counter "${matching.counter.name}", which is currently inactive.`,
                );
              }
            }
          }
        } catch {
          // Ignore recovery error
        }

        try {
          const refreshedQueues = await fetchQueueStatuses(
            currentOrg,
            currentStaff,
          );
          if (
            selectedOrgIdRef.current === currentOrg &&
            user.id === currentStaff &&
            refreshedQueues !== null
          ) {
            setAssignedQueues(refreshedQueues);
          }
        } catch {
          // Ignore queue refresh error
        }

        return;
      }

      if (!res.ok) {
        let errorMsg = `Failed to call next ticket (status ${res.status})`;
        try {
          const errJson: unknown = await res.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            typeof (errJson as Record<string, unknown>).error === "string"
          ) {
            errorMsg = (errJson as Record<string, unknown>).error as string;
          }
        } catch {
          // fallback
        }

        if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
          setCallActionError(errorMsg);
        }
        return;
      }

      const ticketJson: unknown = await res.json();
      if (!isValidCalledTicketResponse(ticketJson)) {
        throw new Error("Malformed ticket response received from server.");
      }

      if (selectedOrgIdRef.current !== currentOrg || user.id !== currentStaff) {
        return;
      }

      const newActiveTicket: ActiveTicket = {
        id: ticketJson.id,
        number: ticketJson.number,
        status: ticketJson.status === "SERVING" ? "SERVING" : "CALLED",
        queueId: ticketJson.queueId,
        counterId: ticketJson.counterId ?? selectedCounterId,
        createdAt: ticketJson.createdAt,
        updatedAt: ticketJson.updatedAt,
        queue: {
          id: queue.id,
          name: queue.name,
        },
        service: {
          id: queue.service.id,
          name: queue.service.name,
        },
        counter: {
          id: selectedCounterItem.counter.id,
          name: selectedCounterItem.counter.name,
        },
      };

      setActiveTicket(newActiveTicket);
      setCounterWarning(null);

      // Refresh queue counts
      try {
        const refreshedQueues = await fetchQueueStatuses(
          currentOrg,
          currentStaff,
        );
        if (
          selectedOrgIdRef.current === currentOrg &&
          user.id === currentStaff &&
          refreshedQueues !== null
        ) {
          setAssignedQueues(refreshedQueues);
        }
      } catch {
        // Refresh error can be handled quietly or ignored
      }
    } catch (err) {
      if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error. Unable to call next ticket at this time.";
        setCallActionError(msg);
      }
    } finally {
      if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
        setCallingQueueId(null);
      }
    }
  };

  const handleStartService = async () => {
    if (
      !activeTicket ||
      activeTicket.status !== "CALLED" ||
      activeTicketAction !== null ||
      callingQueueId !== null ||
      !selectedOrgId ||
      !user?.id
    ) {
      return;
    }

    const currentOrg = selectedOrgId;
    const currentStaff = user.id;
    const ticketId = activeTicket.id;

    setActiveTicketAction("start");
    setTicketActionError(null);

    try {
      const res = await fetch(
        `/api/tickets/${encodeURIComponent(ticketId)}/start`,
        {
          method: "PATCH",
        },
      );

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return;
      }

      if (res.status === 409) {
        let conflictMsg = "Ticket state changed; refreshing status.";
        try {
          const errJson: unknown = await res.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            typeof (errJson as Record<string, unknown>).error === "string"
          ) {
            conflictMsg = (errJson as Record<string, unknown>).error as string;
          }
        } catch {
          // fallback
        }

        if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
          setTicketActionError(conflictMsg);
        }

        // Recover active ticket state and refresh queue counts
        try {
          const recovered = await recoverActiveTicket(
            currentOrg,
            currentStaff,
          );
          if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
            setActiveTicket(recovered);
          }
        } catch {
          // Ignore
        }

        try {
          const refreshedQueues = await fetchQueueStatuses(
            currentOrg,
            currentStaff,
          );
          if (
            selectedOrgIdRef.current === currentOrg &&
            user.id === currentStaff &&
            refreshedQueues !== null
          ) {
            setAssignedQueues(refreshedQueues);
          }
        } catch {
          // Ignore
        }

        return;
      }

      if (!res.ok) {
        let errorMsg = `Failed to start service (status ${res.status})`;
        try {
          const errJson: unknown = await res.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            typeof (errJson as Record<string, unknown>).error === "string"
          ) {
            errorMsg = (errJson as Record<string, unknown>).error as string;
          }
        } catch {
          // fallback
        }

        if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
          setTicketActionError(errorMsg);
        }
        return;
      }

      const data: unknown = await res.json();
      if (!isValidCalledTicketResponse(data) || data.status !== "SERVING") {
        throw new Error(
          "Malformed response from server after starting service.",
        );
      }

      if (selectedOrgIdRef.current !== currentOrg || user.id !== currentStaff) {
        return;
      }

      setActiveTicket((prev) => {
        if (!prev || prev.id !== ticketId) return prev;
        return {
          ...prev,
          status: "SERVING",
          updatedAt: data.updatedAt,
        };
      });

      // Refresh queue counts so currentlyServing updates on the queue card
      try {
        const refreshedQueues = await fetchQueueStatuses(
          currentOrg,
          currentStaff,
        );
        if (
          selectedOrgIdRef.current === currentOrg &&
          user.id === currentStaff &&
          refreshedQueues !== null
        ) {
          setAssignedQueues(refreshedQueues);
        }
      } catch {
        // Ignore
      }
    } catch (err) {
      if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error. Unable to start service at this time.";
        setTicketActionError(msg);
      }
    } finally {
      if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
        setActiveTicketAction(null);
      }
    }
  };

  const handleCompleteService = async () => {
    if (
      !activeTicket ||
      activeTicket.status !== "SERVING" ||
      activeTicketAction !== null ||
      callingQueueId !== null ||
      !selectedOrgId ||
      !user?.id
    ) {
      return;
    }

    const currentOrg = selectedOrgId;
    const currentStaff = user.id;
    const ticketId = activeTicket.id;

    setActiveTicketAction("complete");
    setTicketActionError(null);

    try {
      const res = await fetch(
        `/api/tickets/${encodeURIComponent(ticketId)}/complete`,
        {
          method: "PATCH",
        },
      );

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return;
      }

      if (res.status === 409) {
        let conflictMsg = "Ticket state changed; refreshing status.";
        try {
          const errJson: unknown = await res.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            typeof (errJson as Record<string, unknown>).error === "string"
          ) {
            conflictMsg = (errJson as Record<string, unknown>).error as string;
          }
        } catch {
          // fallback
        }

        if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
          setTicketActionError(conflictMsg);
        }

        // Recover active ticket state and refresh queue counts
        try {
          const recovered = await recoverActiveTicket(
            currentOrg,
            currentStaff,
          );
          if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
            setActiveTicket(recovered);
          }
        } catch {
          // Ignore
        }

        try {
          const refreshedQueues = await fetchQueueStatuses(
            currentOrg,
            currentStaff,
          );
          if (
            selectedOrgIdRef.current === currentOrg &&
            user.id === currentStaff &&
            refreshedQueues !== null
          ) {
            setAssignedQueues(refreshedQueues);
          }
        } catch {
          // Ignore
        }

        return;
      }

      if (!res.ok) {
        let errorMsg = `Failed to complete service (status ${res.status})`;
        try {
          const errJson: unknown = await res.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            typeof (errJson as Record<string, unknown>).error === "string"
          ) {
            errorMsg = (errJson as Record<string, unknown>).error as string;
          }
        } catch {
          // fallback
        }

        if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
          setTicketActionError(errorMsg);
        }
        return;
      }

      const data: unknown = await res.json();
      if (!isValidCalledTicketResponse(data) || data.status !== "COMPLETED") {
        throw new Error(
          "Malformed response from server after completing service.",
        );
      }

      if (selectedOrgIdRef.current !== currentOrg || user.id !== currentStaff) {
        return;
      }

      // Completing must clear the active ticket and refresh queue metrics
      setActiveTicket(null);
      setCounterWarning(null);

      try {
        const refreshedQueues = await fetchQueueStatuses(
          currentOrg,
          currentStaff,
        );
        if (
          selectedOrgIdRef.current === currentOrg &&
          user.id === currentStaff &&
          refreshedQueues !== null
        ) {
          setAssignedQueues(refreshedQueues);
        }
      } catch {
        // Ignore
      }
    } catch (err) {
      if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error. Unable to complete service at this time.";
        setTicketActionError(msg);
      }
    } finally {
      if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
        setActiveTicketAction(null);
      }
    }
  };

  const handleSkipTicket = async () => {
    if (
      !activeTicket ||
      (activeTicket.status !== "CALLED" && activeTicket.status !== "SERVING") ||
      activeTicketAction !== null ||
      callingQueueId !== null ||
      !selectedOrgId ||
      !user?.id
    ) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to skip ticket #${activeTicket.number}? The ticket will leave the active queue and will no longer be served.`,
    );
    if (!confirmed) {
      return;
    }

    const currentOrg = selectedOrgId;
    const currentStaff = user.id;
    const ticketId = activeTicket.id;

    setActiveTicketAction("skip");
    setTicketActionError(null);

    try {
      const res = await fetch(
        `/api/tickets/${encodeURIComponent(ticketId)}/skip`,
        {
          method: "PATCH",
        },
      );

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return;
      }

      if (res.status === 409) {
        let conflictMsg = "Ticket state changed; refreshing status.";
        try {
          const errJson: unknown = await res.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            typeof (errJson as Record<string, unknown>).error === "string"
          ) {
            conflictMsg = (errJson as Record<string, unknown>).error as string;
          }
        } catch {
          // fallback
        }

        if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
          setTicketActionError(conflictMsg);
        }

        // Recover active ticket state and refresh queue counts
        try {
          const recovered = await recoverActiveTicket(
            currentOrg,
            currentStaff,
          );
          if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
            setActiveTicket(recovered);
          }
        } catch {
          // Ignore
        }

        try {
          const refreshedQueues = await fetchQueueStatuses(
            currentOrg,
            currentStaff,
          );
          if (
            selectedOrgIdRef.current === currentOrg &&
            user.id === currentStaff &&
            refreshedQueues !== null
          ) {
            setAssignedQueues(refreshedQueues);
          }
        } catch {
          // Ignore
        }

        return;
      }

      if (!res.ok) {
        let errorMsg = `Failed to skip ticket (status ${res.status})`;
        try {
          const errJson: unknown = await res.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            typeof (errJson as Record<string, unknown>).error === "string"
          ) {
            errorMsg = (errJson as Record<string, unknown>).error as string;
          }
        } catch {
          // fallback
        }

        if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
          setTicketActionError(errorMsg);
        }
        return;
      }

      const data: unknown = await res.json();
      if (!isValidCalledTicketResponse(data) || data.status !== "SKIPPED") {
        throw new Error(
          "Malformed response from server after skipping ticket.",
        );
      }

      if (selectedOrgIdRef.current !== currentOrg || user.id !== currentStaff) {
        return;
      }

      // Skipping must clear the active ticket and refresh queue metrics
      setActiveTicket(null);
      setCounterWarning(null);

      try {
        const refreshedQueues = await fetchQueueStatuses(
          currentOrg,
          currentStaff,
        );
        if (
          selectedOrgIdRef.current === currentOrg &&
          user.id === currentStaff &&
          refreshedQueues !== null
        ) {
          setAssignedQueues(refreshedQueues);
        }
      } catch {
        // Ignore
      }
    } catch (err) {
      if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error. Unable to skip ticket at this time.";
        setTicketActionError(msg);
      }
    } finally {
      if (selectedOrgIdRef.current === currentOrg && user.id === currentStaff) {
        setActiveTicketAction(null);
      }
    }
  };



  const handleCounterChange = (counterId: string) => {
    const isTargetActive = assignedCounters.some(
      (a) => a.counter.id === counterId && a.counter.isActive,
    );
    if (isTargetActive) {
      setSelectedCounterId(counterId);
      if (activeTicket && activeTicket.counterId === counterId) {
        setCounterWarning(null);
      }
    }
  };

  const selectedCounterItem = assignedCounters.find(
    (a) => a.counter.id === selectedCounterId,
  );
  const hasActiveCounterSelected = Boolean(
    selectedCounterItem && selectedCounterItem.counter.isActive,
  );

  const canCallNext = (q: OperatorQueueItem) => {
    return (
      hasActiveCounterSelected &&
      activeTicket === null &&
      q.waitingCount > 0 &&
      callingQueueId === null &&
      activeTicketAction === null
    );
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Staff Operator Console
              </h1>
              <p className="mt-2 text-base text-gray-600 sm:text-lg">
                Manage counters, call waiting customers, and serve tickets.
              </p>
            </div>
            {user && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-gray-900">
                  {user.name || user.email}
                </span>
              </div>
            )}
          </div>

          {isLoading ? (
            <StaffLoadingSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
            >
              <p className="text-base font-medium">{error}</p>
              <button
                type="button"
                onClick={retrySession}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Retry
              </button>
            </div>
          ) : organizations.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900">
                No Organization Memberships
              </h2>
              <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
                Your account ({user?.email || "signed-in"}) is not currently a
                member of any organization. Ask an organization administrator to
                invite you or assign you to staff.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href="/organizations"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                >
                  Explore Public Organizations
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Organization Selection Bar */}
              <StaffOrgSelector
                organizations={organizations}
                selectedOrgId={selectedOrgId}
                onSelectOrg={handleOrgChange}
              />

              {/* Organization Operator Data Area */}
              {isOrgDataLoading ? (
                <OrgDataSkeleton />
              ) : orgDataError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
                >
                  <p className="text-sm font-medium">{orgDataError}</p>
                  <button
                    type="button"
                    onClick={retryOrgData}
                    className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                  >
                    Retry Loading
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Assigned Counter Selector or Empty State & Warning Banner */}
                  <StaffCounterSelector
                    assignedCounters={assignedCounters}
                    selectedCounterId={selectedCounterId}
                    onSelectCounter={handleCounterChange}
                    counterWarning={counterWarning}
                    organizationName={selectedOrganization?.name}
                  />

                  {/* Active Ticket Card, Actions & Action Error Alert */}
                  <StaffActiveTicketCard
                    activeTicket={activeTicket}
                    activeTicketAction={activeTicketAction}
                    isActionDisabled={callingQueueId !== null}
                    onStartService={handleStartService}
                    onCompleteService={handleCompleteService}
                    onSkipTicket={handleSkipTicket}
                    ticketActionError={ticketActionError}
                    onDismissError={() => setTicketActionError(null)}
                  />

                  {/* Assigned Queues Section */}
                  <StaffAssignedQueues
                    assignedQueues={assignedQueues}
                    isRefreshingQueues={isRefreshingQueues}
                    isRefreshDisabled={isRefreshingQueues || isOrgDataLoading}
                    onRefreshQueues={refreshQueues}
                    queuesError={queuesError}
                    callActionError={callActionError}
                    onDismissCallError={() => setCallActionError(null)}
                    callingQueueId={callingQueueId}
                    onCallNext={handleCallNext}
                    canCallNext={canCallNext}
                    organizationName={selectedOrganization?.name}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
