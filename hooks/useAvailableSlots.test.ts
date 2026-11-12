// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useAvailableSlots,
  isValidAvailableSlot,
  getTodayInTimezone,
  type AvailableSlot,
} from "./useAvailableSlots";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockSlot1: AvailableSlot = {
  slotStart: "2026-11-15T09:00:00.000Z",
  slotEnd: "2026-11-15T09:30:00.000Z",
  localStartTime: "09:00",
  localEndTime: "09:30",
  bookedCount: 0,
  maxCapacity: 1,
  remainingCapacity: 1,
  isAvailable: true,
};

const mockSlot2: AvailableSlot = {
  slotStart: "2026-11-15T09:30:00.000Z",
  slotEnd: "2026-11-15T10:00:00.000Z",
  localStartTime: "09:30",
  localEndTime: "10:00",
  bookedCount: 1,
  maxCapacity: 1,
  remainingCapacity: 0,
  isAvailable: false,
};

const mockSlot3: AvailableSlot = {
  slotStart: "2026-11-16T14:00:00.000Z",
  slotEnd: "2026-11-16T14:30:00.000Z",
  localStartTime: "14:00",
  localEndTime: "14:30",
  bookedCount: 0,
  maxCapacity: 2,
  remainingCapacity: 2,
  isAvailable: true,
};

