// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useStaffOrgData } from "./useStaffOrgData";

// 1. Mock Next.js navigation with a stable router object identity
const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// Shared test data
const mockCounterOrg1 = {
  id: "assign-1",
  staffId: "user-staff-1",
  counter: {
    id: "counter-1",
    name: "Desk 1",
    isActive: true,
    organizationId: "org-1",
  },
};

const mockInactiveCounterOrg1 = {
  id: "assign-inactive-1",
  staffId: "user-staff-1",
  counter: {
    id: "counter-inactive-1",
    name: "Desk Inactive",
    isActive: false,
    organizationId: "org-1",
  },
};

const mockQueueOrg1 = {
  id: "queue-1",
  name: "General Line",
  isActive: true,
  service: {
    id: "service-1",
    name: "Check-in",
  },
};

const mockQueueOrg2 = {
  id: "queue-2",
  name: "Triage Line",
  isActive: true,
  service: {
    id: "service-2",
    name: "Triage",
  },
};

const mockActiveTicket = {
  id: "ticket-101",
  number: 101,
  status: "CALLED",
  queueId: "queue-1",
  counterId: "counter-1",
  createdAt: "2026-10-19T10:00:00.000Z",
  updatedAt: "2026-10-19T10:00:00.000Z",
  queue: { id: "queue-1", name: "General Line" },
  service: { id: "service-1", name: "Check-in" },
  counter: { id: "counter-1", name: "Desk 1" },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("hooks/useStaffOrgData", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let activeFetchHandler: (
    url: string,
    init?: RequestInit,
  ) => Promise<Response> | Response;

  function defaultFetchHandler(url: string): Response {
    if (url === "/api/organizations/org-1/staff/user-staff-1/counters") {
      return jsonResponse([mockCounterOrg1]);
    }
    if (url === "/api/organizations/org-1/staff/user-staff-1/active-ticket") {
      return jsonResponse({ ticket: null });
    }
    if (url === "/api/organizations/org-1/staff/user-staff-1/queues") {
      return jsonResponse([mockQueueOrg1]);
    }
    if (url === "/api/queues/queue-1") {
      return jsonResponse({
        id: "queue-1",
        waitingCount: 3,
        currentlyServing: null,
      });
    }

    if (url === "/api/organizations/org-2/staff/user-staff-1/counters") {
      return jsonResponse([
        {
          id: "assign-2",
          staffId: "user-staff-1",
          counter: {
            id: "counter-2",
            name: "Desk 2",
            isActive: true,
            organizationId: "org-2",
          },
        },
      ]);
    }
    if (url === "/api/organizations/org-2/staff/user-staff-1/active-ticket") {
      return jsonResponse({ ticket: null });
    }
    if (url === "/api/organizations/org-2/staff/user-staff-1/queues") {
      return jsonResponse([mockQueueOrg2]);
    }
    if (url === "/api/queues/queue-2") {
      return jsonResponse({
        id: "queue-2",
        waitingCount: 1,
        currentlyServing: null,
      });
    }

    return jsonResponse({ error: "Not found" }, 404);
  }

  beforeEach(() => {
    mockPush.mockReset();
    activeFetchHandler = (url) => defaultFetchHandler(url);
    fetchMock = vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        return activeFetchHandler(url, init);
      });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. Identity & Missing Props Guarding", () => {
    it("does not issue requests or remain stuck in loading state when orgId or staffId is null", () => {
      const { result, rerender } = renderHook(
        (props: { orgId: string | null; staffId: string | null }) =>
          useStaffOrgData(props),
        {
          initialProps: { orgId: null, staffId: null } as {
            orgId: string | null;
            staffId: string | null;
          },
        },
      );

      expect(result.current.isOrgDataLoading).toBe(false);
      expect(result.current.assignedCounters).toEqual([]);
      expect(result.current.assignedQueues).toEqual([]);
      expect(result.current.activeTicket).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();

      // Only staffId provided
      rerender({ orgId: null, staffId: "user-staff-1" });
      expect(result.current.isOrgDataLoading).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();

      // Only orgId provided
      rerender({ orgId: "org-1", staffId: null });
      expect(result.current.isOrgDataLoading).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("2. Successful Parallel Initial Load & Counter Selection", () => {
    it("loads counters, active ticket, and queues in parallel, defaulting to the first active counter", async () => {
      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.assignedCounters).toEqual([mockCounterOrg1]);
      expect(result.current.selectedCounterId).toBe("counter-1");
      expect(result.current.activeTicket).toBeNull();
      expect(result.current.counterWarning).toBeNull();
      expect(result.current.assignedQueues).toEqual([
        {
          id: "queue-1",
          name: "General Line",
          isActive: true,
          service: { id: "service-1", name: "Check-in" },
          waitingCount: 3,
          currentlyServing: null,
        },
      ]);
      expect(result.current.orgDataError).toBeNull();
    });

    it("matches active ticket counter and clears warnings when active ticket counter is assigned and active", async () => {
      activeFetchHandler = (url) => {
        if (
          url === "/api/organizations/org-1/staff/user-staff-1/active-ticket"
        ) {
          return jsonResponse({ ticket: mockActiveTicket });
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.activeTicket).toEqual(mockActiveTicket);
      expect(result.current.selectedCounterId).toBe("counter-1");
      expect(result.current.counterWarning).toBeNull();
    });

    it("displays an unassigned-counter warning when active ticket counter is not assigned to staff", async () => {
      const ticketWithUnassignedCounter = {
        ...mockActiveTicket,
        counterId: "counter-99",
        counter: { id: "counter-99", name: "Desk 99" },
      };

      activeFetchHandler = (url) => {
        if (
          url === "/api/organizations/org-1/staff/user-staff-1/active-ticket"
        ) {
          return jsonResponse({ ticket: ticketWithUnassignedCounter });
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.counterWarning).toBe(
        'This active ticket is tied to Counter "Desk 99", which is no longer assigned to your account in this organization.',
      );
      expect(result.current.selectedCounterId).toBeNull();
    });

    it("displays an inactive-counter warning when active ticket counter is assigned but inactive", async () => {
      const ticketWithInactiveCounter = {
        ...mockActiveTicket,
        counterId: "counter-inactive-1",
        counter: { id: "counter-inactive-1", name: "Desk Inactive" },
      };

      activeFetchHandler = (url) => {
        if (url === "/api/organizations/org-1/staff/user-staff-1/counters") {
          return jsonResponse([mockInactiveCounterOrg1]);
        }
        if (
          url === "/api/organizations/org-1/staff/user-staff-1/active-ticket"
        ) {
          return jsonResponse({ ticket: ticketWithInactiveCounter });
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.counterWarning).toBe(
        'This active ticket is tied to Counter "Desk Inactive", which is currently inactive.',
      );
      expect(result.current.selectedCounterId).toBeNull();
    });
  });

  describe("3. 401 Unauthorized Handling & Redirects", () => {
    it("redirects to sign-in if counters endpoint returns 401", async () => {
      activeFetchHandler = (url) => {
        if (url === "/api/organizations/org-1/staff/user-staff-1/counters") {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        return defaultFetchHandler(url);
      };

      renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fstaff");
      });
    });

    it("redirects to sign-in if queues endpoint returns 401", async () => {
      activeFetchHandler = (url) => {
        if (url === "/api/organizations/org-1/staff/user-staff-1/queues") {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        return defaultFetchHandler(url);
      };

      renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fstaff");
      });
    });
  });

  describe("4. Error Handling & Retry Lifecycle", () => {
    it("sets orgDataError when initial fetch fails, and recovers on retryOrgData", async () => {
      let failCounters = true;
      activeFetchHandler = (url) => {
        if (
          url === "/api/organizations/org-1/staff/user-staff-1/counters" &&
          failCounters
        ) {
          return jsonResponse({ error: "Internal error" }, 500);
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.orgDataError).toBe(
        "Unable to load assigned counters, active ticket, and queues for this organization. Please try again.",
      );
      expect(result.current.assignedCounters).toEqual([]);

      // Fix endpoint and retry
      failCounters = false;
      act(() => {
        result.current.retryOrgData();
      });

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.orgDataError).toBeNull();
      expect(result.current.assignedCounters).toEqual([mockCounterOrg1]);
      expect(result.current.selectedCounterId).toBe("counter-1");
    });
  });

  describe("5. Independent Manual Queue Refresh", () => {
    it("refreshes queues without reloading counters or active ticket", async () => {
      let queueStatusCallCount = 0;
      let countersCallCount = 0;

      activeFetchHandler = (url) => {
        if (url === "/api/organizations/org-1/staff/user-staff-1/counters") {
          countersCallCount++;
          return jsonResponse([mockCounterOrg1]);
        }
        if (url === "/api/queues/queue-1") {
          queueStatusCallCount++;
          return jsonResponse({
            id: "queue-1",
            waitingCount: queueStatusCallCount > 1 ? 7 : 3,
            currentlyServing: null,
          });
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.assignedQueues[0].waitingCount).toBe(3);
      expect(countersCallCount).toBe(1);

      // Trigger manual refresh
      await act(async () => {
        await result.current.refreshQueues();
      });

      // Counters should NOT have been re-fetched
      expect(countersCallCount).toBe(1);
      // Queues updated with new waiting count
      expect(result.current.assignedQueues[0].waitingCount).toBe(7);
      expect(result.current.isRefreshingQueues).toBe(false);
      expect(result.current.queuesError).toBeNull();
    });

    it("sets queuesError when manual queue refresh fails and preserves existing counters and active ticket", async () => {
      let failRefresh = false;
      activeFetchHandler = (url) => {
        if (url === "/api/queues/queue-1" && failRefresh) {
          return jsonResponse({ error: "Server error" }, 500);
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      failRefresh = true;
      await act(async () => {
        await result.current.refreshQueues();
      });

      expect(result.current.queuesError).toBe(
        "Unable to refresh queue status at this time. Please try again.",
      );
      // Existing data is untouched
      expect(result.current.assignedCounters).toEqual([mockCounterOrg1]);
      expect(result.current.isRefreshingQueues).toBe(false);
    });
  });

  describe("6. Organization Switch & Tenant Isolation", () => {
    it("switches organizations, aborts old in-flight requests, and clears old data immediately", async () => {
      const org1Signals: AbortSignal[] = [];
      const org2Signals: AbortSignal[] = [];

      activeFetchHandler = (url, init) => {
        if (url.includes("/org-1/")) {
          if (init?.signal) org1Signals.push(init.signal);
        }
        if (url.includes("/org-2/")) {
          if (init?.signal) org2Signals.push(init.signal);
        }
        return defaultFetchHandler(url);
      };

      const { result, rerender } = renderHook(
        (props: { orgId: string; staffId: string }) => useStaffOrgData(props),
        {
          initialProps: { orgId: "org-1", staffId: "user-staff-1" },
        },
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.assignedCounters[0].counter.id).toBe("counter-1");
      expect(result.current.assignedQueues[0].id).toBe("queue-1");

      // Switch to Org 2
      rerender({ orgId: "org-2", staffId: "user-staff-1" });

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      // Old Org 1 signals were aborted
      expect(org1Signals.length).toBeGreaterThan(0);
      expect(org1Signals.every((s) => s.aborted)).toBe(true);

      // New Org 2 data loaded cleanly
      expect(result.current.assignedCounters[0].counter.id).toBe("counter-2");
      expect(result.current.assignedQueues[0].id).toBe("queue-2");
    });

    it("resets all operational state synchronously when resetOrgData is called", async () => {
      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      expect(result.current.assignedCounters.length).toBe(1);

      act(() => {
        result.current.resetOrgData();
      });

      expect(result.current.assignedCounters).toEqual([]);
      expect(result.current.selectedCounterId).toBeNull();
      expect(result.current.activeTicket).toBeNull();
      expect(result.current.counterWarning).toBeNull();
      expect(result.current.assignedQueues).toEqual([]);
      expect(result.current.isOrgDataLoading).toBe(false);
    });
  });

  describe("7. Stale Response & Unmount Safety", () => {
    it("aborts active requests on unmount", () => {
      const capturedSignals: AbortSignal[] = [];

      activeFetchHandler = (url, init) => {
        if (init?.signal) {
          capturedSignals.push(init.signal);
        }
        return new Promise(() => {});
      };

      const { unmount } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      expect(capturedSignals.length).toBeGreaterThan(0);
      expect(capturedSignals.every((s) => !s.aborted)).toBe(true);

      unmount();

      expect(capturedSignals.every((s) => s.aborted)).toBe(true);
    });

    it("prevents stale earlier requests from overwriting newer retry state", async () => {
      let resolveFirstCounters!: (res: Response) => void;
      let callCount = 0;

      activeFetchHandler = (url) => {
        if (url === "/api/organizations/org-1/staff/user-staff-1/counters") {
          callCount++;
          if (callCount === 1) {
            return new Promise((resolve) => {
              resolveFirstCounters = resolve;
            });
          }
          // Second call (retry) resolves immediately with updated counter
          return jsonResponse([
            {
              id: "assign-updated",
              staffId: "user-staff-1",
              counter: {
                id: "counter-updated",
                name: "Updated Counter",
                isActive: true,
                organizationId: "org-1",
              },
            },
          ]);
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      // Trigger retry while first call is pending
      act(() => {
        result.current.retryOrgData();
      });

      await waitFor(() => {
        expect(result.current.assignedCounters[0]?.counter.id).toBe(
          "counter-updated",
        );
      });

      // Now resolve the older call 1
      act(() => {
        resolveFirstCounters(jsonResponse([mockCounterOrg1]));
      });

      // State must retain counter-updated and not be overwritten
      expect(result.current.assignedCounters[0]?.counter.id).toBe(
        "counter-updated",
      );
    });
  });

  describe("8. Exposed Primitives for Ticket Mutations", () => {
    it("fetchQueueStatuses returns freshly loaded queue statuses", async () => {
      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      const freshQueues = await result.current.fetchQueueStatuses();
      expect(freshQueues).toBeDefined();
      expect(freshQueues?.[0].id).toBe("queue-1");
      expect(freshQueues?.[0].waitingCount).toBe(3);
    });

    it("recoverActiveTicket recovers active ticket state when called", async () => {
      activeFetchHandler = (url) => {
        if (
          url === "/api/organizations/org-1/staff/user-staff-1/active-ticket"
        ) {
          return jsonResponse({ ticket: mockActiveTicket });
        }
        return defaultFetchHandler(url);
      };

      const { result } = renderHook(() =>
        useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
      );

      await waitFor(() => {
        expect(result.current.isOrgDataLoading).toBe(false);
      });

      const recovered = await result.current.recoverActiveTicket();
      expect(recovered).toEqual(mockActiveTicket);
    });
  });
});
