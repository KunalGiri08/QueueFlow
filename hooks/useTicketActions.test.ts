// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTicketActions, type UseTicketActionsOptions } from "./useTicketActions";
import type { ActiveTicket } from "@/components/staff/StaffActiveTicketCard";
import type { OperatorQueueItem } from "@/components/staff/StaffAssignedQueues";
import type { AssignedCounterItem } from "@/components/staff/StaffCounterSelector";

// 1. Mock Next.js navigation router
const mockPush = vi.fn();
const mockRouter = { push: mockPush };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// Shared fixtures
const mockCounterOrg1: AssignedCounterItem = {
  id: "assign-1",
  staffId: "user-staff-1",
  counter: {
    id: "counter-1",
    name: "Desk 1",
    isActive: true,
    organizationId: "org-1",
  },
};

const mockInactiveCounterOrg1: AssignedCounterItem = {
  id: "assign-inactive-1",
  staffId: "user-staff-1",
  counter: {
    id: "counter-inactive-1",
    name: "Desk Inactive",
    isActive: false,
    organizationId: "org-1",
  },
};

const mockQueue1: OperatorQueueItem = {
  id: "queue-1",
  name: "General Line",
  isActive: true,
  service: {
    id: "service-1",
    name: "Check-in",
  },
  waitingCount: 3,
  currentlyServing: null,
};

const mockEmptyQueue: OperatorQueueItem = {
  ...mockQueue1,
  id: "queue-empty",
  waitingCount: 0,
};

