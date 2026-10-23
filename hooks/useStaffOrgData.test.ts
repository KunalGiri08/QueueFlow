// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import {
  useStaffOrgData,
  type UseStaffOrgDataReturn,
  type UseStaffOrgDataOptions,
} from "./useStaffOrgData";

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
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "visible",
    });
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
    cleanup();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "visible",
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  describe("9. Visibility-Aware Background Queue Polling Lifecycle", () => {
    it("automatically refreshes queue metrics after 10-second polling interval", async () => {
      vi.useFakeTimers();

      let queuePollCount = 0;
      activeFetchHandler = (url) => {
        if (url === "/api/queues/queue-1") {
          queuePollCount++;
          return jsonResponse({
            id: "queue-1",
            waitingCount: queuePollCount === 1 ? 3 : 5,
            currentlyServing: null,
          });
        }
        return defaultFetchHandler(url);
      };

      let hook!: ReturnType<
        typeof renderHook<UseStaffOrgDataReturn, UseStaffOrgDataOptions>
      >;
      await act(async () => {
        hook = renderHook(() =>
          useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
        );
      });

      expect(hook.result.current.isOrgDataLoading).toBe(false);
      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(3);
      expect(queuePollCount).toBe(1);

      // Advance by 10s to trigger background poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(queuePollCount).toBe(2);
      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(5);

      // Advance another 10s to verify repeated cadence
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(queuePollCount).toBe(3);
    });

    it("does not poll without valid organization and staff context", async () => {
      vi.useFakeTimers();

      let fetchCount = 0;
      activeFetchHandler = (url) => {
        fetchCount++;
        return defaultFetchHandler(url);
      };

      await act(async () => {
        renderHook(() =>
          useStaffOrgData({ orgId: null, staffId: null }),
        );
      });

      expect(fetchCount).toBe(0);
      expect(vi.getTimerCount()).toBe(0);

      // Advance time by 30 seconds
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      expect(fetchCount).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("does not poll when initial load results in orgDataError", async () => {
      vi.useFakeTimers();

      let fetchCount = 0;
      activeFetchHandler = (url) => {
        fetchCount++;
        if (url.includes("/counters")) {
          return jsonResponse({ error: "Failed" }, 500);
        }
        return defaultFetchHandler(url);
      };

      let hook!: ReturnType<
        typeof renderHook<UseStaffOrgDataReturn, UseStaffOrgDataOptions>
      >;
      await act(async () => {
        hook = renderHook(() =>
          useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
        );
      });

      expect(hook.result.current.orgDataError).not.toBeNull();
      const callsBefore = fetchCount;

      // Advance time by 30 seconds
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      // No background polling occurred
      expect(fetchCount).toBe(callsBefore);
    });

    it("pauses polling while document visibility is hidden", async () => {
      vi.useFakeTimers();

      let queueFetchCount = 0;
      activeFetchHandler = (url) => {
        if (url === "/api/queues/queue-1") {
          queueFetchCount++;
        }
        return defaultFetchHandler(url);
      };

      await act(async () => {
        renderHook(() =>
          useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
        );
      });

      expect(queueFetchCount).toBe(1);

      // Tab hidden
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(vi.getTimerCount()).toBe(0);

      // Advance by 30 seconds while hidden
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      // No additional queue fetch occurred
      expect(queueFetchCount).toBe(1);
    });

    it("immediately refreshes queue metrics when tab becomes visible and resumes 10s cadence", async () => {
      vi.useFakeTimers();

      let queueFetchCount = 0;
      activeFetchHandler = (url) => {
        if (url === "/api/queues/queue-1") {
          queueFetchCount++;
          return jsonResponse({
            id: "queue-1",
            waitingCount: queueFetchCount === 1 ? 3 : 9,
            currentlyServing: null,
          });
        }
        return defaultFetchHandler(url);
      };

      let hook!: ReturnType<
        typeof renderHook<UseStaffOrgDataReturn, UseStaffOrgDataOptions>
      >;
      await act(async () => {
        hook = renderHook(() =>
          useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
        );
      });

      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(3);

      // Hide tab
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Advance 20s while hidden
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });

      expect(queueFetchCount).toBe(1);

      // Make tab visible
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Immediate refresh happened
      expect(queueFetchCount).toBe(2);
      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(9);

      // Verify 10-second cadence resumed
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(queueFetchCount).toBe(3);
    });

    it("cleans up timers and visibility event listener on unmount", async () => {
      vi.useFakeTimers();

      let hook!: ReturnType<
        typeof renderHook<UseStaffOrgDataReturn, UseStaffOrgDataOptions>
      >;
      await act(async () => {
        hook = renderHook(() =>
          useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
        );
      });

      expect(vi.getTimerCount()).toBe(1);

      act(() => {
        hook.unmount();
      });

      expect(vi.getTimerCount()).toBe(0);

      // Dispatching visibility change after unmount does not trigger calls or throw
      const callsBefore = fetchMock.mock.calls.length;
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fetchMock.mock.calls.length).toBe(callsBefore);
    });

    it("prevents stale background responses from previous organization from overwriting new organization state", async () => {
      vi.useFakeTimers();

      let resolveSlowOrg1Queues!: (res: Response) => void;
      let org1PollAttempt = 0;

      activeFetchHandler = (url) => {
        if (url === "/api/organizations/org-1/staff/user-staff-1/queues") {
          org1PollAttempt++;
          if (org1PollAttempt > 1) {
            // Slow poll response
            return new Promise((resolve) => {
              resolveSlowOrg1Queues = resolve;
            });
          }
        }
        return defaultFetchHandler(url);
      };

      let hook!: ReturnType<
        typeof renderHook<
          UseStaffOrgDataReturn,
          { orgId: string; staffId: string }
        >
      >;
      await act(async () => {
        hook = renderHook(
          (props: { orgId: string; staffId: string }) =>
            useStaffOrgData(props),
          {
            initialProps: { orgId: "org-1", staffId: "user-staff-1" },
          },
        );
      });

      expect(hook.result.current.assignedQueues[0].id).toBe("queue-1");

      // Advance by 10s to trigger background poll for org-1
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // While org-1 poll is pending, switch to org-2
      await act(async () => {
        hook.rerender({ orgId: "org-2", staffId: "user-staff-1" });
      });

      expect(hook.result.current.assignedQueues[0].id).toBe("queue-2");

      // Now resolve the stale org-1 poll
      await act(async () => {
        resolveSlowOrg1Queues(
          jsonResponse([
            {
              id: "queue-1-stale",
              name: "Stale Queue Org 1",
              isActive: true,
              service: { id: "service-1", name: "Check-in" },
            },
          ]),
        );
      });

      // org-2 data must NOT be overwritten
      expect(hook.result.current.assignedQueues[0].id).toBe("queue-2");
    });

    it("preserves existing queue data and avoids disruptive errors when background polling request fails", async () => {
      vi.useFakeTimers();

      let failPoll = false;
      activeFetchHandler = (url) => {
        if (url === "/api/queues/queue-1" && failPoll) {
          return jsonResponse({ error: "Temporary outage" }, 500);
        }
        return defaultFetchHandler(url);
      };

      let hook!: ReturnType<
        typeof renderHook<UseStaffOrgDataReturn, UseStaffOrgDataOptions>
      >;
      await act(async () => {
        hook = renderHook(() =>
          useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
        );
      });

      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(3);
      expect(hook.result.current.queuesError).toBeNull();

      // Trigger failing background poll
      failPoll = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // State is preserved and NO error message is shown
      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(3);
      expect(hook.result.current.queuesError).toBeNull();
      expect(hook.result.current.orgDataError).toBeNull();
      expect(hook.result.current.isRefreshingQueues).toBe(false);

      // Recover on subsequent poll
      failPoll = false;
      activeFetchHandler = (url) => {
        if (url === "/api/queues/queue-1") {
          return jsonResponse({
            id: "queue-1",
            waitingCount: 4,
            currentlyServing: null,
          });
        }
        return defaultFetchHandler(url);
      };

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(4);
    });

    it("does not overwrite newer state from local actions with older background poll responses", async () => {
      vi.useFakeTimers();

      let resolveSlowPoll!: (res: Response) => void;
      let pollCallCount = 0;

      activeFetchHandler = (url) => {
        if (url === "/api/organizations/org-1/staff/user-staff-1/queues") {
          pollCallCount++;
          if (pollCallCount > 1) {
            return new Promise((resolve) => {
              resolveSlowPoll = resolve;
            });
          }
        }
        return defaultFetchHandler(url);
      };

      let hook!: ReturnType<
        typeof renderHook<UseStaffOrgDataReturn, UseStaffOrgDataOptions>
      >;
      await act(async () => {
        hook = renderHook(() =>
          useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
        );
      });

      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(3);

      // Advance by 10s to start background poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Local ticket mutation updates assigned queues while background poll is pending
      act(() => {
        hook.result.current.setAssignedQueues([
          {
            id: "queue-1",
            name: "General Line",
            isActive: true,
            service: { id: "service-1", name: "Check-in" },
            waitingCount: 1,
            currentlyServing: 101,
          },
        ]);
      });

      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(1);

      // Now resolve the older slow poll
      await act(async () => {
        resolveSlowPoll(jsonResponse([mockQueueOrg1]));
      });

      // Older background poll response did NOT overwrite local update
      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(1);
      expect(hook.result.current.assignedQueues[0].currentlyServing).toBe(101);
    });

    it("resets background polling cadence when manual refresh completes", async () => {
      vi.useFakeTimers();

      let queueStatusCalls = 0;
      activeFetchHandler = (url) => {
        if (url === "/api/queues/queue-1") {
          queueStatusCalls++;
          return jsonResponse({
            id: "queue-1",
            waitingCount: queueStatusCalls === 1 ? 3 : queueStatusCalls === 2 ? 6 : 8,
            currentlyServing: null,
          });
        }
        return defaultFetchHandler(url);
      };

      let hook!: ReturnType<
        typeof renderHook<UseStaffOrgDataReturn, UseStaffOrgDataOptions>
      >;
      await act(async () => {
        hook = renderHook(() =>
          useStaffOrgData({ orgId: "org-1", staffId: "user-staff-1" }),
        );
      });

      expect(queueStatusCalls).toBe(1);
      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(3);

      // Advance 6s
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });

      expect(queueStatusCalls).toBe(1);

      // User performs manual refresh at 6s
      await act(async () => {
        await hook.result.current.refreshQueues();
      });

      expect(queueStatusCalls).toBe(2);
      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(6);

      // Advance 4s (at t=10s from initial load) - no poll should fire because cadence reset
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(queueStatusCalls).toBe(2);

      // Advance 6 more seconds (10s after manual refresh finished)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(queueStatusCalls).toBe(3);
      expect(hook.result.current.assignedQueues[0].waitingCount).toBe(8);
    });
  });
});
