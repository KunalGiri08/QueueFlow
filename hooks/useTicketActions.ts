"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  ActiveTicket,
  ActiveTicketAction,
} from "@/components/staff/StaffActiveTicketCard";
import type { OperatorQueueItem } from "@/components/staff/StaffAssignedQueues";
import type { AssignedCounterItem } from "@/components/staff/StaffCounterSelector";

export function isValidCalledTicketResponse(data: unknown): data is {
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

export interface UseTicketActionsOptions {
  /** Currently selected organization ID */
  orgId: string | null;
  /** Authenticated operator staff user ID */
  staffId: string | null;
  /** Currently selected counter ID */
  selectedCounterId: string | null;
  /** Assigned counters for current organization */
  assignedCounters: AssignedCounterItem[];
  /** Currently active ticket, if any */
  activeTicket: ActiveTicket | null;
  /** State setter for active ticket (from useStaffOrgData) */
  setActiveTicket: React.Dispatch<React.SetStateAction<ActiveTicket | null>>;
  /** State setter for assigned queues (from useStaffOrgData) */
  setAssignedQueues: React.Dispatch<React.SetStateAction<OperatorQueueItem[]>>;
  /** State setter for counter warning (from useStaffOrgData) */
  setCounterWarning: (warning: string | null) => void;
  /** State setter for selected counter ID (from useStaffOrgData) */
  setSelectedCounterId: (counterId: string | null) => void;
  /** Function to fetch fresh queue metrics (from useStaffOrgData) */
  fetchQueueStatuses: (
    overrideOrgId?: string,
    overrideStaffId?: string,
    signal?: AbortSignal,
  ) => Promise<OperatorQueueItem[] | null>;
  /** Function to recover active ticket on 409 conflict (from useStaffOrgData) */
  recoverActiveTicket: (
    overrideOrgId?: string,
    overrideStaffId?: string,
    signal?: AbortSignal,
  ) => Promise<ActiveTicket | null>;
  /** Optional custom sign-in redirect URL for 401 responses */
  signInRedirectUrl?: string;
  /** Optional confirm dialog provider (defaults to window.confirm) */
  confirmDialog?: (message: string) => boolean;
}

export interface UseTicketActionsReturn {
  // In-Flight Status
  callingQueueId: string | null;
  activeTicketAction: ActiveTicketAction | null;
  isActionDisabled: boolean;

  // Errors & Dismissals
  callActionError: string | null;
  ticketActionError: string | null;
  dismissCallError: () => void;
  dismissTicketActionError: () => void;
  resetTicketActions: () => void;

  // Mutation Handlers
  callNext: (queue: OperatorQueueItem) => Promise<void>;
  startService: () => Promise<void>;
  completeService: () => Promise<void>;
  skipTicket: () => Promise<void>;

  // Readiness Predicate
  canCallNext: (queue: OperatorQueueItem) => boolean;
}

export function useTicketActions(
  options: UseTicketActionsOptions,
): UseTicketActionsReturn {
  const router = useRouter();
  const {
    orgId,
    staffId,
    selectedCounterId,
    assignedCounters,
    activeTicket,
    setActiveTicket,
    setAssignedQueues,
    setCounterWarning,
    setSelectedCounterId,
    fetchQueueStatuses,
    recoverActiveTicket,
  } = options;

  const [callingQueueId, setCallingQueueId] = useState<string | null>(null);
  const [callActionError, setCallActionError] = useState<string | null>(null);
  const [activeTicketAction, setActiveTicketAction] = useState<ActiveTicketAction | null>(null);
  const [ticketActionError, setTicketActionError] = useState<string | null>(null);

  // Identity refs for stale-response protection in async callbacks
  const orgIdRef = useRef<string | null>(orgId);
  const staffIdRef = useRef<string | null>(staffId);

  // Mutation generation counter for strict stale-response protection
  const mutationGenerationRef = useRef<number>(0);

  // Synchronously reset mutation errors and in-flight flags when identity changes
  const [prevIdentity, setPrevIdentity] = useState({ orgId, staffId });
  if (prevIdentity.orgId !== orgId || prevIdentity.staffId !== staffId) {
    setPrevIdentity({ orgId, staffId });
    setCallingQueueId(null);
    setActiveTicketAction(null);
    setCallActionError(null);
    setTicketActionError(null);
  }

  useEffect(() => {
    if (orgIdRef.current !== orgId || staffIdRef.current !== staffId) {
      orgIdRef.current = orgId;
      staffIdRef.current = staffId;
      mutationGenerationRef.current++;
    }
  }, [orgId, staffId]);

  const redirectUrl =
    options.signInRedirectUrl ??
    `/sign-in?redirect_url=${encodeURIComponent("/staff")}`;

  const resetTicketActions = useCallback(() => {
    mutationGenerationRef.current++;
    setCallingQueueId(null);
    setActiveTicketAction(null);
    setCallActionError(null);
    setTicketActionError(null);
  }, []);

  const dismissCallError = useCallback(() => {
    setCallActionError(null);
  }, []);

  const dismissTicketActionError = useCallback(() => {
    setTicketActionError(null);
  }, []);

  const selectedCounterItem = useMemo(() => {
    return assignedCounters.find((a) => a.counter.id === selectedCounterId);
  }, [assignedCounters, selectedCounterId]);

  const hasActiveCounterSelected = Boolean(
    selectedCounterItem && selectedCounterItem.counter.isActive,
  );

  const canCallNext = useCallback(
    (q: OperatorQueueItem) => {
      return (
        hasActiveCounterSelected &&
        activeTicket === null &&
        q.waitingCount > 0 &&
        callingQueueId === null &&
        activeTicketAction === null
      );
    },
    [hasActiveCounterSelected, activeTicket, callingQueueId, activeTicketAction],
  );

  const callNext = useCallback(
    async (queue: OperatorQueueItem) => {
      if (
        !orgId ||
        !staffId ||
        !selectedCounterId ||
        callingQueueId !== null ||
        activeTicket !== null ||
        queue.waitingCount <= 0
      ) {
        return;
      }

      const activeAssignedCounter = assignedCounters.find(
        (a) => a.counter.id === selectedCounterId && a.counter.isActive,
      );
      if (!activeAssignedCounter) {
        setCallActionError(
          "Please select an active assigned counter before calling a ticket.",
        );
        return;
      }

      const currentMutationGen = ++mutationGenerationRef.current;
      const currentOrg = orgId;
      const currentStaff = staffId;

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
          router.push(redirectUrl);
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

          if (
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff
          ) {
            setCallActionError(conflictMsg);
          }

          // Recover active ticket state and refresh queue counts
          try {
            const recoveredTicket = await recoverActiveTicket(
              currentOrg,
              currentStaff,
            );
            if (
              currentMutationGen === mutationGenerationRef.current &&
              orgIdRef.current === currentOrg &&
              staffIdRef.current === currentStaff
            ) {
              setActiveTicket(recoveredTicket);
              if (recoveredTicket && recoveredTicket.counterId) {
                const matching = assignedCounters.find(
                  (a) => a.counter.id === recoveredTicket.counterId,
                );
                if (matching && matching.counter.isActive) {
                  setSelectedCounterId(matching.counter.id);
                  setCounterWarning(null);
                } else if (!matching) {
                  const cName =
                    recoveredTicket.counter?.name || recoveredTicket.counterId;
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
              currentMutationGen === mutationGenerationRef.current &&
              orgIdRef.current === currentOrg &&
              staffIdRef.current === currentStaff &&
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

          if (
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff
          ) {
            setCallActionError(errorMsg);
          }
          return;
        }

        const ticketJson: unknown = await res.json();
        if (!isValidCalledTicketResponse(ticketJson)) {
          throw new Error("Malformed ticket response received from server.");
        }

        if (
          currentMutationGen !== mutationGenerationRef.current ||
          orgIdRef.current !== currentOrg ||
          staffIdRef.current !== currentStaff
        ) {
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
            id: activeAssignedCounter.counter.id,
            name: activeAssignedCounter.counter.name,
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
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff &&
            refreshedQueues !== null
          ) {
            setAssignedQueues(refreshedQueues);
          }
        } catch {
          // Refresh error can be handled quietly or ignored
        }
      } catch (err) {
        if (
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff
        ) {
          const msg =
            err instanceof Error
              ? err.message
              : "Network error. Unable to call next ticket at this time.";
          setCallActionError(msg);
        }
      } finally {
        if (
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff
        ) {
          setCallingQueueId(null);
        }
      }
    },
    [
      orgId,
      staffId,
      selectedCounterId,
      callingQueueId,
      activeTicket,
      assignedCounters,
      recoverActiveTicket,
      fetchQueueStatuses,
      setActiveTicket,
      setCounterWarning,
      setSelectedCounterId,
      setAssignedQueues,
      router,
      redirectUrl,
    ],
  );

  const startService = useCallback(async () => {
    if (
      !activeTicket ||
      activeTicket.status !== "CALLED" ||
      activeTicketAction !== null ||
      callingQueueId !== null ||
      !orgId ||
      !staffId
    ) {
      return;
    }

    const currentMutationGen = ++mutationGenerationRef.current;
    const currentOrg = orgId;
    const currentStaff = staffId;
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
        router.push(redirectUrl);
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

        if (
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff
        ) {
          setTicketActionError(conflictMsg);
        }

        // Recover active ticket state and refresh queue counts
        try {
          const recovered = await recoverActiveTicket(
            currentOrg,
            currentStaff,
          );
          if (
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff
          ) {
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
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff &&
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

        if (
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff
        ) {
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

      if (
        currentMutationGen !== mutationGenerationRef.current ||
        orgIdRef.current !== currentOrg ||
        staffIdRef.current !== currentStaff
      ) {
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
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff &&
          refreshedQueues !== null
        ) {
          setAssignedQueues(refreshedQueues);
        }
      } catch {
        // Ignore
      }
    } catch (err) {
      if (
        currentMutationGen === mutationGenerationRef.current &&
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff
      ) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error. Unable to start service at this time.";
        setTicketActionError(msg);
      }
    } finally {
      if (
        currentMutationGen === mutationGenerationRef.current &&
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff
      ) {
        setActiveTicketAction(null);
      }
    }
  }, [
    activeTicket,
    activeTicketAction,
    callingQueueId,
    orgId,
    staffId,
    router,
    redirectUrl,
    recoverActiveTicket,
    fetchQueueStatuses,
    setActiveTicket,
    setAssignedQueues,
  ]);

  const completeService = useCallback(async () => {
    if (
      !activeTicket ||
      activeTicket.status !== "SERVING" ||
      activeTicketAction !== null ||
      callingQueueId !== null ||
      !orgId ||
      !staffId
    ) {
      return;
    }

    const currentMutationGen = ++mutationGenerationRef.current;
    const currentOrg = orgId;
    const currentStaff = staffId;
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
        router.push(redirectUrl);
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

        if (
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff
        ) {
          setTicketActionError(conflictMsg);
        }

        // Recover active ticket state and refresh queue counts
        try {
          const recovered = await recoverActiveTicket(
            currentOrg,
            currentStaff,
          );
          if (
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff
          ) {
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
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff &&
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

        if (
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff
        ) {
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

      if (
        currentMutationGen !== mutationGenerationRef.current ||
        orgIdRef.current !== currentOrg ||
        staffIdRef.current !== currentStaff
      ) {
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
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff &&
          refreshedQueues !== null
        ) {
          setAssignedQueues(refreshedQueues);
        }
      } catch {
        // Ignore
      }
    } catch (err) {
      if (
        currentMutationGen === mutationGenerationRef.current &&
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff
      ) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error. Unable to complete service at this time.";
        setTicketActionError(msg);
      }
    } finally {
      if (
        currentMutationGen === mutationGenerationRef.current &&
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff
      ) {
        setActiveTicketAction(null);
      }
    }
  }, [
    activeTicket,
    activeTicketAction,
    callingQueueId,
    orgId,
    staffId,
    router,
    redirectUrl,
    recoverActiveTicket,
    fetchQueueStatuses,
    setActiveTicket,
    setCounterWarning,
    setAssignedQueues,
  ]);

  const skipTicket = useCallback(async () => {
    if (
      !activeTicket ||
      (activeTicket.status !== "CALLED" && activeTicket.status !== "SERVING") ||
      activeTicketAction !== null ||
      callingQueueId !== null ||
      !orgId ||
      !staffId
    ) {
      return;
    }

    const confirmFn =
      options.confirmDialog ??
      (typeof window !== "undefined"
        ? window.confirm.bind(window)
        : () => true);

    const confirmed = confirmFn(
      `Are you sure you want to skip ticket #${activeTicket.number}? The ticket will leave the active queue and will no longer be served.`,
    );
    if (!confirmed) {
      return;
    }

    const currentMutationGen = ++mutationGenerationRef.current;
    const currentOrg = orgId;
    const currentStaff = staffId;
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
        router.push(redirectUrl);
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

        if (
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff
        ) {
          setTicketActionError(conflictMsg);
        }

        // Recover active ticket state and refresh queue counts
        try {
          const recovered = await recoverActiveTicket(
            currentOrg,
            currentStaff,
          );
          if (
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff
          ) {
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
            currentMutationGen === mutationGenerationRef.current &&
            orgIdRef.current === currentOrg &&
            staffIdRef.current === currentStaff &&
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

        if (
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff
        ) {
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

      if (
        currentMutationGen !== mutationGenerationRef.current ||
        orgIdRef.current !== currentOrg ||
        staffIdRef.current !== currentStaff
      ) {
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
          currentMutationGen === mutationGenerationRef.current &&
          orgIdRef.current === currentOrg &&
          staffIdRef.current === currentStaff &&
          refreshedQueues !== null
        ) {
          setAssignedQueues(refreshedQueues);
        }
      } catch {
        // Ignore
      }
    } catch (err) {
      if (
        currentMutationGen === mutationGenerationRef.current &&
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff
      ) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error. Unable to skip ticket at this time.";
        setTicketActionError(msg);
      }
    } finally {
      if (
        currentMutationGen === mutationGenerationRef.current &&
        orgIdRef.current === currentOrg &&
        staffIdRef.current === currentStaff
      ) {
        setActiveTicketAction(null);
      }
    }
  }, [
    activeTicket,
    activeTicketAction,
    callingQueueId,
    orgId,
    staffId,
    options.confirmDialog,
    router,
    redirectUrl,
    recoverActiveTicket,
    fetchQueueStatuses,
    setActiveTicket,
    setCounterWarning,
    setAssignedQueues,
  ]);

  return {
    callingQueueId,
    activeTicketAction,
    isActionDisabled: callingQueueId !== null,
    callActionError,
    ticketActionError,
    dismissCallError,
    dismissTicketActionError,
    resetTicketActions,
    callNext,
    startService,
    completeService,
    skipTicket,
    canCallNext,
  };
}
