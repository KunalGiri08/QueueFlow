"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
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

interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
}

interface AssignedQueueItem {
  id: string;
  name: string;
  isActive: boolean;
  service: {
    id: string;
    name: string;
  };
}

interface OperatorQueueItem {
  id: string;
  name: string;
  isActive: boolean;
  service: {
    id: string;
    name: string;
  };
  waitingCount: number;
  currentlyServing: number | null;
}


function parseActiveTicketResponse(ticketJson: unknown): ActiveTicket | null {
  if (
    !ticketJson ||
    typeof ticketJson !== "object" ||
    !("ticket" in ticketJson)
  ) {
    throw new Error("Malformed active-ticket response");
  }

  const rawTicket = (ticketJson as { ticket: unknown }).ticket;
  if (rawTicket === null || typeof rawTicket !== "object") {
    return null;
  }

  const ticketRec = rawTicket as Record<string, unknown>;
  const rawQueue = ticketRec.queue;
  const rawService = ticketRec.service;
  const rawCounter = ticketRec.counter;

  if (
    typeof ticketRec.id === "string" &&
    typeof ticketRec.number === "number" &&
    (ticketRec.status === "CALLED" || ticketRec.status === "SERVING") &&
    typeof ticketRec.queueId === "string" &&
    typeof ticketRec.createdAt === "string" &&
    typeof ticketRec.updatedAt === "string" &&
    typeof rawQueue === "object" &&
    rawQueue !== null &&
    typeof (rawQueue as Record<string, unknown>).id === "string" &&
    typeof (rawQueue as Record<string, unknown>).name === "string" &&
    typeof rawService === "object" &&
    rawService !== null &&
    typeof (rawService as Record<string, unknown>).id === "string" &&
    typeof (rawService as Record<string, unknown>).name === "string"
  ) {
    const counterObj =
      typeof rawCounter === "object" &&
      rawCounter !== null &&
      typeof (rawCounter as Record<string, unknown>).id === "string" &&
      typeof (rawCounter as Record<string, unknown>).name === "string"
        ? {
            id: (rawCounter as Record<string, unknown>).id as string,
            name: (rawCounter as Record<string, unknown>).name as string,
          }
        : null;

    return {
      id: ticketRec.id,
      number: ticketRec.number,
      status: ticketRec.status as "CALLED" | "SERVING",
      queueId: ticketRec.queueId,
      counterId:
        typeof ticketRec.counterId === "string"
          ? ticketRec.counterId
          : null,
      createdAt: ticketRec.createdAt,
      updatedAt: ticketRec.updatedAt,
      queue: {
        id: (rawQueue as Record<string, unknown>).id as string,
        name: (rawQueue as Record<string, unknown>).name as string,
      },
      service: {
        id: (rawService as Record<string, unknown>).id as string,
        name: (rawService as Record<string, unknown>).name as string,
      },
      counter: counterObj,
    };
  }

  return null;
}

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
  const { isSignedIn, isLoaded } = useAuth();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step 2 state: Assigned counters, selected counter, recovered active ticket
  const [assignedCounters, setAssignedCounters] = useState<AssignedCounterItem[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<ActiveTicket | null>(null);
  const [counterWarning, setCounterWarning] = useState<string | null>(null);
  const [isOrgDataLoading, setIsOrgDataLoading] = useState(false);
  const [orgDataError, setOrgDataError] = useState<string | null>(null);

  // Step 3 state: Assigned queues, refresh status, and error state
  const [assignedQueues, setAssignedQueues] = useState<OperatorQueueItem[]>([]);
  const [isRefreshingQueues, setIsRefreshingQueues] = useState(false);
  const [queuesError, setQueuesError] = useState<string | null>(null);
  const selectedOrgIdRef = useRef<string | null>(null);
  const orgDataAbortControllerRef = useRef<AbortController | null>(null);
  const orgDataGenerationRef = useRef(0);
  const queueRefreshAbortControllerRef = useRef<AbortController | null>(null);

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

  const fetchSessionData = useCallback(
    async (showSkeleton = true) => {
      if (showSkeleton) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const [meRes, orgsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/organizations"),
        ]);

        if (meRes.status === 401 || orgsRes.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
          return;
        }

        if (!meRes.ok) {
          throw new Error(`Failed to load profile (status ${meRes.status})`);
        }

        if (!orgsRes.ok) {
          throw new Error(
            `Failed to load organizations (status ${orgsRes.status})`,
          );
        }

        const meJson: unknown = await meRes.json();
        const orgsJson: unknown = await orgsRes.json();

        if (
          !meJson ||
          typeof meJson !== "object" ||
          !("id" in meJson) ||
          typeof (meJson as { id: unknown }).id !== "string"
        ) {
          throw new Error("Malformed profile response");
        }

        if (!Array.isArray(orgsJson)) {
          throw new Error("Malformed organizations response");
        }

        const validatedUser: CurrentUser = {
          id: (meJson as { id: string }).id,
          name:
            "name" in meJson &&
            typeof (meJson as { name: unknown }).name === "string"
              ? (meJson as { name: string }).name
              : null,
          email:
            "email" in meJson &&
            typeof (meJson as { email: unknown }).email === "string"
              ? (meJson as { email: string }).email
              : "",
        };

        const validatedOrgs: OrganizationItem[] = orgsJson.filter(
          (org): org is OrganizationItem =>
            typeof org === "object" &&
            org !== null &&
            typeof (org as { id?: unknown }).id === "string" &&
            typeof (org as { name?: unknown }).name === "string" &&
            typeof (org as { slug?: unknown }).slug === "string",
        );

        setUser(validatedUser);
        setOrganizations(validatedOrgs);

        setSelectedOrgId((currentSelected) => {
          if (
            currentSelected &&
            validatedOrgs.some((org) => org.id === currentSelected)
          ) {
            return currentSelected;
          }
          return validatedOrgs.length > 0 ? validatedOrgs[0].id : null;
        });
      } catch {
        setError(
          "Unable to load your operator session at this time. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const fetchQueueStatusesOnly = useCallback(
    async (
      orgId: string,
      staffId: string,
      signal?: AbortSignal,
    ): Promise<OperatorQueueItem[] | null> => {
      const queuesRes = await fetch(
        `/api/organizations/${encodeURIComponent(orgId)}/staff/${encodeURIComponent(staffId)}/queues`,
        signal ? { signal } : undefined,
      );

      if (queuesRes.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return null;
      }

      if (!queuesRes.ok) {
        throw new Error(
          `Failed to load assigned queues (status ${queuesRes.status})`,
        );
      }

      const queuesJson: unknown = await queuesRes.json();
      if (!Array.isArray(queuesJson)) {
        throw new Error("Malformed assigned queues response");
      }

      const validQueues: AssignedQueueItem[] = queuesJson.filter(
        (item): item is AssignedQueueItem => {
          if (typeof item !== "object" || item === null) return false;
          const rec = item as Record<string, unknown>;
          if (
            typeof rec.id !== "string" ||
            typeof rec.name !== "string" ||
            typeof rec.isActive !== "boolean"
          ) {
            return false;
          }
          if (typeof rec.service !== "object" || rec.service === null) {
            return false;
          }
          const sRec = rec.service as Record<string, unknown>;
          return (
            typeof sRec.id === "string" && typeof sRec.name === "string"
          );
        },
      );

      const queueStatuses = await Promise.all(
        validQueues.map(async (queue): Promise<OperatorQueueItem> => {
          const statusRes = await fetch(
            `/api/queues/${encodeURIComponent(queue.id)}`,
            signal ? { signal } : undefined,
          );

          if (statusRes.status === 401) {
            router.push(
              `/sign-in?redirect_url=${encodeURIComponent("/staff")}`,
            );
            throw new Error("Unauthorized");
          }

          if (!statusRes.ok) {
            throw new Error(
              `Failed to load queue status for ${queue.name} (status ${statusRes.status})`,
            );
          }

          const statusJson: unknown = await statusRes.json();
          if (
            !statusJson ||
            typeof statusJson !== "object" ||
            statusJson === null
          ) {
            throw new Error(
              `Malformed queue status response for ${queue.name}`,
            );
          }

          const rec = statusJson as Record<string, unknown>;
          if (
            typeof rec.id !== "string" ||
            typeof rec.waitingCount !== "number" ||
            (rec.currentlyServing !== null &&
              typeof rec.currentlyServing !== "number")
          ) {
            throw new Error(
              `Invalid queue status fields for ${queue.name}`,
            );
          }

          return {
            id: queue.id,
            name: queue.name,
            isActive: queue.isActive,
            service: {
              id: queue.service.id,
              name: queue.service.name,
            },
            waitingCount: rec.waitingCount as number,
            currentlyServing:
              typeof rec.currentlyServing === "number"
                ? (rec.currentlyServing as number)
                : null,
          };
        }),
      );

      return queueStatuses;
    },
    [router],
  );

  const fetchActiveTicketRecovery = useCallback(
    async (
      orgId: string,
      staffId: string,
      signal?: AbortSignal,
    ): Promise<ActiveTicket | null> => {
      const ticketRes = await fetch(
        `/api/organizations/${encodeURIComponent(orgId)}/staff/${encodeURIComponent(staffId)}/active-ticket`,
        signal ? { signal } : undefined,
      );

      if (ticketRes.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return null;
      }

      if (!ticketRes.ok) {
        throw new Error(
          `Failed to load active ticket (status ${ticketRes.status})`,
        );
      }

      const ticketJson: unknown = await ticketRes.json();
      return parseActiveTicketResponse(ticketJson);
    },
    [router],
  );

  const fetchOrgOperatorData = useCallback(
    async (orgId: string, staffId: string, signal?: AbortSignal) => {
      const [countersRes, ticketRes, queuesResult] = await Promise.all([
        fetch(
          `/api/organizations/${encodeURIComponent(orgId)}/staff/${encodeURIComponent(staffId)}/counters`,
          signal ? { signal } : undefined,
        ),
        fetch(
          `/api/organizations/${encodeURIComponent(orgId)}/staff/${encodeURIComponent(staffId)}/active-ticket`,
          signal ? { signal } : undefined,
        ),
        fetchQueueStatusesOnly(orgId, staffId, signal),
      ]);

      if (countersRes.status === 401 || ticketRes.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
        return null;
      }

      if (queuesResult === null) {
        return null;
      }

      if (!countersRes.ok) {
        throw new Error(
          `Failed to load assigned counters (status ${countersRes.status})`,
        );
      }

      if (!ticketRes.ok) {
        throw new Error(
          `Failed to load active ticket (status ${ticketRes.status})`,
        );
      }

      const countersJson: unknown = await countersRes.json();
      const ticketJson: unknown = await ticketRes.json();

      if (!Array.isArray(countersJson)) {
        throw new Error("Malformed counters response");
      }

      const validAssignments: AssignedCounterItem[] = countersJson.filter(
        (item): item is AssignedCounterItem => {
          if (typeof item !== "object" || item === null) return false;
          const rec = item as Record<string, unknown>;
          if (typeof rec.id !== "string" || typeof rec.staffId !== "string") return false;
          if (typeof rec.counter !== "object" || rec.counter === null) return false;
          const counterRec = rec.counter as Record<string, unknown>;
          return (
            typeof counterRec.id === "string" &&
            typeof counterRec.name === "string" &&
            typeof counterRec.isActive === "boolean" &&
            typeof counterRec.organizationId === "string"
          );
        },
      );

      const validActiveTicket = parseActiveTicketResponse(ticketJson);

      let determinedCounterId: string | null = null;
      let warning: string | null = null;

      if (validActiveTicket && validActiveTicket.counterId) {
        const matchingAssignment = validAssignments.find(
          (a) => a.counter.id === validActiveTicket!.counterId,
        );

        if (matchingAssignment && matchingAssignment.counter.isActive) {
          determinedCounterId = matchingAssignment.counter.id;
        } else if (!matchingAssignment) {
          const counterName =
            validActiveTicket.counter?.name || validActiveTicket.counterId;
          warning = `This active ticket is tied to Counter "${counterName}", which is no longer assigned to your account in this organization.`;
        } else {
          warning = `This active ticket is tied to Counter "${matchingAssignment.counter.name}", which is currently inactive.`;
        }
      } else {
        const activeCounters = validAssignments.filter(
          (a) => a.counter.isActive,
        );
        if (activeCounters.length > 0) {
          determinedCounterId = activeCounters[0].counter.id;
        }
      }

      return {
        assignments: validAssignments,
        activeTicket: validActiveTicket,
        counterId: determinedCounterId,
        warning,
        queues: queuesResult,
      };
    },
    [router, fetchQueueStatusesOnly],
  );

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(`/sign-in?redirect_url=${encodeURIComponent("/staff")}`);
      return;
    }

    void Promise.resolve().then(() => fetchSessionData());
  }, [isLoaded, isSignedIn, router, fetchSessionData]);

  // Step 2, 3 & 4 effect: Load assigned counters, active ticket, and assigned queues when selected organization changes
  useEffect(() => {
    if (!selectedOrgId || !user?.id) return;

    let isCurrent = true;
    const currentGen = ++orgDataGenerationRef.current;

    orgDataAbortControllerRef.current?.abort();
    queueRefreshAbortControllerRef.current?.abort();

    const controller = new AbortController();
    orgDataAbortControllerRef.current = controller;

    setIsOrgDataLoading(true);
    setOrgDataError(null);
    setQueuesError(null);
    setCallActionError(null);
    setCallingQueueId(null);
    setActiveTicketAction(null);
    setTicketActionError(null);

    // Clear previous organization state immediately to satisfy requirements 6, 7 & 9
    setAssignedCounters([]);
    setSelectedCounterId(null);
    setActiveTicket(null);
    setCounterWarning(null);
    setAssignedQueues([]);

    fetchOrgOperatorData(selectedOrgId, user.id, controller.signal)
      .then((data) => {
        if (!isCurrent || currentGen !== orgDataGenerationRef.current || !data) return;
        setAssignedCounters(data.assignments);
        setActiveTicket(data.activeTicket);
        setSelectedCounterId(data.counterId);
        setCounterWarning(data.warning);
        setAssignedQueues(data.queues);
      })
      .catch((err: unknown) => {
        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name: unknown }).name === "AbortError")
        ) {
          return;
        }
        if (!isCurrent || currentGen !== orgDataGenerationRef.current) return;
        setOrgDataError(
          "Unable to load assigned counters, active ticket, and queues for this organization. Please try again.",
        );
      })
      .finally(() => {
        if (isCurrent && currentGen === orgDataGenerationRef.current) {
          setIsOrgDataLoading(false);
          if (orgDataAbortControllerRef.current === controller) {
            orgDataAbortControllerRef.current = null;
          }
        }
      });

    return () => {
      isCurrent = false;
      controller.abort();
      if (orgDataAbortControllerRef.current === controller) {
        orgDataAbortControllerRef.current = null;
      }
      queueRefreshAbortControllerRef.current?.abort();
      queueRefreshAbortControllerRef.current = null;
    };
  }, [selectedOrgId, user?.id, fetchOrgOperatorData]);

  // Global unmount cleanup for organization and queue-refresh controllers
  useEffect(() => {
    return () => {
      orgDataAbortControllerRef.current?.abort();
      queueRefreshAbortControllerRef.current?.abort();
    };
  }, []);

  const handleOrgChange = (newOrgId: string) => {
    if (newOrgId === selectedOrgId) return;
    orgDataAbortControllerRef.current?.abort();
    orgDataAbortControllerRef.current = null;
    queueRefreshAbortControllerRef.current?.abort();
    queueRefreshAbortControllerRef.current = null;
    setIsRefreshingQueues(false);
    setAssignedCounters([]);
    setSelectedCounterId(null);
    setActiveTicket(null);
    setCounterWarning(null);
    setAssignedQueues([]);
    setQueuesError(null);
    setCallActionError(null);
    setCallingQueueId(null);
    setActiveTicketAction(null);
    setTicketActionError(null);
    setOrgDataError(null);
    setSelectedOrgId(newOrgId);
  };

  const handleRetryOrgData = () => {
    if (!selectedOrgId || !user?.id) return;
    const currentGen = ++orgDataGenerationRef.current;
    orgDataAbortControllerRef.current?.abort();
    queueRefreshAbortControllerRef.current?.abort();

    const controller = new AbortController();
    orgDataAbortControllerRef.current = controller;

    setIsOrgDataLoading(true);
    setOrgDataError(null);
    setQueuesError(null);
    setCallActionError(null);
    setCallingQueueId(null);
    setActiveTicketAction(null);
    setTicketActionError(null);

    fetchOrgOperatorData(selectedOrgId, user.id, controller.signal)
      .then((data) => {
        if (currentGen !== orgDataGenerationRef.current || !data) return;
        setAssignedCounters(data.assignments);
        setActiveTicket(data.activeTicket);
        setSelectedCounterId(data.counterId);
        setCounterWarning(data.warning);
        setAssignedQueues(data.queues);
      })
      .catch((err: unknown) => {
        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name: unknown }).name === "AbortError")
        ) {
          return;
        }
        if (currentGen !== orgDataGenerationRef.current) return;
        setOrgDataError(
          "Unable to load assigned counters, active ticket, and queues for this organization. Please try again.",
        );
      })
      .finally(() => {
        if (currentGen === orgDataGenerationRef.current) {
          setIsOrgDataLoading(false);
          if (orgDataAbortControllerRef.current === controller) {
            orgDataAbortControllerRef.current = null;
          }
        }
      });
  };

  const handleRefreshQueues = async () => {
    if (!selectedOrgId || !user?.id || isRefreshingQueues) return;
    const currentOrg = selectedOrgId;
    const currentStaff = user.id;

    queueRefreshAbortControllerRef.current?.abort();
    const controller = new AbortController();
    queueRefreshAbortControllerRef.current = controller;

    setIsRefreshingQueues(true);
    setQueuesError(null);

    try {
      const queues = await fetchQueueStatusesOnly(
        currentOrg,
        currentStaff,
        controller.signal,
      );
      if (
        selectedOrgIdRef.current === currentOrg &&
        user.id === currentStaff &&
        queueRefreshAbortControllerRef.current === controller &&
        queues !== null
      ) {
        setAssignedQueues(queues);
      }
    } catch (err: unknown) {
      if (
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError") ||
        (typeof err === "object" &&
          err !== null &&
          "name" in err &&
          (err as { name: unknown }).name === "AbortError")
      ) {
        return;
      }
      if (
        selectedOrgIdRef.current === currentOrg &&
        user.id === currentStaff &&
        queueRefreshAbortControllerRef.current === controller
      ) {
        setQueuesError(
          "Unable to refresh queue status at this time. Please try again.",
        );
      }
    } finally {
      if (
        selectedOrgIdRef.current === currentOrg &&
        user.id === currentStaff &&
        queueRefreshAbortControllerRef.current === controller
      ) {
        setIsRefreshingQueues(false);
        queueRefreshAbortControllerRef.current = null;
      }
    }
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
          const recoveredTicket = await fetchActiveTicketRecovery(
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
          const refreshedQueues = await fetchQueueStatusesOnly(
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
        const refreshedQueues = await fetchQueueStatusesOnly(
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
          const recovered = await fetchActiveTicketRecovery(
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
          const refreshedQueues = await fetchQueueStatusesOnly(
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
        const refreshedQueues = await fetchQueueStatusesOnly(
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
          const recovered = await fetchActiveTicketRecovery(
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
          const refreshedQueues = await fetchQueueStatusesOnly(
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
        const refreshedQueues = await fetchQueueStatusesOnly(
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
          const recovered = await fetchActiveTicketRecovery(
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
          const refreshedQueues = await fetchQueueStatusesOnly(
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
        const refreshedQueues = await fetchQueueStatusesOnly(
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

  const selectedOrganization =
    organizations.find((org) => org.id === selectedOrgId) ?? null;

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

          {!isLoaded || (!isSignedIn && isLoaded) || isLoading ? (
            <StaffLoadingSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
            >
              <p className="text-base font-medium">{error}</p>
              <button
                type="button"
                onClick={() => fetchSessionData(true)}
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
                    onClick={handleRetryOrgData}
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
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Assigned Queues
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Live waiting volume and current ticket status for your assigned queues.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRefreshQueues}
                        disabled={isRefreshingQueues || isOrgDataLoading}
                        className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label="Refresh queues"
                      >
                        <svg
                          className={`h-4 w-4 text-gray-600 ${isRefreshingQueues ? "animate-spin" : ""}`}
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
                        <span>{isRefreshingQueues ? "Refreshing..." : "Refresh"}</span>
                      </button>
                    </div>

                    {queuesError && (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-800 shadow-sm flex items-center justify-between"
                      >
                        <span>{queuesError}</span>
                        <button
                          type="button"
                          onClick={handleRefreshQueues}
                          className="ml-3 font-semibold text-red-900 underline hover:no-underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {callActionError && (
                      <div
                        role="alert"
                        className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm flex items-start justify-between gap-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <svg
                            className="h-5 w-5 text-red-600 mt-0.5 shrink-0"
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
                          <div>
                            <p className="font-semibold">Unable to Call Next Ticket</p>
                            <p className="mt-0.5 text-xs text-red-700">{callActionError}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCallActionError(null)}
                          className="text-red-700 hover:text-red-900 font-medium text-xs p-1"
                          aria-label="Dismiss error"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {assignedQueues.length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
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
                              d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
                            />
                          </svg>
                        </div>
                        <h4 className="mt-3 text-base font-semibold text-gray-900">
                          No Queues Assigned
                        </h4>
                        <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
                          You do not currently have any active queues assigned in{" "}
                          <span className="font-medium text-gray-700">
                            {selectedOrganization?.name}
                          </span>
                          . An administrator must assign queues to your service
                          line before waiting tickets appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {assignedQueues.map((q) => (
                          <div
                            key={q.id}
                            className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h4 className="text-base font-semibold text-gray-900">
                                    {q.name}
                                  </h4>
                                  <p className="text-xs font-medium text-gray-500 mt-0.5">
                                    Service: {q.service.name}
                                  </p>
                                </div>
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200/60">
                                  Active
                                </span>
                              </div>
                            </div>

                            <div className="mt-5 border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
                              <div className="rounded-lg bg-gray-50 p-2.5">
                                <span className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                                  Waiting
                                </span>
                                <span className="mt-1 block text-2xl font-bold tracking-tight text-gray-900">
                                  {q.waitingCount}
                                </span>
                              </div>
                              <div className="rounded-lg bg-gray-50 p-2.5">
                                <span className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                                  Serving
                                </span>
                                <span className="mt-1 block text-2xl font-bold tracking-tight text-gray-900">
                                  {q.currentlyServing !== null
                                    ? `#${q.currentlyServing}`
                                    : "None"}
                                </span>
                              </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-gray-100">
                              <button
                                type="button"
                                onClick={() => handleCallNext(q)}
                                disabled={!canCallNext(q)}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed active:scale-[0.98]"
                                aria-label={`Call next ticket for ${q.name}`}
                              >
                                {callingQueueId === q.id ? (
                                  <>
                                    <svg
                                      className="h-4 w-4 animate-spin text-white"
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
                                    <span>Calling Next Ticket...</span>
                                  </>
                                ) : (
                                  <span>Call Next Ticket</span>
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
