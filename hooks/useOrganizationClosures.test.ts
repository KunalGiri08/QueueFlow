// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOrganizationClosures } from "./useOrganizationClosures";
import type { ClosureItem } from "@/components/admin/operating-hours/types";

// Mock router
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockClosures: ClosureItem[] = [
  {
    id: "closure-1",
    organizationId: "org-1",
    startDate: "2026-12-25",
    endDate: "2026-12-25",
    reason: "Christmas Day",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "closure-2",
    organizationId: "org-1",
    startDate: "2026-12-31",
    endDate: "2027-01-01",
    reason: "New Year Holiday",
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

describe("useOrganizationClosures Hook", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("loads closures successfully on initial render", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockClosures));

    const { result } = renderHook(() =>
      useOrganizationClosures({ organizationId: "org-1" }),
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.closures).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("handles 401 unauthenticated redirect", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 401 }));

    renderHook(() =>
      useOrganizationClosures({ organizationId: "org-1" }),
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
      useOrganizationClosures({ organizationId: "org-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Administrator permissions required to view closures.",
    );
  });

  it("handles fetch failure and supports manual retry", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const { result } = renderHook(() =>
      useOrganizationClosures({ organizationId: "org-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Failed to load organization closures. Please try again.",
    );

    // Retry successfully
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockClosures));
    await act(async () => {
      await result.current.fetchClosures();
    });

    expect(result.current.closures).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("creates a new closure via saveClosure", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockClosures));
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useOrganizationClosures({ organizationId: "org-1", onSuccess }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const newClosure: ClosureItem = {
      id: "closure-new",
      organizationId: "org-1",
      startDate: "2026-11-26",
      endDate: "2026-11-27",
      reason: "Thanksgiving",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    fetchSpy.mockResolvedValueOnce(jsonResponse(newClosure, 201));

    await act(async () => {
      await result.current.saveClosure({
        startDate: "2026-11-26",
        endDate: "2026-11-27",
        reason: "Thanksgiving",
      });
    });

    expect(result.current.closures).toHaveLength(3);
    expect(onSuccess).toHaveBeenCalledWith("Closure created successfully.");
  });

  it("updates an existing closure via saveClosure", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockClosures));
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useOrganizationClosures({ organizationId: "org-1", onSuccess }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const updatedClosure: ClosureItem = {
      ...mockClosures[0],
      reason: "Christmas Extended",
    };

    fetchSpy.mockResolvedValueOnce(jsonResponse(updatedClosure, 200));

    await act(async () => {
      await result.current.saveClosure(
        {
          startDate: "2026-12-25",
          endDate: "2026-12-25",
          reason: "Christmas Extended",
        },
        mockClosures[0],
      );
    });

    expect(result.current.closures[0].reason).toBe("Christmas Extended");
    expect(onSuccess).toHaveBeenCalledWith("Closure updated successfully.");
  });

  it("throws error and does not update state when saveClosure fails", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockClosures));

    const { result } = renderHook(() =>
      useOrganizationClosures({ organizationId: "org-1" }),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: "Invalid date range specified" }, 400),
    );

    await expect(
      act(async () => {
        await result.current.saveClosure({
          startDate: "2026-12-25",
          endDate: "2026-12-20",
          reason: null,
        });
      }),
    ).rejects.toThrow("Invalid date range specified");

    expect(result.current.closures).toHaveLength(2);
  });

  it("deletes closure when confirmed and does nothing when cancelled", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(mockClosures));
    const confirmMock = vi.fn();
    const onSuccess = vi.fn();

    const { result } = renderHook(() =>
      useOrganizationClosures({
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
      const deleted = await result.current.deleteClosure(mockClosures[0]);
      expect(deleted).toBe(false);
    });
    expect(result.current.closures).toHaveLength(2);

    // Confirm deletion
    confirmMock.mockReturnValueOnce(true);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await act(async () => {
      const deleted = await result.current.deleteClosure(mockClosures[0]);
      expect(deleted).toBe(true);
    });

    expect(result.current.closures).toHaveLength(1);
    expect(onSuccess).toHaveBeenCalledWith("Closure deleted successfully.");
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
      ({ orgId }) => useOrganizationClosures({ organizationId: orgId }),
      { initialProps: { orgId: "org-1" } },
    );

    expect(result.current.isLoading).toBe(true);

    // Switch to org-2 while org-1 is in flight
    rerender({ orgId: "org-2" });
    expect(result.current.closures).toEqual([]);

    // org-2 resolves first
    const org2Data: ClosureItem[] = [
      {
        id: "org2-closure",
        organizationId: "org-2",
        startDate: "2026-07-04",
        endDate: "2026-07-04",
        reason: "Independence Day",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    org2Deferred.resolve(jsonResponse(org2Data));

    await waitFor(() => {
      expect(result.current.closures).toEqual(org2Data);
    });

    // org-1 resolves late
    org1Deferred.resolve(jsonResponse(mockClosures));

    // Wait a tick to ensure org-1 response does not overwrite org-2
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.closures).toEqual(org2Data);
  });
});