const mockActiveCalledTicket: ActiveTicket = {
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

const mockActiveServingTicket: ActiveTicket = {
  ...mockActiveCalledTicket,
  id: "ticket-102",
  number: 102,
  status: "SERVING",
  updatedAt: "2026-10-19T10:05:00.000Z",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("hooks/useTicketActions", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let setActiveTicketMock: Mock<(value: React.SetStateAction<ActiveTicket | null>) => void>;
  let setAssignedQueuesMock: Mock<(value: React.SetStateAction<OperatorQueueItem[]>) => void>;
  let setCounterWarningMock: Mock<(warning: string | null) => void>;
  let setSelectedCounterIdMock: Mock<(counterId: string | null) => void>;
  let fetchQueueStatusesMock: Mock<(
    overrideOrgId?: string,
    overrideStaffId?: string,
    signal?: AbortSignal,
  ) => Promise<OperatorQueueItem[] | null>>;
  let recoverActiveTicketMock: Mock<(
    overrideOrgId?: string,
    overrideStaffId?: string,
    signal?: AbortSignal,
  ) => Promise<ActiveTicket | null>>;
  let confirmDialogMock: Mock<(message: string) => boolean>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    setActiveTicketMock = vi.fn();
    setAssignedQueuesMock = vi.fn();
    setCounterWarningMock = vi.fn();
    setSelectedCounterIdMock = vi.fn();
    fetchQueueStatusesMock = vi.fn().mockResolvedValue([mockQueue1]);
    recoverActiveTicketMock = vi.fn().mockResolvedValue(null);
    confirmDialogMock = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function createTestOptions(
    overrides?: Partial<UseTicketActionsOptions>,
  ): UseTicketActionsOptions {
    return {
      orgId: "org-1",
      staffId: "user-staff-1",
      selectedCounterId: "counter-1",
      assignedCounters: [mockCounterOrg1],
      activeTicket: null,
      setActiveTicket: setActiveTicketMock,
      setAssignedQueues: setAssignedQueuesMock,
      setCounterWarning: setCounterWarningMock,
      setSelectedCounterId: setSelectedCounterIdMock,
      fetchQueueStatuses: fetchQueueStatusesMock,
      recoverActiveTicket: recoverActiveTicketMock,
      confirmDialog: confirmDialogMock,
      ...overrides,
    };
  }

  describe("callNext", () => {
    it("successfully calls next ticket, updates active ticket, clears warning, and refreshes queues", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "ticket-200",
          number: 200,
          status: "CALLED",
          queueId: "queue-1",
          counterId: "counter-1",
          createdAt: "2026-10-20T10:00:00.000Z",
          updatedAt: "2026-10-20T10:00:00.000Z",
        }),
      );

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      expect(result.current.callingQueueId).toBeNull();
      expect(result.current.isActionDisabled).toBe(false);

      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/queues/queue-1/next",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ counterId: "counter-1" }),
        }),
      );

      expect(setActiveTicketMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ticket-200",
          number: 200,
          status: "CALLED",
          queueId: "queue-1",
          counterId: "counter-1",
          counter: { id: "counter-1", name: "Desk 1" },
          queue: { id: "queue-1", name: "General Line" },
          service: { id: "service-1", name: "Check-in" },
        }),
      );
      expect(setCounterWarningMock).toHaveBeenCalledWith(null);
      expect(fetchQueueStatusesMock).toHaveBeenCalledWith("org-1", "user-staff-1");
      expect(setAssignedQueuesMock).toHaveBeenCalledWith([mockQueue1]);
      expect(result.current.callingQueueId).toBeNull();
      expect(result.current.callActionError).toBeNull();
    });

    it("blocks callNext when no active counter is selected", async () => {
      const options = createTestOptions({
        selectedCounterId: "counter-inactive-1",
        assignedCounters: [mockInactiveCounterOrg1],
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.callActionError).toBe(
        "Please select an active assigned counter before calling a ticket.",
      );
      expect(result.current.callingQueueId).toBeNull();
    });

    it("blocks duplicate submission when callNext is already in progress or ticket is active", async () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockReturnValueOnce(deferred.promise);

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      let firstCallPromise: Promise<void>;
      act(() => {
        firstCallPromise = result.current.callNext(mockQueue1);
      });

      expect(result.current.callingQueueId).toBe("queue-1");
      expect(result.current.isActionDisabled).toBe(true);

      // Attempt second call while first is in-flight
      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Resolve first call
      await act(async () => {
        deferred.resolve(
          jsonResponse({
            id: "ticket-201",
            number: 201,
            status: "CALLED",
            queueId: "queue-1",
            counterId: "counter-1",
            createdAt: "2026-10-20T10:00:00.000Z",
            updatedAt: "2026-10-20T10:00:00.000Z",
          }),
        );
        await firstCallPromise!;
      });

      expect(result.current.callingQueueId).toBeNull();
    });

    it("blocks callNext when queue waiting count is zero or ticket is already active", async () => {
      const optionsWithActiveTicket = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result: resWithTicket } = renderHook(() =>
        useTicketActions(optionsWithActiveTicket),
      );

      await act(async () => {
        await resWithTicket.current.callNext(mockQueue1);
      });
      expect(fetchMock).not.toHaveBeenCalled();

      const optionsEmptyQueue = createTestOptions();
      const { result: resEmptyQueue } = renderHook(() =>
        useTicketActions(optionsEmptyQueue),
      );

      await act(async () => {
        await resEmptyQueue.current.callNext(mockEmptyQueue);
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redirects on 401 response during callNext", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/sign-in?redirect_url=%2Fstaff",
      );
      expect(setActiveTicketMock).not.toHaveBeenCalled();
    });

    it("handles 409 conflict: sets error, recovers active ticket, and refreshes queues", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { error: "Another operator called this ticket." },
          409,
        ),
      );

      recoverActiveTicketMock.mockResolvedValueOnce(mockActiveCalledTicket);

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(result.current.callActionError).toBe(
        "Another operator called this ticket.",
      );
      expect(recoverActiveTicketMock).toHaveBeenCalledWith(
        "org-1",
        "user-staff-1",
      );
      expect(setActiveTicketMock).toHaveBeenCalledWith(mockActiveCalledTicket);
      expect(setSelectedCounterIdMock).toHaveBeenCalledWith("counter-1");
      expect(setCounterWarningMock).toHaveBeenCalledWith(null);
      expect(fetchQueueStatusesMock).toHaveBeenCalledWith("org-1", "user-staff-1");
      expect(result.current.callingQueueId).toBeNull();
    });

    it("sets counter warning if recovered ticket counter is unassigned or inactive", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Conflict" }, 409),
      );

      const recoveredTicketWithOtherCounter: ActiveTicket = {
        ...mockActiveCalledTicket,
        counterId: "counter-unknown",
        counter: { id: "counter-unknown", name: "Desk 99" },
      };
      recoverActiveTicketMock.mockResolvedValueOnce(
        recoveredTicketWithOtherCounter,
      );

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(setCounterWarningMock).toHaveBeenCalledWith(
        'This active ticket is tied to Counter "Desk 99", which is no longer assigned to your account in this organization.',
      );
    });

    it("handles 500 server error and network failures during callNext", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Internal database failure" }, 500),
      );

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(result.current.callActionError).toBe("Internal database failure");
      expect(result.current.callingQueueId).toBeNull();

      // Network rejection test
      fetchMock.mockRejectedValueOnce(new Error("Network connection dropped"));
      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(result.current.callActionError).toBe("Network connection dropped");
      expect(result.current.callingQueueId).toBeNull();
    });

    it("handles malformed ticket response schema", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ id: "invalid-shape", number: "not-a-number" }),
      );

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.callNext(mockQueue1);
      });

      expect(result.current.callActionError).toBe(
        "Malformed ticket response received from server.",
      );
      expect(setActiveTicketMock).not.toHaveBeenCalled();
      expect(result.current.callingQueueId).toBeNull();
    });
  });

  describe("startService", () => {
    it("successfully starts service and updates ticket status to SERVING", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "ticket-101",
          number: 101,
          status: "SERVING",
          queueId: "queue-1",
          counterId: "counter-1",
          createdAt: "2026-10-19T10:00:00.000Z",
          updatedAt: "2026-10-19T10:05:00.000Z",
        }),
      );

      const options = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      expect(result.current.activeTicketAction).toBeNull();

      await act(async () => {
        await result.current.startService();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tickets/ticket-101/start",
        expect.objectContaining({ method: "PATCH" }),
      );

      expect(setActiveTicketMock).toHaveBeenCalledWith(expect.any(Function));
      // Test updater callback
      const updater = vi.mocked(setActiveTicketMock).mock.calls[0][0] as (
        prev: ActiveTicket | null,
      ) => ActiveTicket | null;
      const updatedTicket = updater(mockActiveCalledTicket);
      expect(updatedTicket).toEqual({
        ...mockActiveCalledTicket,
        status: "SERVING",
        updatedAt: "2026-10-19T10:05:00.000Z",
      });

      expect(fetchQueueStatusesMock).toHaveBeenCalledWith("org-1", "user-staff-1");
      expect(result.current.activeTicketAction).toBeNull();
      expect(result.current.ticketActionError).toBeNull();
    });

    it("guards startService if active ticket status is not CALLED or already mutating", async () => {
      const optionsServing = createTestOptions({
        activeTicket: mockActiveServingTicket,
      });
      const { result } = renderHook(() => useTicketActions(optionsServing));

      await act(async () => {
        await result.current.startService();
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redirects on 401 response during startService", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

      const options = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.startService();
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/sign-in?redirect_url=%2Fstaff",
      );
    });

    it("handles 409 conflict during startService and recovers active ticket", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Ticket status already updated" }, 409),
      );
      recoverActiveTicketMock.mockResolvedValueOnce(mockActiveServingTicket);

      const options = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.startService();
      });

      expect(result.current.ticketActionError).toBe(
        "Ticket status already updated",
      );
      expect(recoverActiveTicketMock).toHaveBeenCalledWith(
        "org-1",
        "user-staff-1",
      );
      expect(setActiveTicketMock).toHaveBeenCalledWith(mockActiveServingTicket);
      expect(fetchQueueStatusesMock).toHaveBeenCalledWith("org-1", "user-staff-1");
      expect(result.current.activeTicketAction).toBeNull();
    });

    it("handles 500 error or malformed response during startService", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Server crashed" }, 500),
      );

      const options = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.startService();
      });

      expect(result.current.ticketActionError).toBe("Server crashed");
      expect(result.current.activeTicketAction).toBeNull();

      // Malformed response (status not SERVING)
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "ticket-101",
          number: 101,
          status: "CALLED",
          queueId: "queue-1",
          counterId: "counter-1",
          createdAt: "2026-10-19T10:00:00.000Z",
          updatedAt: "2026-10-19T10:05:00.000Z",
        }),
      );

      await act(async () => {
        await result.current.startService();
      });

      expect(result.current.ticketActionError).toBe(
        "Malformed response from server after starting service.",
      );
    });
  });

  describe("completeService", () => {
    it("successfully completes service, clears active ticket, and refreshes queues", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "ticket-102",
          number: 102,
          status: "COMPLETED",
          queueId: "queue-1",
          counterId: "counter-1",
          createdAt: "2026-10-19T10:00:00.000Z",
          updatedAt: "2026-10-19T10:15:00.000Z",
        }),
      );

      const options = createTestOptions({
        activeTicket: mockActiveServingTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.completeService();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tickets/ticket-102/complete",
        expect.objectContaining({ method: "PATCH" }),
      );

      expect(setActiveTicketMock).toHaveBeenCalledWith(null);
      expect(setCounterWarningMock).toHaveBeenCalledWith(null);
      expect(fetchQueueStatusesMock).toHaveBeenCalledWith("org-1", "user-staff-1");
      expect(result.current.activeTicketAction).toBeNull();
      expect(result.current.ticketActionError).toBeNull();
    });

    it("guards completeService if active ticket status is not SERVING", async () => {
      const optionsCalled = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(optionsCalled));

      await act(async () => {
        await result.current.completeService();
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redirects on 401 response during completeService", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

      const options = createTestOptions({
        activeTicket: mockActiveServingTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.completeService();
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/sign-in?redirect_url=%2Fstaff",
      );
    });

    it("handles 409 conflict during completeService", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Ticket already closed" }, 409),
      );
      recoverActiveTicketMock.mockResolvedValueOnce(null);

      const options = createTestOptions({
        activeTicket: mockActiveServingTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.completeService();
      });

      expect(result.current.ticketActionError).toBe("Ticket already closed");
      expect(recoverActiveTicketMock).toHaveBeenCalledWith(
        "org-1",
        "user-staff-1",
      );
      expect(setActiveTicketMock).toHaveBeenCalledWith(null);
    });
  });

  describe("skipTicket", () => {
    it("cancels skipTicket when user rejects confirmation dialog", async () => {
      confirmDialogMock.mockReturnValueOnce(false);

      const options = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.skipTicket();
      });

      expect(confirmDialogMock).toHaveBeenCalledWith(
        "Are you sure you want to skip ticket #101? The ticket will leave the active queue and will no longer be served.",
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.activeTicketAction).toBeNull();
    });

    it("successfully skips ticket when confirmed, clears ticket, and refreshes queues", async () => {
      confirmDialogMock.mockReturnValueOnce(true);
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: "ticket-101",
          number: 101,
          status: "SKIPPED",
          queueId: "queue-1",
          counterId: "counter-1",
          createdAt: "2026-10-19T10:00:00.000Z",
          updatedAt: "2026-10-19T10:10:00.000Z",
        }),
      );

      const options = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.skipTicket();
      });

      expect(confirmDialogMock).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tickets/ticket-101/skip",
        expect.objectContaining({ method: "PATCH" }),
      );

      expect(setActiveTicketMock).toHaveBeenCalledWith(null);
      expect(setCounterWarningMock).toHaveBeenCalledWith(null);
      expect(fetchQueueStatusesMock).toHaveBeenCalledWith("org-1", "user-staff-1");
      expect(result.current.activeTicketAction).toBeNull();
    });

    it("redirects on 401 response during skipTicket", async () => {
      confirmDialogMock.mockReturnValueOnce(true);
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));

      const options = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.skipTicket();
      });

      expect(mockPush).toHaveBeenCalledWith(
        "/sign-in?redirect_url=%2Fstaff",
      );
    });

    it("handles 409 conflict during skipTicket", async () => {
      confirmDialogMock.mockReturnValueOnce(true);
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Ticket state conflict" }, 409),
      );

      const options = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.skipTicket();
      });

      expect(result.current.ticketActionError).toBe("Ticket state conflict");
      expect(recoverActiveTicketMock).toHaveBeenCalledWith(
        "org-1",
        "user-staff-1",
      );
    });
  });

  describe("race conditions & identity-change protection", () => {
    it("drops callNext response if organization changes while request is pending", async () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockReturnValueOnce(deferred.promise);

      let hookOptions = createTestOptions({ orgId: "org-1" });
      const { result, rerender } = renderHook(
        (props: UseTicketActionsOptions) => useTicketActions(props),
        { initialProps: hookOptions },
      );

      let callPromise: Promise<void>;
      act(() => {
        callPromise = result.current.callNext(mockQueue1);
      });

      expect(result.current.callingQueueId).toBe("queue-1");

      // Switch organization before server responds
      hookOptions = createTestOptions({ orgId: "org-2" });
      rerender(hookOptions);

      // Verify that in-flight indicators and errors are immediately cleared
      expect(result.current.callingQueueId).toBeNull();
      expect(result.current.callActionError).toBeNull();

      // Resolve pending call from org-1
      await act(async () => {
        deferred.resolve(
          jsonResponse({
            id: "ticket-org1-late",
            number: 999,
            status: "CALLED",
            queueId: "queue-1",
            counterId: "counter-1",
            createdAt: "2026-10-20T10:00:00.000Z",
            updatedAt: "2026-10-20T10:00:00.000Z",
          }),
        );
        await callPromise!;
      });

      // Crucial: setActiveTicket should NOT have been called with the late response
      expect(setActiveTicketMock).not.toHaveBeenCalled();
      expect(result.current.callingQueueId).toBeNull();
    });

    it("drops startService response if staffId changes while request is pending", async () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockReturnValueOnce(deferred.promise);

      let hookOptions = createTestOptions({
        staffId: "user-staff-1",
        activeTicket: mockActiveCalledTicket,
      });
      const { result, rerender } = renderHook(
        (props: UseTicketActionsOptions) => useTicketActions(props),
        { initialProps: hookOptions },
      );

      let startPromise: Promise<void>;
      act(() => {
        startPromise = result.current.startService();
      });

      expect(result.current.activeTicketAction).toBe("start");

      // Switch operator
      hookOptions = createTestOptions({
        staffId: "user-staff-2",
        activeTicket: mockActiveCalledTicket,
      });
      rerender(hookOptions);

      expect(result.current.activeTicketAction).toBeNull();

      // Resolve stale request
      await act(async () => {
        deferred.resolve(
          jsonResponse({
            id: "ticket-101",
            number: 101,
            status: "SERVING",
            queueId: "queue-1",
            counterId: "counter-1",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:05:00.000Z",
          }),
        );
        await startPromise!;
      });

      expect(setActiveTicketMock).not.toHaveBeenCalled();
    });

    it("resetTicketActions clears all mutation states and invalidates pending generation", async () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockReturnValueOnce(deferred.promise);

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      let callPromise: Promise<void>;
      act(() => {
        callPromise = result.current.callNext(mockQueue1);
      });

      expect(result.current.callingQueueId).toBe("queue-1");

      act(() => {
        result.current.resetTicketActions();
      });

      expect(result.current.callingQueueId).toBeNull();

      // Resolve promise after reset
      await act(async () => {
        deferred.resolve(
          jsonResponse({
            id: "ticket-cancelled",
            number: 888,
            status: "CALLED",
            queueId: "queue-1",
            counterId: "counter-1",
            createdAt: "2026-10-20T10:00:00.000Z",
            updatedAt: "2026-10-20T10:00:00.000Z",
          }),
        );
        await callPromise!;
      });

      expect(setActiveTicketMock).not.toHaveBeenCalled();
    });
  });

  describe("canCallNext predicate and error dismissals", () => {
    it("canCallNext returns true only when all prerequisites are met", () => {
      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      expect(result.current.canCallNext(mockQueue1)).toBe(true);

      // Queue has no waiting tickets
      expect(result.current.canCallNext(mockEmptyQueue)).toBe(false);
    });

    it("canCallNext returns false if an active ticket exists or action is in progress", () => {
      const optionsWithTicket = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result: resWithTicket } = renderHook(() =>
        useTicketActions(optionsWithTicket),
      );
      expect(resWithTicket.current.canCallNext(mockQueue1)).toBe(false);

      const optionsInactiveCounter = createTestOptions({
        selectedCounterId: "counter-inactive-1",
        assignedCounters: [mockInactiveCounterOrg1],
      });
      const { result: resInactiveCounter } = renderHook(() =>
        useTicketActions(optionsInactiveCounter),
      );
      expect(resInactiveCounter.current.canCallNext(mockQueue1)).toBe(false);
    });

    it("dismissCallError and dismissTicketActionError clear their respective errors", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Call error occurred" }, 500),
      );

      const options = createTestOptions();
      const { result } = renderHook(() => useTicketActions(options));

      await act(async () => {
        await result.current.callNext(mockQueue1);
      });
      expect(result.current.callActionError).toBe("Call error occurred");

      act(() => {
        result.current.dismissCallError();
      });
      expect(result.current.callActionError).toBeNull();

      // Ticket action error dismissal
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: "Action error occurred" }, 500),
      );
      const optionsWithTicket = createTestOptions({
        activeTicket: mockActiveCalledTicket,
      });
      const { result: resTicket } = renderHook(() =>
        useTicketActions(optionsWithTicket),
      );

      await act(async () => {
        await resTicket.current.startService();
      });
      expect(resTicket.current.ticketActionError).toBe("Action error occurred");

      act(() => {
        resTicket.current.dismissTicketActionError();
      });
      expect(resTicket.current.ticketActionError).toBeNull();
    });
  });
});
