// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOrganizationSchedule } from "./useOrganizationSchedule";
import type { ScheduleIntervalItem } from "@/components/admin/operating-hours/types";

// Mock router
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockIntervals: ScheduleIntervalItem[] = [
  {
    id: "interval-1",
    organizationId: "org-1",
    dayOfWeek: 1, // Monday
    startTime: "09:00",
    endTime: "13:00",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "interval-2",
    organizationId: "org-1",
    dayOfWeek: 1, // Monday Shift 2
    startTime: "14:00",
    endTime: "18:00",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "interval-3",
    organizationId: "org-1",
    dayOfWeek: 2, // Tuesday
    startTime: "08:30",
    endTime: "16:30",
    isActive: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

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

describe("useOrganizationSchedule Hook", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("loads schedule intervals successfully on initial render", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockIntervals));

    const { result } = renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1" }),
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.intervals).toHaveLength(3);
    expect(result.current.error).toBeNull();
  });

  it("handles 401 unauthenticated redirect", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 401 }));

    renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1" }),
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fadmin");
    });
  });

  it("handles 403 forbidden permission error", async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: "Forbidden" }, 403),
    );

    const { result } = renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Administrator permissions required to view schedule.",
    );
  });

  it("handles fetch failure and supports manual retry", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const { result } = renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Failed to load working schedule. Please try again.",
    );

    // Retry successfully
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockIntervals));
    await act(async () => {
      await result.current.fetchSchedule();
    });

    expect(result.current.intervals).toHaveLength(3);
    expect(result.current.error).toBeNull();
  });

  it("creates a new schedule interval via saveInterval", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockIntervals));
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1", onSuccess }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const newInterval: ScheduleIntervalItem = {
      id: "interval-new",
      organizationId: "org-1",
      dayOfWeek: 3,
      startTime: "10:00",
      endTime: "16:00",
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    fetchSpy.mockResolvedValueOnce(jsonResponse(newInterval, 201));

    await act(async () => {
      await result.current.saveInterval({
        dayOfWeek: 3,
        startTime: "10:00",
        endTime: "16:00",
        isActive: true,
      });
    });

    expect(result.current.intervals).toHaveLength(4);
    expect(onSuccess).toHaveBeenCalledWith("Schedule interval added successfully.");
  });

  it("updates an existing schedule interval via saveInterval", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockIntervals));
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1", onSuccess }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const updatedInterval: ScheduleIntervalItem = {
      ...mockIntervals[0],
      endTime: "12:30",
    };

    fetchSpy.mockResolvedValueOnce(jsonResponse(updatedInterval, 200));

    await act(async () => {
      await result.current.saveInterval(
        {
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "12:30",
          isActive: true,
        },
        mockIntervals[0],
      );
    });

    expect(result.current.intervals[0].endTime).toBe("12:30");
    expect(onSuccess).toHaveBeenCalledWith("Schedule interval updated successfully.");
  });

  it("throws error and does not update state when saveInterval fails", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockIntervals));

    const { result } = renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: "Interval overlaps with existing active hours" }, 409),
    );

    await expect(
      act(async () => {
        await result.current.saveInterval({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "13:00",
          isActive: true,
        });
      }),
    ).rejects.toThrow("Interval overlaps with existing active hours");

    expect(result.current.intervals).toHaveLength(3);
  });

  it("toggles interval active status and catches overlap collision", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockIntervals));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1", onError }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Add an inactive interval that would overlap interval-1 (09:00 - 13:00) if activated
    const overlappingInactive: ScheduleIntervalItem = {
      id: "interval-overlap",
      organizationId: "org-1",
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "12:00",
      isActive: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    // Attempt to activate overlapping interval
    let success: boolean = true;
    await act(async () => {
      success = await result.current.toggleIntervalActive(overlappingInactive);
    });

    expect(success).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("Cannot activate interval: overlaps with active hours"),
    );
  });

  it("deletes interval when confirmed and does nothing when cancelled", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockIntervals));
    const confirmMock = vi.fn();
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useOrganizationSchedule({
        organizationId: "org-1",
        confirmDialog: confirmMock,
        onSuccess,
      }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Cancel deletion
    confirmMock.mockReturnValueOnce(false);
    await act(async () => {
      const deleted = await result.current.deleteInterval(mockIntervals[0]);
      expect(deleted).toBe(false);
    });
    expect(result.current.intervals).toHaveLength(3);

    // Confirm deletion
    confirmMock.mockReturnValueOnce(true);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await act(async () => {
      const deleted = await result.current.deleteInterval(mockIntervals[0]);
      expect(deleted).toBe(true);
    });

    expect(result.current.intervals).toHaveLength(2);
    expect(onSuccess).toHaveBeenCalledWith("Schedule interval deleted successfully.");
  });

  it("toggles day: closes day when active, opens day when inactive, triggers onDayEmpty when empty", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockIntervals));
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useOrganizationSchedule({ organizationId: "org-1", onSuccess }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Monday (1) has active intervals: toggle should close them
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ ...mockIntervals[0], isActive: false }),
    );
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ ...mockIntervals[1], isActive: false }),
    );

    await act(async () => {
      await result.current.toggleDay(1);
    });

    expect(onSuccess).toHaveBeenCalledWith("Monday marked as closed.");

    // Tuesday (2) has an inactive interval: toggle should activate it
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ ...mockIntervals[2], isActive: true }),
    );

    await act(async () => {
      await result.current.toggleDay(2);
    });

    expect(onSuccess).toHaveBeenCalledWith("Tuesday marked as open.");

    // Wednesday (3) has no intervals: toggle should invoke onDayEmpty callback
    const onDayEmpty = vi.fn();
    await act(async () => {
      await result.current.toggleDay(3, onDayEmpty);
    });

    expect(onDayEmpty).toHaveBeenCalled();
  });

  it("prevents stale organization data from replacing newly selected organization", async () => {
    const org1Deferred = createDeferred<Response>();
    const org2Deferred = createDeferred<Response>();

    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/org-1/")) return org1Deferred.promise;
      if (url.includes("/org-2/")) return org2Deferred.promise;
      return Promise.reject(new Error("Unknown URL"));
    });

    const { result, rerender } = renderHook(
      ({ orgId }) => useOrganizationSchedule({ organizationId: orgId }),
      { initialProps: { orgId: "org-1" } },
    );

    expect(result.current.isLoading).toBe(true);

    // Switch to org-2 while org-1 is in flight
    rerender({ orgId: "org-2" });
    expect(result.current.intervals).toEqual([]);

    // org-2 resolves first
    const org2Data: ScheduleIntervalItem[] = [
      {
        id: "org2-interval",
        organizationId: "org-2",
        dayOfWeek: 4,
        startTime: "10:00",
        endTime: "15:00",
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    org2Deferred.resolve(jsonResponse(org2Data));

    await waitFor(() => {
      expect(result.current.intervals).toEqual(org2Data);
    });

    // org-1 resolves late
    org1Deferred.resolve(jsonResponse(mockIntervals));

    // Wait a tick to ensure org-1 response does not overwrite org-2
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.intervals).toEqual(org2Data);
  });
});
