// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { OrganizationAnalytics, type OrganizationAnalyticsData } from "./OrganizationAnalytics";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockAnalyticsData: OrganizationAnalyticsData = {
  date: "2026-10-24",
  timezone: "Asia/Kolkata",
  totalCreatedToday: 42,
  completedToday: 35,
  currentlyWaiting: 6,
  currentlyServing: 2,
  averageWaitMinutes: 14.5,
  skippedToday: 3,
  cancelledToday: 1,
};

describe("components/admin/OrganizationAnalytics", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders loading skeleton while analytics data is being fetched", () => {
    const deferred = createDeferred<Response>();
    fetchMock.mockImplementation(() => deferred.promise);

    render(<OrganizationAnalytics organizationId="org-1" />);

    expect(
      screen.getByRole("status", { name: /loading organization analytics/i }),
    ).toBeDefined();
  });

  it("renders all six metric cards with formatted values upon successful fetch", async () => {
    render(<OrganizationAnalytics organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Today's Analytics")).toBeDefined();
    });

    // Check timezone information is displayed
    expect(screen.getByText(/Asia\/Kolkata/)).toBeDefined();

    // 1. Total Created
    expect(screen.getByText("Total Created")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("Tickets issued today")).toBeDefined();

    // 2. Completed Today
    expect(screen.getByText("Completed Today")).toBeDefined();
    expect(screen.getByText("35")).toBeDefined();
    expect(screen.getByText("Successfully served tickets")).toBeDefined();

    // 3. Currently Waiting
    expect(screen.getByText("Currently Waiting")).toBeDefined();
    expect(screen.getByText("6")).toBeDefined();
    expect(screen.getByText("Tickets in line right now")).toBeDefined();

    // 4. Currently Serving
    expect(screen.getByText("Currently Serving")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("Active at service counters")).toBeDefined();

    // 5. Average Actual Wait
    expect(screen.getByText("Avg Actual Wait")).toBeDefined();
    expect(screen.getByText("14.5 min")).toBeDefined();
    expect(screen.getByText("Time in line before being called")).toBeDefined();

    // 6. Skipped and Cancelled (separate numbers within one card)
    expect(screen.getByText("Skipped & Cancelled")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("skipped")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("cancelled")).toBeDefined();
    expect(screen.getByText("Unserved tickets today")).toBeDefined();
  });

  it("displays '—' when averageWaitMinutes is null", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...mockAnalyticsData,
          averageWaitMinutes: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<OrganizationAnalytics organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Today's Analytics")).toBeDefined();
    });

    expect(screen.getByText("Avg Actual Wait")).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
  });

  it("renders error alert with retry button on API failure, and recovers on retry", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Failed to load analytics data" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<OrganizationAnalytics organizationId="org-1" />);

    // Error state appears
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });
    expect(screen.getByText("Failed to load analytics data")).toBeDefined();

    // Prepare success response for retry
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(mockAnalyticsData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const retryButton = screen.getByRole("button", { name: /retry analytics/i });
    fireEvent.click(retryButton);

    // Cards render after retry
    await waitFor(() => {
      expect(screen.getByText("Today's Analytics")).toBeDefined();
    });
    expect(screen.getByText("42")).toBeDefined();
  });

  it("re-fetches analytics when the manual Refresh button is clicked", async () => {
    render(<OrganizationAnalytics organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Today's Analytics")).toBeDefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mock an updated response
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...mockAnalyticsData,
          totalCreatedToday: 45,
          currentlyWaiting: 9,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const refreshBtn = screen.getByRole("button", { name: /refresh analytics data/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText("45")).toBeDefined();
    });
    expect(screen.getByText("9")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prevents stale responses from overwriting data during rapid organization switching", async () => {
    const deferredOrg1 = createDeferred<Response>();
    const deferredOrg2 = createDeferred<Response>();

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/organizations/org-1/analytics")) {
        return deferredOrg1.promise;
      }
      if (url.includes("/api/organizations/org-2/analytics")) {
        return deferredOrg2.promise;
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const { rerender } = render(<OrganizationAnalytics organizationId="org-1" />);

    // Loading skeleton for org-1 is visible
    expect(
      screen.getByRole("status", { name: /loading organization analytics/i }),
    ).toBeDefined();

    // User switches to org-2 before org-1 resolves
    rerender(<OrganizationAnalytics organizationId="org-2" />);

    // Now org-2 resolves first
    await act(async () => {
      deferredOrg2.resolve(
        new Response(
          JSON.stringify({
            ...mockAnalyticsData,
            totalCreatedToday: 99,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("99")).toBeDefined();
    });

    // Stale org-1 response resolves late
    await act(async () => {
      deferredOrg1.resolve(
        new Response(
          JSON.stringify({
            ...mockAnalyticsData,
            totalCreatedToday: 42,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });

    // The display must remain 99 (from org-2), NOT overwritten by stale org-1 data (42)
    expect(screen.getByText("99")).toBeDefined();
    expect(screen.queryByText("42")).toBeNull();
  });
});