describe("useAvailableSlots", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("performs initial fetch with correct URL and updates state with available slots", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: { id: "srv-1", name: "General Consultation" },
        slots: [mockSlot1, mockSlot2],
      }),
    );

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        timezone: "Asia/Kolkata",
        initialDate: "2026-11-15",
      }),
    );

    expect(result.current.selectedDate).toBe("2026-11-15");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.slots).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.slots).toEqual([mockSlot1, mockSlot2]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/organizations/org-1/services/srv-1/slots?date=2026-11-15",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("defaults to organization-local date when initialDate is not provided", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-11",
        slots: [mockSlot1],
      }),
    );

    const expectedDate = getTodayInTimezone("America/New_York");

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        timezone: "America/New_York",
      }),
    );

    expect(result.current.selectedDate).toBe(expectedDate);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/public/organizations/org-1/services/srv-1/slots?date=${expectedDate}`,
      expect.any(Object),
    );
  });

  it("does not fetch when organizationId or serviceId is missing", async () => {
    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: null,
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.slots).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears slots and re-fetches when changing selected date", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          slots: [mockSlot1, mockSlot2],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-16",
          slots: [mockSlot3],
        }),
      );

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    await waitFor(() => {
      expect(result.current.slots).toEqual([mockSlot1, mockSlot2]);
    });

    // Change date
    act(() => {
      result.current.setSelectedDate("2026-11-16");
    });

    expect(result.current.selectedDate).toBe("2026-11-16");
    // Previous slots should be cleared during date transition
    expect(result.current.slots).toEqual([]);
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.slots).toEqual([mockSlot3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/public/organizations/org-1/services/srv-1/slots?date=2026-11-16",
      expect.any(Object),
    );
  });

  it("cancels in-flight request via AbortController on rapid date changes", async () => {
    const deferred1 = createDeferred<Response>();
    const deferred2 = createDeferred<Response>();

    const abortSignals: AbortSignal[] = [];

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.signal) {
        abortSignals.push(init.signal);
      }
      if (url.includes("date=2026-11-15")) {
        return deferred1.promise;
      }
      return deferred2.promise;
    });

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    await waitFor(() => {
      expect(abortSignals).toHaveLength(1);
    });
    expect(abortSignals[0].aborted).toBe(false);

    // Rapidly change date before first request finishes
    act(() => {
      result.current.setSelectedDate("2026-11-16");
    });

    await waitFor(() => {
      expect(abortSignals).toHaveLength(2);
    });
    expect(abortSignals[0].aborted).toBe(true);
    expect(abortSignals[1].aborted).toBe(false);

    // Resolve second request
    await act(async () => {
      deferred2.resolve(
        jsonResponse({
          date: "2026-11-16",
          slots: [mockSlot3],
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.slots).toEqual([mockSlot3]);
  });

  it("protects against stale responses when an older request resolves after a newer request", async () => {
    const deferredOld = createDeferred<Response>();
    const deferredNew = createDeferred<Response>();

    fetchMock.mockImplementation((url: string) => {
      if (url.includes("date=2026-11-15")) {
        return deferredOld.promise;
      }
      return deferredNew.promise;
    });

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    // Change date immediately to 2026-11-16
    act(() => {
      result.current.setSelectedDate("2026-11-16");
    });

    // Resolve newer request first
    await act(async () => {
      deferredNew.resolve(
        jsonResponse({
          date: "2026-11-16",
          slots: [mockSlot3],
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.slots).toEqual([mockSlot3]);
    });

    // Now resolve the older request (simulating late network arrival)
    await act(async () => {
      deferredOld.resolve(
        jsonResponse({
          date: "2026-11-15",
          slots: [mockSlot1, mockSlot2],
        }),
      );
    });

    // Assert that the newer slots remain and were NOT overwritten by the stale response
    expect(result.current.slots).toEqual([mockSlot3]);
    expect(result.current.selectedDate).toBe("2026-11-16");
  });

  it("refreshes slots for current date while preserving previous slots during load", async () => {
    const deferredRefresh = createDeferred<Response>();

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          slots: [mockSlot1],
        }),
      )
      .mockImplementationOnce(() => deferredRefresh.promise);

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    await waitFor(() => {
      expect(result.current.slots).toEqual([mockSlot1]);
    });

    // Trigger refresh
    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = result.current.refreshSlots();
    });

    // While refreshing: isLoading is true, but existing slots are preserved to prevent UI flicker
    expect(result.current.isLoading).toBe(true);
    expect(result.current.slots).toEqual([mockSlot1]);
    expect(result.current.selectedDate).toBe("2026-11-15");

    const updatedSlot = { ...mockSlot1, remainingCapacity: 0, isAvailable: false };
    await act(async () => {
      deferredRefresh.resolve(
        jsonResponse({
          date: "2026-11-15",
          slots: [updatedSlot],
        }),
      );
      await refreshPromise!;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.slots).toEqual([updatedSlot]);
  });

  it("handles HTTP 404 response gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Service not found or inactive" }, 404),
    );

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-nonexistent",
        initialDate: "2026-11-15",
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Service not found or inactive");
    expect(result.current.slots).toEqual([]);
  });

  it("handles HTTP 500 response gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Internal server error" }, 500),
    );

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Internal server error");
    expect(result.current.slots).toEqual([]);
  });

  it("handles malformed API response where slots is missing or not an array", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ unexpectedKey: "invalid_payload" }, 200),
    );

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Malformed slots response");
    expect(result.current.slots).toEqual([]);
  });

  it("cleans up on unmount and aborts active controller", async () => {
    const deferred = createDeferred<Response>();
    let capturedSignal: AbortSignal | null | undefined;

    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return deferred.promise;
    });

    const { unmount } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    await waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("handles network failure / fetch rejection", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Failed to connect to server"));

    const { result } = renderHook(() =>
      useAvailableSlots({
        organizationId: "org-1",
        serviceId: "srv-1",
        initialDate: "2026-11-15",
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to connect to server");
    expect(result.current.slots).toEqual([]);
  });

  it("validates slot objects with isValidAvailableSlot helper", () => {
    expect(isValidAvailableSlot(mockSlot1)).toBe(true);
    expect(isValidAvailableSlot(null)).toBe(false);
    expect(isValidAvailableSlot(undefined)).toBe(false);
    expect(isValidAvailableSlot({ slotStart: "invalid" })).toBe(false);
    expect(isValidAvailableSlot("a string")).toBe(false);
    expect(
      isValidAvailableSlot({
        ...mockSlot1,
        isAvailable: "yes", // should be boolean
      }),
    ).toBe(false);
  });
});
