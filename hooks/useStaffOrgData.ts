"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { AssignedCounterItem } from "@/components/staff/StaffCounterSelector";
import type { ActiveTicket } from "@/components/staff/StaffActiveTicketCard";
import type { OperatorQueueItem } from "@/components/staff/StaffAssignedQueues";

interface AssignedQueueItem {
  id: string;
  name: string;
  isActive: boolean;
  service: {
    id: string;
    name: string;
  };
}

export function parseActiveTicketResponse(ticketJson: unknown): ActiveTicket | null {
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

export interface UseStaffOrgDataOptions {
  /** Selected organization ID, or null if loading or unassigned */
  orgId: string | null;
  /** Authenticated staff operator user ID, or null if loading */
  staffId: string | null;
  /** Optional custom sign-in redirect URL for 401 responses */
  signInRedirectUrl?: string;
}

export interface UseStaffOrgDataReturn {
  // Operational Data
  assignedCounters: AssignedCounterItem[];
  selectedCounterId: string | null;
  activeTicket: ActiveTicket | null;
  counterWarning: string | null;
  assignedQueues: OperatorQueueItem[];

  // Primary Data Loading State
  isOrgDataLoading: boolean;
  orgDataError: string | null;

  // Queue Refresh State
  isRefreshingQueues: boolean;
  queuesError: string | null;

  // State Mutators
  setSelectedCounterId: (counterId: string | null) => void;
  setCounterWarning: (warning: string | null) => void;
  setActiveTicket: React.Dispatch<React.SetStateAction<ActiveTicket | null>>;
  setAssignedQueues: React.Dispatch<React.SetStateAction<OperatorQueueItem[]>>;

  // Lifecycle & Fetch Actions
  retryOrgData: () => void;
  refreshQueues: () => Promise<void>;
  fetchQueueStatuses: (
    arg1?: string | AbortSignal,
    arg2?: string,
    arg3?: AbortSignal,
  ) => Promise<OperatorQueueItem[] | null>;
  recoverActiveTicket: (
    arg1?: string | AbortSignal,
    arg2?: string,
    arg3?: AbortSignal,
  ) => Promise<ActiveTicket | null>;
  resetOrgData: () => void;
}

export function useStaffOrgData(
  options: UseStaffOrgDataOptions,
): UseStaffOrgDataReturn {
  const router = useRouter();
  const { orgId, staffId } = options;

  const [assignedCounters, setAssignedCounters] = useState<AssignedCounterItem[]>([]);
  const [selectedCounterId, setSelectedCounterId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<ActiveTicket | null>(null);
  const [counterWarning, setCounterWarning] = useState<string | null>(null);
  const [isOrgDataLoading, setIsOrgDataLoading] = useState(false);
  const [orgDataError, setOrgDataError] = useState<string | null>(null);

  const [assignedQueues, setAssignedQueues] = useState<OperatorQueueItem[]>([]);
  const [isRefreshingQueues, setIsRefreshingQueues] = useState(false);
  const [queuesError, setQueuesError] = useState<string | null>(null);
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);

  const orgIdRef = useRef<string | null>(orgId);
  const staffIdRef = useRef<string | null>(staffId);
  const orgDataAbortControllerRef = useRef<AbortController | null>(null);
  const orgDataGenerationRef = useRef(0);
  const queueRefreshAbortControllerRef = useRef<AbortController | null>(null);

  const backgroundPollAbortControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const queueUpdateSeqRef = useRef(0);
  const lastAppliedQueueSeqRef = useRef(0);
  const isRefreshingQueuesRef = useRef(false);
  const isOrgDataLoadingRef = useRef(false);
  const schedulePollRef = useRef<(() => void) | null>(null);

  const redirectUrl =
    options.signInRedirectUrl ??
    `/sign-in?redirect_url=${encodeURIComponent("/staff")}`;

  useEffect(() => {
    orgIdRef.current = orgId;
    staffIdRef.current = staffId;
  }, [orgId, staffId]);

  useEffect(() => {
    isRefreshingQueuesRef.current = isRefreshingQueues;
  }, [isRefreshingQueues]);

  useEffect(() => {
    isOrgDataLoadingRef.current = isOrgDataLoading;
  }, [isOrgDataLoading]);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const setAssignedQueuesExternal = useCallback<
    React.Dispatch<React.SetStateAction<OperatorQueueItem[]>>
  >((action) => {
    const nextSeq = ++queueUpdateSeqRef.current;
    lastAppliedQueueSeqRef.current = nextSeq;
    setAssignedQueues(action);
  }, []);

  const fetchQueueStatusesOnly = useCallback(
    async (
      targetOrgId: string,
      targetStaffId: string,
      signal?: AbortSignal,
      options?: { skipAuthRedirect?: boolean },
    ): Promise<OperatorQueueItem[] | null> => {
      const queuesRes = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/staff/${encodeURIComponent(targetStaffId)}/queues`,
        signal ? { signal } : undefined,
      );

      if (queuesRes.status === 401) {
        if (!options?.skipAuthRedirect) {
          router.push(redirectUrl);
        }
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
            if (!options?.skipAuthRedirect) {
              router.push(redirectUrl);
            }
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
    [router, redirectUrl],
  );

  const fetchActiveTicketRecovery = useCallback(
    async (
      targetOrgId: string,
      targetStaffId: string,
      signal?: AbortSignal,
    ): Promise<ActiveTicket | null> => {
      const ticketRes = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/staff/${encodeURIComponent(targetStaffId)}/active-ticket`,
        signal ? { signal } : undefined,
      );

      if (ticketRes.status === 401) {
        router.push(redirectUrl);
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
    [router, redirectUrl],
  );

  const fetchOrgOperatorData = useCallback(
    async (targetOrgId: string, targetStaffId: string, signal?: AbortSignal) => {
      const [countersRes, ticketRes, queuesResult] = await Promise.all([
        fetch(
          `/api/organizations/${encodeURIComponent(targetOrgId)}/staff/${encodeURIComponent(targetStaffId)}/counters`,
          signal ? { signal } : undefined,
        ),
        fetch(
          `/api/organizations/${encodeURIComponent(targetOrgId)}/staff/${encodeURIComponent(targetStaffId)}/active-ticket`,
          signal ? { signal } : undefined,
        ),
        fetchQueueStatusesOnly(targetOrgId, targetStaffId, signal),
      ]);

      if (countersRes.status === 401 || ticketRes.status === 401) {
        router.push(redirectUrl);
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
    [router, redirectUrl, fetchQueueStatusesOnly],
  );

  const resetOrgData = useCallback(() => {
    clearPollTimer();
    schedulePollRef.current = null;
    backgroundPollAbortControllerRef.current?.abort();
    backgroundPollAbortControllerRef.current = null;
    const nextSeq = ++queueUpdateSeqRef.current;
    lastAppliedQueueSeqRef.current = nextSeq;

    orgDataAbortControllerRef.current?.abort();
    orgDataAbortControllerRef.current = null;
    queueRefreshAbortControllerRef.current?.abort();
    queueRefreshAbortControllerRef.current = null;
    orgDataGenerationRef.current++;

    setAssignedCounters([]);
    setSelectedCounterId(null);
    setActiveTicket(null);
    setCounterWarning(null);
    setAssignedQueues([]);
    setQueuesError(null);
    setOrgDataError(null);
    setIsRefreshingQueues(false);
    isRefreshingQueuesRef.current = false;
    setIsOrgDataLoading(false);
    isOrgDataLoadingRef.current = false;
    setHasInitialLoaded(false);
  }, [clearPollTimer]);

  // Primary load effect triggered when orgId or staffId changes
  useEffect(() => {
    if (!orgId || !staffId) {
      clearPollTimer();
      schedulePollRef.current = null;
      backgroundPollAbortControllerRef.current?.abort();
      backgroundPollAbortControllerRef.current = null;
      orgDataAbortControllerRef.current?.abort();
      orgDataAbortControllerRef.current = null;
      queueRefreshAbortControllerRef.current?.abort();
      queueRefreshAbortControllerRef.current = null;
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setIsOrgDataLoading(false);
      isOrgDataLoadingRef.current = false;
      setHasInitialLoaded(false);
      return;
    }

    let isCurrent = true;
    const currentGen = ++orgDataGenerationRef.current;
    const currentOrg = orgId;
    const currentStaff = staffId;

    clearPollTimer();
    backgroundPollAbortControllerRef.current?.abort();
    backgroundPollAbortControllerRef.current = null;

    orgDataAbortControllerRef.current?.abort();
    queueRefreshAbortControllerRef.current?.abort();

    const controller = new AbortController();
    orgDataAbortControllerRef.current = controller;

    setIsOrgDataLoading(true);
    isOrgDataLoadingRef.current = true;
    setHasInitialLoaded(false);
    setOrgDataError(null);
    setQueuesError(null);

    // Clear previous organization state immediately to satisfy tenant isolation
    setAssignedCounters([]);
    setSelectedCounterId(null);
    setActiveTicket(null);
    setCounterWarning(null);
    setAssignedQueues([]);

    fetchOrgOperatorData(orgId, staffId, controller.signal)
      .then((data) => {
        if (
          !isCurrent ||
          currentGen !== orgDataGenerationRef.current ||
          currentOrg !== orgIdRef.current ||
          currentStaff !== staffIdRef.current ||
          !data
        ) {
          return;
        }
        const nextSeq = ++queueUpdateSeqRef.current;
        lastAppliedQueueSeqRef.current = nextSeq;
        setAssignedCounters(data.assignments);
        setActiveTicket(data.activeTicket);
        setSelectedCounterId(data.counterId);
        setCounterWarning(data.warning);
        setAssignedQueues(data.queues);
        setHasInitialLoaded(true);
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
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
          !isCurrent ||
          currentGen !== orgDataGenerationRef.current ||
          currentOrg !== orgIdRef.current ||
          currentStaff !== staffIdRef.current
        ) {
          return;
        }
        setOrgDataError(
          "Unable to load assigned counters, active ticket, and queues for this organization. Please try again.",
        );
      })
      .finally(() => {
        if (
          isCurrent &&
          currentGen === orgDataGenerationRef.current &&
          currentOrg === orgIdRef.current &&
          !controller.signal.aborted
        ) {
          setIsOrgDataLoading(false);
          isOrgDataLoadingRef.current = false;
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
      backgroundPollAbortControllerRef.current?.abort();
      backgroundPollAbortControllerRef.current = null;
      clearPollTimer();
      schedulePollRef.current = null;
    };
  }, [orgId, staffId, fetchOrgOperatorData, clearPollTimer]);

  // Visibility-aware background queue polling every 10 seconds while context is valid
  useEffect(() => {
    if (!orgId || !staffId || !hasInitialLoaded || isOrgDataLoading || orgDataError) {
      clearPollTimer();
      schedulePollRef.current = null;
      backgroundPollAbortControllerRef.current?.abort();
      backgroundPollAbortControllerRef.current = null;
      return;
    }

    let isCancelled = false;
    const currentOrg = orgId;
    const currentStaff = staffId;

    const schedulePoll = () => {
      if (isCancelled) return;
      clearPollTimer();
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      pollTimerRef.current = setTimeout(async () => {
        if (isCancelled) return;
        await runPoll();
      }, 10000);
    };

    schedulePollRef.current = schedulePoll;

    const runPoll = async () => {
      if (isCancelled) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      if (isRefreshingQueuesRef.current || isOrgDataLoadingRef.current) {
        schedulePoll();
        return;
      }

      backgroundPollAbortControllerRef.current?.abort();
      const controller = new AbortController();
      backgroundPollAbortControllerRef.current = controller;
      const pollSeq = ++queueUpdateSeqRef.current;

      try {
        const queues = await fetchQueueStatusesOnly(
          currentOrg,
          currentStaff,
          controller.signal,
          { skipAuthRedirect: true },
        );

        if (
          !isCancelled &&
          !controller.signal.aborted &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff &&
          backgroundPollAbortControllerRef.current === controller &&
          pollSeq >= lastAppliedQueueSeqRef.current &&
          queues !== null
        ) {
          lastAppliedQueueSeqRef.current = pollSeq;
          setAssignedQueues(queues);
        }
      } catch {
        // Non-destructive: transient background errors do not overwrite UI
      } finally {
        if (backgroundPollAbortControllerRef.current === controller) {
          backgroundPollAbortControllerRef.current = null;
        }
        if (
          !isCancelled &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff &&
          (typeof document === "undefined" ||
            document.visibilityState === "visible")
        ) {
          schedulePoll();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        clearPollTimer();
        backgroundPollAbortControllerRef.current?.abort();
        backgroundPollAbortControllerRef.current = null;
      } else if (document.visibilityState === "visible") {
        clearPollTimer();
        void runPoll();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    // Schedule initial poll if tab is visible
    if (
      typeof document === "undefined" ||
      document.visibilityState === "visible"
    ) {
      schedulePoll();
    }

    return () => {
      isCancelled = true;
      schedulePollRef.current = null;
      clearPollTimer();
      backgroundPollAbortControllerRef.current?.abort();
      backgroundPollAbortControllerRef.current = null;
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
    };
  }, [
    orgId,
    staffId,
    hasInitialLoaded,
    isOrgDataLoading,
    orgDataError,
    clearPollTimer,
    fetchQueueStatusesOnly,
  ]);

  // Global unmount cleanup
  useEffect(() => {
    return () => {
      clearPollTimer();
      schedulePollRef.current = null;
      backgroundPollAbortControllerRef.current?.abort();
      orgDataAbortControllerRef.current?.abort();
      queueRefreshAbortControllerRef.current?.abort();
    };
  }, [clearPollTimer]);

  const retryOrgData = useCallback(() => {
    if (!orgId || !staffId) return;
    const currentGen = ++orgDataGenerationRef.current;
    const currentOrg = orgId;
    const currentStaff = staffId;

    clearPollTimer();
    schedulePollRef.current = null;
    backgroundPollAbortControllerRef.current?.abort();
    backgroundPollAbortControllerRef.current = null;

    orgDataAbortControllerRef.current?.abort();
    queueRefreshAbortControllerRef.current?.abort();

    const controller = new AbortController();
    orgDataAbortControllerRef.current = controller;

    setIsOrgDataLoading(true);
    isOrgDataLoadingRef.current = true;
    setHasInitialLoaded(false);
    setOrgDataError(null);
    setQueuesError(null);

    fetchOrgOperatorData(orgId, staffId, controller.signal)
      .then((data) => {
        if (
          currentGen !== orgDataGenerationRef.current ||
          currentOrg !== orgIdRef.current ||
          currentStaff !== staffIdRef.current ||
          !data
        ) {
          return;
        }
        const nextSeq = ++queueUpdateSeqRef.current;
        lastAppliedQueueSeqRef.current = nextSeq;
        setAssignedCounters(data.assignments);
        setActiveTicket(data.activeTicket);
        setSelectedCounterId(data.counterId);
        setCounterWarning(data.warning);
        setAssignedQueues(data.queues);
        setHasInitialLoaded(true);
      })
      .catch((err: unknown) => {
        if (
          controller.signal.aborted ||
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
          currentGen !== orgDataGenerationRef.current ||
          currentOrg !== orgIdRef.current ||
          currentStaff !== staffIdRef.current
        ) {
          return;
        }
        setOrgDataError(
          "Unable to load assigned counters, active ticket, and queues for this organization. Please try again.",
        );
      })
      .finally(() => {
        if (
          currentGen === orgDataGenerationRef.current &&
          currentOrg === orgIdRef.current &&
          !controller.signal.aborted
        ) {
          setIsOrgDataLoading(false);
          isOrgDataLoadingRef.current = false;
          if (orgDataAbortControllerRef.current === controller) {
            orgDataAbortControllerRef.current = null;
          }
        }
      });
  }, [orgId, staffId, fetchOrgOperatorData, clearPollTimer]);

  const refreshQueues = useCallback(async () => {
    if (!orgId || !staffId || isRefreshingQueues) return;
    const currentOrg = orgId;
    const currentStaff = staffId;

    // Abort in-flight background poll and clear timer while manual refresh is running
    clearPollTimer();
    backgroundPollAbortControllerRef.current?.abort();
    backgroundPollAbortControllerRef.current = null;

    queueRefreshAbortControllerRef.current?.abort();
    const controller = new AbortController();
    queueRefreshAbortControllerRef.current = controller;

    setIsRefreshingQueues(true);
    isRefreshingQueuesRef.current = true;
    setQueuesError(null);
    const refreshSeq = ++queueUpdateSeqRef.current;

    try {
      const queues = await fetchQueueStatusesOnly(
        currentOrg,
        currentStaff,
        controller.signal,
      );
      if (
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff &&
        queueRefreshAbortControllerRef.current === controller &&
        refreshSeq >= lastAppliedQueueSeqRef.current &&
        queues !== null
      ) {
        lastAppliedQueueSeqRef.current = refreshSeq;
        setAssignedQueues(queues);
      }
    } catch (err: unknown) {
      if (
        controller.signal.aborted ||
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
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff &&
        queueRefreshAbortControllerRef.current === controller
      ) {
        setQueuesError(
          "Unable to refresh queue status at this time. Please try again.",
        );
      }
    } finally {
      if (
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff &&
        queueRefreshAbortControllerRef.current === controller
      ) {
        setIsRefreshingQueues(false);
        isRefreshingQueuesRef.current = false;
        queueRefreshAbortControllerRef.current = null;

        // Resume background polling cadence after manual refresh completes
        if (
          typeof document === "undefined" ||
          document.visibilityState === "visible"
        ) {
          schedulePollRef.current?.();
        }
      }
    }
  }, [orgId, staffId, isRefreshingQueues, fetchQueueStatusesOnly, clearPollTimer]);

  const fetchQueueStatuses = useCallback(
    async (
      arg1?: string | AbortSignal,
      arg2?: string,
      arg3?: AbortSignal,
    ): Promise<OperatorQueueItem[] | null> => {
      let targetOrgId = orgIdRef.current;
      let targetStaffId = staffIdRef.current;
      let targetSignal: AbortSignal | undefined;

      if (typeof arg1 === "string") {
        targetOrgId = arg1;
        targetStaffId = arg2 ?? staffIdRef.current;
        targetSignal = arg3;
      } else if (arg1 instanceof AbortSignal) {
        targetSignal = arg1;
      }

      if (!targetOrgId || !targetStaffId) return null;
      return fetchQueueStatusesOnly(targetOrgId, targetStaffId, targetSignal);
    },
    [fetchQueueStatusesOnly],
  );

  const recoverActiveTicket = useCallback(
    async (
      arg1?: string | AbortSignal,
      arg2?: string,
      arg3?: AbortSignal,
    ): Promise<ActiveTicket | null> => {
      let targetOrgId = orgIdRef.current;
      let targetStaffId = staffIdRef.current;
      let targetSignal: AbortSignal | undefined;

      if (typeof arg1 === "string") {
        targetOrgId = arg1;
        targetStaffId = arg2 ?? staffIdRef.current;
        targetSignal = arg3;
      } else if (arg1 instanceof AbortSignal) {
        targetSignal = arg1;
      }

      if (!targetOrgId || !targetStaffId) return null;
      return fetchActiveTicketRecovery(targetOrgId, targetStaffId, targetSignal);
    },
    [fetchActiveTicketRecovery],
  );

  return {
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
    setAssignedQueues: setAssignedQueuesExternal,
    retryOrgData,
    refreshQueues,
    fetchQueueStatuses,
    recoverActiveTicket,
    resetOrgData,
  };
}
