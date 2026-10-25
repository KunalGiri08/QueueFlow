// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import TicketTrackingPage from "./page";

// 1. Mock Next.js navigation with stable params
let mockTrackingToken = "token-test-123";
vi.mock("next/navigation", () => ({
  useParams: () => ({ trackingToken: mockTrackingToken }),
}));

// 2. Mock Navbar to isolate the tracking page from global layout
vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

// 3. Mock notification audio chime
const { mockPlayTurnChime } = vi.hoisted(() => ({
  mockPlayTurnChime: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/audio/notification-sound", () => ({
  playTurnChime: mockPlayTurnChime,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Canonical mock tracking data conforming to PublicTicketTrackingData
const mockWaitingTicket = {
  ticketNumber: 42,
  status: "WAITING",
  peopleAhead: 3,
  currentlyServing: 39,
  estimatedWaitMinutes: 15,
  queue: {
    name: "Standard Line",
  },
  service: {
    name: "Consultation",
  },
  organization: {
    name: "Apex Healthcare",
  },
  counter: {
    name: "Window 2",
  },
};

const mockCalledTicket = {
  ticketNumber: 42,
  status: "CALLED",
  peopleAhead: 0,
  currentlyServing: 42,
  estimatedWaitMinutes: 0,
  queue: {
    name: "Standard Line",
  },
  service: {
    name: "Consultation",
  },
  organization: {
    name: "Apex Healthcare",
  },
  counter: {
    name: "Window 2",
  },
};

const mockCompletedTicket = {
  ticketNumber: 42,
  status: "COMPLETED",
  peopleAhead: 0,
  currentlyServing: null,
  estimatedWaitMinutes: null,
  queue: {
    name: "Standard Line",
  },
  service: {
    name: "Consultation",
  },
  organization: {
    name: "Apex Healthcare",
  },
  counter: null,
};

async function renderPage(token = "token-test-123") {
  mockTrackingToken = token;
  const paramsPromise = Promise.resolve({ trackingToken: token });
  let renderResult: ReturnType<typeof render>;
  await act(async () => {
    renderResult = render(<TicketTrackingPage params={paramsPromise} />);
  });
  return renderResult!;
}

function renderPageSync(token = "token-test-123") {
  mockTrackingToken = token;
  const paramsPromise = Promise.resolve({ trackingToken: token });
  return render(<TicketTrackingPage params={paramsPromise} />);
}

describe("app/tickets/track/[trackingToken]/page (Public Ticket Tracking)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let activeFetchHandler: (url: string, init?: RequestInit) => Promise<Response> | Response;

  beforeEach(() => {
    mockTrackingToken = "token-test-123";

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "visible",
    });

    mockPlayTurnChime.mockClear();
    mockPlayTurnChime.mockResolvedValue(true);

    activeFetchHandler = async (url: string) => {
      if (url.includes(`/api/tickets/track/${encodeURIComponent(mockTrackingToken)}`)) {
        return jsonResponse(mockWaitingTicket);
      }
      return jsonResponse({ error: "Ticket not found" }, 404);
    };

    fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
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

  describe("Initial load and skeleton states", () => {
    it("renders loading skeleton while initial ticket tracking details are in flight", async () => {
      const deferred = createDeferred<Response>();
      activeFetchHandler = () => deferred.promise;

      await act(async () => {
        renderPageSync();
      });

      expect(screen.getByLabelText("Loading ticket details")).toBeDefined();
      expect(screen.queryByText("#42")).toBeNull();
    });

    it("displays hero card, assigned counter, metrics, and details when fetch succeeds", async () => {
      await renderPage();

      // Hero ticket card
      expect(await screen.findByRole("heading", { name: "#42", level: 1 })).toBeDefined();
      expect(screen.getByText(/Apex Healthcare • Consultation/i)).toBeDefined();
      const statusBadge = screen.getByText("Waiting in Line");
      expect(statusBadge.className).toContain("px-3 py-1 text-xs");
      expect(statusBadge.className).toContain("bg-amber-50 text-amber-800");
      expect(
        screen.getByText("You are currently in line. Please keep this page open to watch your position.")
      ).toBeDefined();

      // Counter callout
      expect(screen.getByText("Assigned Counter")).toBeDefined();
      expect(screen.getAllByText("Window 2").length).toBe(2);

      // Position metrics
      expect(screen.getByText("People Ahead")).toBeDefined();
      expect(screen.getByText("3")).toBeDefined();
      expect(screen.getByText("3 people ahead of you")).toBeDefined();

      expect(screen.getByText("Currently Serving")).toBeDefined();
      expect(screen.getByText("#39")).toBeDefined();
      expect(screen.getByText("Active ticket at counter")).toBeDefined();

      expect(screen.getByText("Estimated Wait")).toBeDefined();
      expect(screen.getByText("~15 min")).toBeDefined();
      expect(screen.getByText("Estimated time, not a guarantee")).toBeDefined();

      // Queue details section
      expect(screen.getByRole("heading", { name: /queue details/i, level: 2 })).toBeDefined();
      expect(screen.getByText("Standard Line")).toBeDefined();

      // Actions
      expect(screen.getByRole("button", { name: /refresh status/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /explore other organizations/i })).toBeDefined();
    });
  });

  describe("Not found state", () => {
    it("displays ticket not found UI with explore link when tracking token returns 404", async () => {
      activeFetchHandler = async () => jsonResponse({ error: "Ticket not found" }, 404);

      await renderPage("non-existent-token");

      expect(await screen.findByRole("heading", { name: /ticket not found/i, level: 2 })).toBeDefined();
      expect(
        screen.getByText(/We couldn't find an active ticket matching this tracking link/i)
      ).toBeDefined();

      const exploreBtn = screen.getByRole("link", { name: /explore organizations/i });
      expect(exploreBtn).toBeDefined();
      expect(exploreBtn.getAttribute("href")).toBe("/organizations");
      expect(screen.queryByRole("heading", { name: "#42", level: 1 })).toBeNull();
    });

    it("displays ticket not found UI immediately without network fetch when tracking token is empty", async () => {
      await renderPage("");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(await screen.findByRole("heading", { name: /ticket not found/i, level: 2 })).toBeDefined();
      expect(screen.queryByLabelText("Loading ticket details")).toBeNull();
    });

    it("displays ticket not found UI without network fetch when tracking token contains only whitespace", async () => {
      await renderPage("   ");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(await screen.findByRole("heading", { name: /ticket not found/i, level: 2 })).toBeDefined();
      expect(screen.queryByLabelText("Loading ticket details")).toBeNull();
    });
  });

  describe("Position metrics variants and called ticket presentation", () => {
    it("displays called ticket status with pulsing badge and specific callout message", async () => {
      activeFetchHandler = async () => jsonResponse(mockCalledTicket);

      await renderPage();

      expect(await screen.findByRole("heading", { name: "#42", level: 1 })).toBeDefined();
      expect(screen.getByText("Ticket Called")).toBeDefined();
      expect(
        screen.getByText("Your ticket has been called! Please head to the counter.")
      ).toBeDefined();
      expect(screen.getByText("You are next in line!")).toBeDefined();
    });

    it("renders singular '1 person ahead of you' when peopleAhead is 1", async () => {
      activeFetchHandler = async () =>
        jsonResponse({
          ...mockWaitingTicket,
          peopleAhead: 1,
        });

      await renderPage();

      expect(await screen.findByText("1 person ahead of you")).toBeDefined();
    });

    it("renders 'None' for currently serving when no ticket is active at a counter", async () => {
      activeFetchHandler = async () =>
        jsonResponse({
          ...mockWaitingTicket,
          currentlyServing: null,
        });

      await renderPage();

      expect(await screen.findByText("None")).toBeDefined();
      expect(screen.getByText("No ticket being served yet")).toBeDefined();
    });

    it("displays '~0 min' when ticket is CALLED", async () => {
      activeFetchHandler = async () => jsonResponse(mockCalledTicket);

      await renderPage();

      expect(await screen.findByText("~0 min")).toBeDefined();
    });

    it("displays 'Unavailable' when estimatedWaitMinutes is null in API response", async () => {
      activeFetchHandler = async () =>
        jsonResponse({
          ...mockWaitingTicket,
          estimatedWaitMinutes: null,
        });

      await renderPage();

      expect(await screen.findByText("Unavailable")).toBeDefined();
      expect(screen.getByText("Estimate currently unavailable")).toBeDefined();
    });
  });

  describe("Terminal ticket states and metric visibility", () => {
    it("hides position metrics when ticket is in a terminal state (COMPLETED)", async () => {
      activeFetchHandler = async () => jsonResponse(mockCompletedTicket);

      await renderPage();

      expect(await screen.findByRole("heading", { name: "#42", level: 1 })).toBeDefined();
      const badge = screen.getByText("Completed");
      expect(badge.className).toContain("px-3 py-1 text-xs");
      expect(badge.className).toContain("bg-gray-100 text-gray-800");
      expect(
        screen.getByText("This service session has been completed. Thank you!")
      ).toBeDefined();

      // Position metrics and assigned counter must be hidden when counter is null
      expect(screen.queryByText("People Ahead")).toBeNull();
      expect(screen.queryByText("Currently Serving")).toBeNull();
      expect(screen.queryByText("Estimated Wait")).toBeNull();
      expect(screen.queryByText("Assigned Counter")).toBeNull();
    });

    it("renders SERVING status using shared StatusBadge and message while hiding position metrics", async () => {
      activeFetchHandler = async () =>
        jsonResponse({
          ...mockWaitingTicket,
          status: "SERVING",
        });

      await renderPage();

      expect(await screen.findByRole("heading", { name: "#42", level: 1 })).toBeDefined();
      const badge = screen.getByText("Now Serving");
      expect(badge.className).toContain("px-3 py-1 text-xs");
      expect(badge.className).toContain("bg-green-50 text-green-800");
      expect(screen.getByText("You are currently being served.")).toBeDefined();

      // Position metrics are hidden for SERVING tickets despite being active
      expect(screen.queryByText("People Ahead")).toBeNull();
      expect(screen.queryByText("Currently Serving")).toBeNull();
      expect(screen.queryByText("Estimated Wait")).toBeNull();
    });

    it("renders CANCELLED status using shared StatusBadge and message", async () => {
      activeFetchHandler = async () =>
        jsonResponse({
          ...mockWaitingTicket,
          status: "CANCELLED",
        });

      await renderPage();

      expect(await screen.findByRole("heading", { name: "#42", level: 1 })).toBeDefined();
      const badge = screen.getByText("Cancelled");
      expect(badge.className).toContain("px-3 py-1 text-xs");
      expect(badge.className).toContain("bg-red-50 text-red-800");
      expect(screen.getByText("This ticket has been cancelled.")).toBeDefined();
      expect(screen.queryByText("People Ahead")).toBeNull();
      expect(screen.queryByText("Currently Serving")).toBeNull();
      expect(screen.queryByText("Estimated Wait")).toBeNull();
    });
  });

  describe("Error handling and recovery", () => {
    it("displays error alert with retry button when initial fetch returns 500", async () => {
      activeFetchHandler = async () => jsonResponse({ error: "Server error" }, 500);

      await renderPage();

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Unable to load ticket details at this time. Please try again.");

      const retryBtn = screen.getByRole("button", { name: /retry/i });
      expect(retryBtn).toBeDefined();
    });

    it("recovers and displays tracking data when Retry button is clicked", async () => {
      let callCount = 0;
      activeFetchHandler = async () => {
        callCount++;
        if (callCount === 1) {
          return jsonResponse({ error: "Server error" }, 500);
        }
        return jsonResponse(mockWaitingTicket);
      };

      await renderPage();

      const retryBtn = await screen.findByRole("button", { name: /retry/i });
      fireEvent.click(retryBtn);

      expect(await screen.findByRole("heading", { name: "#42", level: 1 })).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(callCount).toBe(2);
    });
  });

  describe("Manual refresh action", () => {
    it("refreshes ticket status manually and displays updating spinner state", async () => {
      let fetchCount = 0;
      const deferredRefresh = createDeferred<Response>();

      activeFetchHandler = async () => {
        fetchCount++;
        if (fetchCount === 1) {
          return jsonResponse(mockWaitingTicket);
        }
        return deferredRefresh.promise;
      };

      await renderPage();

      const refreshBtn = await screen.findByRole("button", { name: /refresh status/i });
      expect(refreshBtn).toBeDefined();

      fireEvent.click(refreshBtn);

      // Verify button shows updating spinner text while refresh is in flight
      expect(screen.getByRole("button", { name: /updating\.\.\./i })).toBeDefined();

      deferredRefresh.resolve(
        jsonResponse({
          ...mockWaitingTicket,
          peopleAhead: 2,
        })
      );

      // Verify button returns to normal and updated data is displayed
      expect(await screen.findByRole("button", { name: /refresh status/i })).toBeDefined();
      expect(screen.getByText("2")).toBeDefined();
      expect(screen.getByText("2 people ahead of you")).toBeDefined();
    });
  });

  describe("Background polling lifecycle", () => {
    it("updates ticket metrics automatically when background poll triggers at 10 seconds", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) {
          return jsonResponse(mockWaitingTicket);
        }
        // Poll response reports status updated to CALLED
        return jsonResponse(mockCalledTicket);
      };

      await renderPage();

      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(screen.getByText("3")).toBeDefined();

      // Advance by 10 seconds to trigger background poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Verify UI updated to CALLED without full page skeleton flash
      expect(screen.getByText("Ticket Called")).toBeDefined();
      expect(screen.getByText("Your ticket has been called! Please head to the counter.")).toBeDefined();
      expect(pollCount).toBe(2);
    });

    it("halts background polling when ticket transitions to terminal status", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) {
          return jsonResponse(mockWaitingTicket);
        }
        // Poll response reports ticket completed
        return jsonResponse(mockCompletedTicket);
      };

      await renderPage();

      expect(screen.getByText("Waiting in Line")).toBeDefined();

      // First poll at 10s transitions to COMPLETED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.getByText("Completed")).toBeDefined();
      expect(pollCount).toBe(2);

      // Advance another 20 seconds; no further polls should occur
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });
      expect(pollCount).toBe(2);
    });

    it("clears polling timer when component unmounts", async () => {
      vi.useFakeTimers();

      activeFetchHandler = async () => jsonResponse(mockWaitingTicket);

      const renderResult = await renderPage();

      expect(screen.getByText("Waiting in Line")).toBeDefined();

      // Exactly 1 timer scheduled for the 10-second poll
      expect(vi.getTimerCount()).toBe(1);

      renderResult.unmount();

      // Timer was cleared upon unmount
      expect(vi.getTimerCount()).toBe(0);
    });

    it("pauses polling while document visibility is hidden and does not poll in the background", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        return jsonResponse(mockWaitingTicket);
      };

      await renderPage();
      expect(pollCount).toBe(1);

      // Hide the tab
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Timer should be cleared
      expect(vi.getTimerCount()).toBe(0);

      // Advance by 30 seconds; no polls should fire while hidden
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(pollCount).toBe(1);
    });

    it("triggers an immediate refresh when tab visibility changes from hidden to visible and resumes 10s cadence", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse(mockWaitingTicket);
        return jsonResponse({ ...mockWaitingTicket, peopleAhead: 1 });
      };

      await renderPage();
      expect(pollCount).toBe(1);

      // Hide the tab
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Restore visibility to visible
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Prompt poll should have fired immediately
      expect(pollCount).toBe(2);
      expect(screen.getByText("1 person ahead of you")).toBeDefined();

      // Advancing 10 seconds triggers the next scheduled poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(pollCount).toBe(3);
    });

    it("does not poll on visibility restoration if the ticket is already in a terminal status", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        return jsonResponse(mockCompletedTicket);
      };

      await renderPage();
      expect(pollCount).toBe(1);

      // Switch to hidden then visible
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Terminal tickets must not poll on visibility restoration
      expect(pollCount).toBe(1);
    });

    it("removes visibilitychange listener and cancels timers upon unmount", async () => {
      vi.useFakeTimers();

      activeFetchHandler = async () => jsonResponse(mockWaitingTicket);

      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
      const renderResult = await renderPage();

      expect(vi.getTimerCount()).toBe(1);

      renderResult.unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "visibilitychange",
        expect.any(Function),
      );
      expect(vi.getTimerCount()).toBe(0);
    });

    it("ignores out-of-order background poll responses when a manual refresh completes first", async () => {
      vi.useFakeTimers();

      let callCount = 0;
      const deferredPoll = createDeferred<Response>();

      activeFetchHandler = async () => {
        callCount++;
        if (callCount === 1) {
          return jsonResponse(mockWaitingTicket);
        }
        if (callCount === 2) {
          // Slow background poll
          return deferredPoll.promise;
        }
        // Manual refresh response (fresher data)
        return jsonResponse({
          ...mockWaitingTicket,
          peopleAhead: 1,
        });
      };

      await renderPage();
      expect(screen.getByText("3 people ahead of you")).toBeDefined();

      // Advance by 10s to trigger background poll #2
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(callCount).toBe(2);

      // User manually clicks Refresh Status before background poll resolves
      const refreshBtn = screen.getByRole("button", { name: /refresh status/i });
      await act(async () => {
        fireEvent.click(refreshBtn);
      });
      expect(callCount).toBe(3);

      // Fresh manual refresh data is displayed
      expect(screen.getByText("1 person ahead of you")).toBeDefined();

      // Now the delayed background poll resolves with older data (peopleAhead: 5)
      await act(async () => {
        deferredPoll.resolve(
          jsonResponse({
            ...mockWaitingTicket,
            peopleAhead: 5,
          }),
        );
      });

      // Stale response must not overwrite the newer manual refresh state
      expect(screen.getByText("1 person ahead of you")).toBeDefined();
      expect(screen.queryByText("5 people ahead of you")).toBeNull();
    });
  });

  describe("Accessibility and screen reader live region", () => {
    it("renders a polite live region announcing ticket status, position, and counter", async () => {
      await renderPage();

      const liveRegion = screen.getByRole("status");
      expect(liveRegion.getAttribute("aria-live")).toBe("polite");
      expect(liveRegion.getAttribute("aria-atomic")).toBe("true");
      expect(liveRegion.className).toContain("sr-only");
      expect(liveRegion.textContent).toBe(
        "Ticket #42 status: Waiting in Line. 3 people ahead of you. Assigned to counter Window 2."
      );
    });

    it("updates the polite live region when ticket advances to CALLED", async () => {
      activeFetchHandler = async () => jsonResponse(mockCalledTicket);

      await renderPage();

      const liveRegion = screen.getByRole("status");
      expect(liveRegion.textContent).toBe(
        "Ticket #42 status: Ticket Called. You are next in line. Assigned to counter Window 2."
      );
    });

    it("updates the polite live region for COMPLETED status without queue position", async () => {
      activeFetchHandler = async () => jsonResponse(mockCompletedTicket);

      await renderPage();

      const liveRegion = screen.getByRole("status");
      expect(liveRegion.textContent).toBe("Ticket #42 status: Completed.");
    });
  });

  describe("In-app turn notification and duplicate-alert prevention", () => {
    it("displays banner and attempts chime once when transitioning from WAITING to CALLED", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) {
          return jsonResponse(mockWaitingTicket);
        }
        return jsonResponse(mockCalledTicket);
      };

      await renderPage();

      // Initially WAITING: banner and chime not present
      expect(screen.queryByRole("alert")).toBeNull();
      expect(mockPlayTurnChime).not.toHaveBeenCalled();

      // Background poll triggers at 10 seconds -> CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Banner appears
      const banner = screen.getByRole("alert");
      expect(banner).toBeDefined();
      expect(
        screen.getByText("Your turn! Please proceed to Window 2."),
      ).toBeDefined();
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);
    });

    it("displays banner without automatic sound when initial response is already CALLED", async () => {
      activeFetchHandler = async () => jsonResponse(mockCalledTicket);

      await renderPage();

      // Banner is visible on initial load
      const banner = screen.getByRole("alert");
      expect(banner).toBeDefined();
      expect(
        screen.getByText("Your turn! Please proceed to Window 2."),
      ).toBeDefined();

      // Autoplay chime must not fire on initial load
      expect(mockPlayTurnChime).not.toHaveBeenCalled();
    });

    it("suppresses repeated chime across multiple consecutive CALLED polling responses", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse(mockWaitingTicket);
        return jsonResponse(mockCalledTicket);
      };

      await renderPage();
      expect(mockPlayTurnChime).not.toHaveBeenCalled();

      // Poll 1 (10s) transitions to CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);

      // Poll 2 (20s) still CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Poll 3 (30s) still CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Chime was triggered exactly once, not on subsequent polls
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);
    });

    it("discovers transition to CALLED via manual refresh and triggers notification", async () => {
      let callCount = 0;
      activeFetchHandler = async () => {
        callCount++;
        if (callCount === 1) return jsonResponse(mockWaitingTicket);
        return jsonResponse(mockCalledTicket);
      };

      await renderPage();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(mockPlayTurnChime).not.toHaveBeenCalled();

      // User clicks Refresh Status
      const refreshBtn = screen.getByRole("button", { name: /refresh status/i });
      await act(async () => {
        fireEvent.click(refreshBtn);
      });

      expect(screen.getByRole("alert")).toBeDefined();
      expect(
        screen.getByText("Your turn! Please proceed to Window 2."),
      ).toBeDefined();
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);
    });

    it("discovers transition to CALLED upon visibility restoration and triggers notification", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse(mockWaitingTicket);
        return jsonResponse(mockCalledTicket);
      };

      await renderPage();
      expect(screen.queryByRole("alert")).toBeNull();

      // Tab hidden
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Tab restored to visible
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(screen.getByRole("alert")).toBeDefined();
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);
    });

    it("prevents banner from reopening during the same CALLED cycle after dismissal", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse(mockWaitingTicket);
        return jsonResponse(mockCalledTicket);
      };

      await renderPage();

      // Transition to CALLED at 10s
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.getByRole("alert")).toBeDefined();

      // Dismiss banner
      const dismissButton = screen.getByRole("button", { name: /^dismiss$/i });
      await act(async () => {
        fireEvent.click(dismissButton);
      });
      expect(screen.queryByRole("alert")).toBeNull();

      // Next poll at 20s still returns CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      // Banner remains dismissed
      expect(screen.queryByRole("alert")).toBeNull();

      // Another poll at 30s still returns CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("hides banner and resets cycle state when transitioning to SERVING", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse(mockCalledTicket);
        return jsonResponse({
          ...mockWaitingTicket,
          status: "SERVING",
        });
      };

      await renderPage();
      expect(screen.getByRole("alert")).toBeDefined();

      // Advance to trigger poll returning SERVING
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Banner must not remain visible for SERVING
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("hides banner and halts polling when ticket transitions to terminal state (COMPLETED)", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse(mockCalledTicket);
        return jsonResponse(mockCompletedTicket);
      };

      await renderPage();
      expect(screen.getByRole("alert")).toBeDefined();

      // Advance to trigger poll returning COMPLETED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(screen.queryByRole("alert")).toBeNull();
      // Polling halted
      expect(vi.getTimerCount()).toBe(0);
    });

    it("displays fallback message when counter is null", async () => {
      activeFetchHandler = async () =>
        jsonResponse({
          ...mockCalledTicket,
          counter: null,
        });

      await renderPage();

      const banner = screen.getByRole("alert");
      expect(banner).toBeDefined();
      expect(
        screen.getByText("Your turn! Please proceed to the service counter."),
      ).toBeDefined();
      expect(
        screen.getByText("Please proceed to the service counter."),
      ).toBeDefined();
    });

    it("renders visual banner even when audio playback fails or is rejected", async () => {
      mockPlayTurnChime.mockRejectedValue(new Error("AudioContext rejected"));

      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse(mockWaitingTicket);
        return jsonResponse(mockCalledTicket);
      };

      await renderPage();

      // Transition to CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Visual banner is still fully displayed despite audio rejection
      expect(screen.getByRole("alert")).toBeDefined();
      expect(
        screen.getByText("Your turn! Please proceed to Window 2."),
      ).toBeDefined();
    });
  });

  describe("Ticket Cancellation Workflow", () => {
    it("renders Cancel this ticket button when status is WAITING", async () => {
      activeFetchHandler = async () => jsonResponse(mockWaitingTicket);
      await renderPage();

      const cancelButton = screen.getByRole("button", {
        name: "Cancel this ticket",
      });
      expect(cancelButton).toBeDefined();
    });

    it("does not render Cancel this ticket button when status is not WAITING", async () => {
      activeFetchHandler = async () => jsonResponse(mockCalledTicket);
      await renderPage();

      expect(
        screen.queryByRole("button", { name: "Cancel this ticket" }),
      ).toBeNull();
    });

    it("opens confirmation dialog and allows dismissing via Keep My Place without sending request", async () => {
      activeFetchHandler = async () => jsonResponse(mockWaitingTicket);
      await renderPage();

      const openButton = screen.getByRole("button", {
        name: "Cancel this ticket",
      });
      await act(async () => {
        fireEvent.click(openButton);
      });

      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText("Cancel Ticket #42")).toBeDefined();

      const keepButton = screen.getByRole("button", {
        name: "Keep My Place",
      });
      await act(async () => {
        fireEvent.click(keepButton);
      });

      expect(screen.queryByRole("dialog")).toBeNull();

      // Verify no PATCH call was made
      const patchCalls = fetchMock.mock.calls.filter(
        ([, init]) => init?.method === "PATCH",
      );
      expect(patchCalls.length).toBe(0);
    });

    it("successfully cancels ticket, transitions UI to CANCELLED, hides cancel action, and halts polling", async () => {
      vi.useFakeTimers();

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH" && url.includes("/cancel")) {
          return jsonResponse({
            ticketNumber: 42,
            status: "CANCELLED",
            cancelledAt: new Date().toISOString(),
          });
        }
        return jsonResponse(mockWaitingTicket);
      };

      await renderPage();

      // Open dialog
      const openButton = screen.getByRole("button", {
        name: "Cancel this ticket",
      });
      await act(async () => {
        fireEvent.click(openButton);
      });

      // Confirm cancellation
      const confirmButton = screen.getByRole("button", {
        name: "Yes, Cancel Ticket",
      });
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      // Dialog is dismissed
      expect(screen.queryByRole("dialog")).toBeNull();

      // Status badge and heading update to Cancelled
      expect(screen.getByText("Cancelled")).toBeDefined();

      // Cancel button is removed
      expect(
        screen.queryByRole("button", { name: "Cancel this ticket" }),
      ).toBeNull();

      // Position metrics are unmounted
      expect(screen.queryByText("People ahead")).toBeNull();

      // Polling is halted
      expect(vi.getTimerCount()).toBe(0);
    });

    it("prevents duplicate submissions while cancellation is in progress", async () => {
      const cancelDeferred = createDeferred<Response>();
      let patchCount = 0;

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH" && url.includes("/cancel")) {
          patchCount++;
          return cancelDeferred.promise;
        }
        return jsonResponse(mockWaitingTicket);
      };

      await renderPage();

      // Open dialog
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Cancel this ticket" }),
        );
      });

      const confirmButton = screen.getByRole("button", {
        name: "Yes, Cancel Ticket",
      });

      // First click
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      expect(patchCount).toBe(1);

      // Subsequent click while in progress
      await act(async () => {
        fireEvent.click(confirmButton);
      });

      // Should still be 1 (no duplicate request)
      expect(patchCount).toBe(1);

      // Resolve cancel request
      await act(async () => {
        cancelDeferred.resolve(
          jsonResponse({
            ticketNumber: 42,
            status: "CANCELLED",
            cancelledAt: new Date().toISOString(),
          }),
        );
      });

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("displays error message in the dialog when cancellation fails", async () => {
      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH" && url.includes("/cancel")) {
          return jsonResponse({ error: "Service unavailable" }, 503);
        }
        return jsonResponse(mockWaitingTicket);
      };

      await renderPage();

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Cancel this ticket" }),
        );
      });

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Yes, Cancel Ticket" }),
        );
      });

      // Dialog stays open and shows error alert
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByRole("alert")).toBeDefined();
      expect(screen.getByText("Service unavailable")).toBeDefined();
    });

    it("handles 409 Conflict by closing dialog, showing notice banner, and refreshing ticket state to CALLED", async () => {
      let isCalled = false;
      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (init?.method === "PATCH" && url.includes("/cancel")) {
          isCalled = true;
          return jsonResponse(
            { error: "Ticket cannot be cancelled in its current state" },
            409,
          );
        }
        if (isCalled) {
          return jsonResponse(mockCalledTicket);
        }
        return jsonResponse(mockWaitingTicket);
      };

      await renderPage();

      // Open and confirm cancel
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Cancel this ticket" }),
        );
      });

      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "Yes, Cancel Ticket" }),
        );
      });

      // Dialog is closed
      expect(screen.queryByRole("dialog")).toBeNull();

      // Cancellation notice banner is displayed
      expect(
        screen.getByText(
          "This ticket can no longer be cancelled because its status has changed.",
        ),
      ).toBeDefined();

      // Refreshed status to CALLED triggers turn alert banner and chime
      expect(screen.getByRole("alert")).toBeDefined();
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);

      // Cancel button is removed
      expect(
        screen.queryByRole("button", { name: "Cancel this ticket" }),
      ).toBeNull();
    });
  });
});

