// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import MyTicketsPage from "./page";

// 1. Mock Next.js navigation with a stable router object identity
const mockPush = vi.fn();
let mockRouter = {
  push: mockPush,
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// 2. Mock Clerk auth state
let mockAuthState = {
  isSignedIn: true,
  isLoaded: true,
};

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockAuthState,
}));

// 3. Mock notification audio chime
const { mockPlayTurnChime } = vi.hoisted(() => ({
  mockPlayTurnChime: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/audio/notification-sound", () => ({
  playTurnChime: mockPlayTurnChime,
}));

// 4. Mock Navbar to isolate the tickets page from global header links and Clerk user components
vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
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

// Canonical mock tickets adhering to CustomerTicket schema
const mockWaitingTicket = {
  id: "ticket-1",
  number: 42,
  status: "WAITING",
  trackingToken: "token-wait-42",
  createdAt: "2026-10-18T18:30:00.000Z",
  updatedAt: "2026-10-18T18:30:00.000Z",
  queue: {
    id: "queue-1",
    name: "Walk-in Queue",
    service: {
      id: "service-1",
      name: "General Medicine",
      organization: {
        id: "org-1",
        name: "City Health Clinic",
      },
    },
  },
};

const mockServingTicket = {
  id: "ticket-2",
  number: 105,
  status: "SERVING",
  trackingToken: "token-serve-105",
  createdAt: "2026-10-18T19:00:00.000Z",
  updatedAt: "2026-10-18T19:15:00.000Z",
  queue: {
    id: "queue-2",
    name: "Express Desk",
    service: {
      id: "service-2",
      name: "Pharmacy",
      organization: {
        id: "org-1",
        name: "City Health Clinic",
      },
    },
  },
};

const mockCompletedTicketWithoutToken = {
  id: "ticket-3",
  number: 88,
  status: "COMPLETED",
  trackingToken: null,
  createdAt: "2026-10-17T12:00:00.000Z",
  updatedAt: "2026-10-17T12:30:00.000Z",
  queue: {
    id: "queue-3",
    name: "Consultation A",
    service: {
      id: "service-3",
      name: "Dentistry",
      organization: {
        id: "org-2",
        name: "Downtown Dental",
      },
    },
  },
};

const mockCalledTicket = {
  id: "ticket-called-1",
  number: 55,
  status: "CALLED",
  trackingToken: "token-call-55",
  createdAt: "2026-10-18T18:45:00.000Z",
  updatedAt: "2026-10-18T19:00:00.000Z",
  counter: {
    name: "Counter 2",
  },
  queue: {
    id: "queue-1",
    name: "Walk-in Queue",
    service: {
      id: "service-1",
      name: "General Medicine",
      organization: {
        id: "org-1",
        name: "City Health Clinic",
      },
    },
  },
};

describe("app/tickets/page (My Tickets Customer Frontend)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let activeFetchHandler: (url: string, init?: RequestInit) => Promise<Response> | Response;

  let mockConfirm: ReturnType<typeof vi.fn<() => boolean>>;

  beforeEach(() => {
    mockPlayTurnChime.mockClear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "visible",
    });
    mockAuthState = {
      isSignedIn: true,
      isLoaded: true,
    };
    mockPush.mockReset();
    mockConfirm = vi.fn(() => true);
    window.confirm = mockConfirm;

    activeFetchHandler = async (url: string) => {
      if (url === "/api/tickets") {
        return jsonResponse([mockWaitingTicket]);
      }
      return jsonResponse({ error: "Not found" }, 404);
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

  describe("Authentication and session management", () => {
    it("renders loading skeleton and does not redirect while Clerk authentication is loading", () => {
      mockAuthState = {
        isSignedIn: false,
        isLoaded: false,
      };

      render(<MyTicketsPage />);

      expect(screen.getByLabelText("Loading your tickets")).toBeDefined();
      expect(mockPush).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redirects to sign-in with return URL when Clerk reports user is unauthenticated", () => {
      mockAuthState = {
        isSignedIn: false,
        isLoaded: true,
      };

      render(<MyTicketsPage />);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Ftickets");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redirects to sign-in when /api/tickets returns 401 Unauthorized", async () => {
      activeFetchHandler = async () => jsonResponse({ error: "Unauthorized" }, 401);

      render(<MyTicketsPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Ftickets");
      });
    });
  });

  describe("Initial ticket fetching and loading state", () => {
    it("renders loading skeleton while tickets are in flight", () => {
      const deferred = createDeferred<Response>();
      activeFetchHandler = () => deferred.promise;

      render(<MyTicketsPage />);

      expect(screen.getByLabelText("Loading your tickets")).toBeDefined();
      expect(screen.queryByText("#42")).toBeNull();
    });

    it("displays customer tickets with formatted metadata, status badge, and tracking link", async () => {
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          return jsonResponse([mockWaitingTicket, mockServingTicket]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyTicketsPage />);

      expect(await screen.findByText("#42")).toBeDefined();
      expect(screen.getByText("#105")).toBeDefined();

      // Verify status badge labels
      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(screen.getByText("Now Serving")).toBeDefined();

      // Verify organization and service hierarchy
      expect(screen.getAllByText("City Health Clinic").length).toBe(2);
      expect(screen.getByText(/General Medicine • Walk-in Queue/i)).toBeDefined();
      expect(screen.getByText(/Pharmacy • Express Desk/i)).toBeDefined();

      // Verify date formatting rendered
      expect(screen.getAllByText(/Joined/i).length).toBe(2);

      // Verify tracking link rendered
      const trackLinks = screen.getAllByRole("link", { name: /track status/i });
      expect(trackLinks.length).toBe(2);
      expect(trackLinks[0].getAttribute("href")).toBe("/tickets/track/token-wait-42");
      expect(trackLinks[1].getAttribute("href")).toBe("/tickets/track/token-serve-105");

      // Verify WAITING ticket has Cancel button, but SERVING ticket does not
      const cancelButtons = screen.getAllByRole("button", { name: /cancel ticket/i });
      expect(cancelButtons.length).toBe(1);
    });

    it("renders fallback text when ticket has null or empty tracking token", async () => {
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          return jsonResponse([mockCompletedTicketWithoutToken]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyTicketsPage />);

      expect(await screen.findByText("#88")).toBeDefined();
      expect(screen.getByText("Completed")).toBeDefined();
      expect(screen.getByText("Tracking unavailable")).toBeDefined();
      expect(screen.queryByRole("link", { name: /track status/i })).toBeNull();
    });
  });

  describe("Empty state", () => {
    it("displays empty state card with link to explore organizations when user has no tickets", async () => {
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          return jsonResponse([]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyTicketsPage />);

      expect(await screen.findByRole("heading", { name: /no tickets yet/i, level: 2 })).toBeDefined();
      expect(screen.getByText(/You haven't joined any queues yet/i)).toBeDefined();

      const exploreLink = screen.getByRole("link", { name: /explore organizations/i });
      expect(exploreLink).toBeDefined();
      expect(exploreLink.getAttribute("href")).toBe("/organizations");
    });
  });

  describe("Error handling and retry", () => {
    it("displays error alert when /api/tickets request fails with a server error", async () => {
      activeFetchHandler = async () => jsonResponse({ error: "Internal server error" }, 500);

      render(<MyTicketsPage />);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Unable to load your tickets at this time. Please try again.");

      const retryBtn = screen.getByRole("button", { name: /retry/i });
      expect(retryBtn).toBeDefined();
    });

    it("recovers and displays tickets when user clicks Retry following an error", async () => {
      let callCount = 0;
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          callCount++;
          if (callCount === 1) {
            return jsonResponse({ error: "Internal server error" }, 500);
          }
          return jsonResponse([mockWaitingTicket]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyTicketsPage />);

      const retryBtn = await screen.findByRole("button", { name: /retry/i });
      expect(screen.getByRole("alert")).toBeDefined();

      fireEvent.click(retryBtn);

      expect(await screen.findByText("#42")).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(callCount).toBe(2);
    });
  });

  describe("Ticket cancellation flow", () => {
    it("cancels a WAITING ticket after user confirms dialog, updating status to CANCELLED and removing cancel button", async () => {
      mockConfirm.mockReturnValue(true);
      let patchCalled = false;

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/tickets" && (!init || !init.method || init.method === "GET")) {
          return jsonResponse([mockWaitingTicket]);
        }
        if (url === `/api/tickets/${encodeURIComponent(mockWaitingTicket.id)}/cancel` && init?.method === "PATCH") {
          patchCalled = true;
          return jsonResponse({
            ...mockWaitingTicket,
            status: "CANCELLED",
          });
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyTicketsPage />);

      const cancelBtn = await screen.findByRole("button", { name: /cancel ticket/i });
      fireEvent.click(cancelBtn);

      expect(mockConfirm).toHaveBeenCalledWith(
        "Are you sure you want to cancel ticket #42? You will lose your position in line."
      );

      await waitFor(() => {
        expect(patchCalled).toBe(true);
      });

      // Ticket status badge updates to Cancelled
      expect(await screen.findByText("Cancelled")).toBeDefined();
      // Cancel button is removed for CANCELLED status
      expect(screen.queryByRole("button", { name: /cancel ticket/i })).toBeNull();
    });

    it("does not send cancellation request if user rejects the confirmation dialog", async () => {
      mockConfirm.mockReturnValue(false);
      let patchCalled = false;

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/tickets") {
          return jsonResponse([mockWaitingTicket]);
        }
        if (init?.method === "PATCH") {
          patchCalled = true;
          return jsonResponse({});
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyTicketsPage />);

      const cancelBtn = await screen.findByRole("button", { name: /cancel ticket/i });
      fireEvent.click(cancelBtn);

      expect(mockConfirm).toHaveBeenCalled();
      expect(patchCalled).toBe(false);
      expect(screen.getByRole("button", { name: /cancel ticket/i })).toBeDefined();
      expect(screen.getByText("Waiting in Line")).toBeDefined();
    });

    it("handles 409 conflict during cancellation: displays conflict message and refreshes ticket list", async () => {
      mockConfirm.mockReturnValue(true);
      let getCallCount = 0;

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/tickets" && (!init || !init.method || init.method === "GET")) {
          getCallCount++;
          if (getCallCount === 1) {
            // First load: ticket is still WAITING
            return jsonResponse([mockWaitingTicket]);
          }
          // Second load after 409: ticket has been CALLED by staff
          return jsonResponse([
            {
              ...mockWaitingTicket,
              status: "CALLED",
            },
          ]);
        }

        if (url === `/api/tickets/${encodeURIComponent(mockWaitingTicket.id)}/cancel` && init?.method === "PATCH") {
          return jsonResponse(
            { error: "Ticket cannot be cancelled in its current state" },
            409
          );
        }

        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyTicketsPage />);

      const cancelBtn = await screen.findByRole("button", { name: /cancel ticket/i });
      fireEvent.click(cancelBtn);

      // Verify the 409 conflict message appears in an alert
      const actionAlert = await screen.findByText(
        "This ticket can no longer be cancelled because its status has changed."
      );
      expect(actionAlert.getAttribute("role")).toBe("alert");

      // Verify background re-fetch happened and status updated to CALLED
      await waitFor(() => {
        expect(getCallCount).toBe(2);
      });
      expect(await screen.findByText("Ticket Called")).toBeDefined();
      // Cancel button is gone because ticket is no longer WAITING
      expect(screen.queryByRole("button", { name: /cancel ticket/i })).toBeNull();
    });

    it("displays error message when cancellation fails with a server error", async () => {
      mockConfirm.mockReturnValue(true);

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/tickets") {
          return jsonResponse([mockWaitingTicket]);
        }
        if (init?.method === "PATCH") {
          return jsonResponse({ error: "Database unavailable" }, 500);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyTicketsPage />);

      const cancelBtn = await screen.findByRole("button", { name: /cancel ticket/i });
      fireEvent.click(cancelBtn);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Database unavailable");
      // Ticket remains WAITING
      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(screen.getByRole("button", { name: /cancel ticket/i })).toBeDefined();
    });
  });

  describe("Concurrency control, request cancellation, and stale-response protection", () => {
    it("aborts in-flight request and discards stale response when a newer fetch resolves first", async () => {
      const deferredFirst = createDeferred<Response>();
      const deferredSecond = createDeferred<Response>();
      const capturedSignals: AbortSignal[] = [];

      let callCount = 0;
      activeFetchHandler = async (_url: string, init?: RequestInit) => {
        callCount++;
        if (init?.signal) {
          capturedSignals.push(init.signal);
        }
        if (callCount === 1) {
          return deferredFirst.promise;
        }
        return deferredSecond.promise;
      };

      const { rerender } = render(<MyTicketsPage />);

      await waitFor(() => {
        expect(capturedSignals.length).toBe(1);
      });
      expect(capturedSignals[0].aborted).toBe(false);

      // Trigger a second fetch via router reference change
      mockRouter = { push: mockPush };
      rerender(<MyTicketsPage />);

      await waitFor(() => {
        expect(capturedSignals.length).toBe(2);
      });

      // Request 1 was aborted when request 2 started
      expect(capturedSignals[0].aborted).toBe(true);
      expect(capturedSignals[1].aborted).toBe(false);

      // Request 2 resolves first with newer ticket (#105)
      deferredSecond.resolve(jsonResponse([mockServingTicket]));

      expect(await screen.findByText("#105")).toBeDefined();
      expect(screen.getByText("Now Serving")).toBeDefined();

      // Request 1 resolves later with stale ticket (#42)
      deferredFirst.resolve(jsonResponse([mockWaitingTicket]));

      // Verify stale ticket #42 does NOT overwrite ticket #105
      await waitFor(() => {
        expect(screen.queryByText("#42")).toBeNull();
      });
      expect(screen.getByText("#105")).toBeDefined();
    });

    it("aborts in-flight request when component unmounts", async () => {
      let capturedSignal: AbortSignal | null | undefined;

      activeFetchHandler = async (_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal;
        return createDeferred<Response>().promise;
      };

      const { unmount } = render(<MyTicketsPage />);

      await waitFor(() => {
        expect(capturedSignal).toBeDefined();
      });
      expect(capturedSignal!.aborted).toBe(false);

      unmount();

      expect(capturedSignal!.aborted).toBe(true);
    });

    it("does not display an error alert when an in-flight request is aborted", async () => {
      let capturedSignal: AbortSignal | null | undefined;

      activeFetchHandler = async (_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal;
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The user aborted a request.", "AbortError"));
          });
        });
      };

      const { rerender } = render(<MyTicketsPage />);

      await waitFor(() => {
        expect(capturedSignal).toBeDefined();
      });

      // Trigger newer fetch to abort the in-flight request
      mockRouter = { push: mockPush };
      rerender(<MyTicketsPage />);

      await waitFor(() => {
        expect(capturedSignal!.aborted).toBe(true);
      });

      // Verify AbortError is silently ignored and does not render an error alert
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("Automatic background polling and visibility lifecycle", () => {
    it("automatically refreshes active tickets every 10 seconds", async () => {
      vi.useFakeTimers();
      let pollCount = 0;
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          pollCount++;
          if (pollCount === 1) {
            return jsonResponse([mockWaitingTicket]);
          }
          return jsonResponse([
            {
              ...mockWaitingTicket,
              status: "CALLED",
            },
          ]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(pollCount).toBe(1);

      // Advance 10s to trigger background poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(pollCount).toBe(2);
      expect(screen.getByText("Ticket Called")).toBeDefined();
    });

    it("does not continuously poll when customer has no active tickets", async () => {
      vi.useFakeTimers();
      let pollCount = 0;
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          pollCount++;
          return jsonResponse([mockCompletedTicketWithoutToken]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(screen.getByText("Completed")).toBeDefined();
      expect(pollCount).toBe(1);
      expect(vi.getTimerCount()).toBe(0);

      // Advance 30s
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      // No background poll occurred
      expect(pollCount).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("pauses polling while document visibility is hidden", async () => {
      vi.useFakeTimers();
      let pollCount = 0;
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          pollCount++;
          return jsonResponse([mockWaitingTicket]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(pollCount).toBe(1);

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

      // Advance 30s while hidden
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      expect(pollCount).toBe(1);
    });

    it("immediately refreshes tickets when tab becomes visible and resumes 10s cadence", async () => {
      vi.useFakeTimers();
      let pollCount = 0;
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          pollCount++;
          if (pollCount === 1) return jsonResponse([mockWaitingTicket]);
          if (pollCount === 2) return jsonResponse([mockServingTicket]);
          return jsonResponse([mockWaitingTicket]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(pollCount).toBe(1);
      expect(screen.getByText("#42")).toBeDefined();

      // Tab hidden
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
      expect(pollCount).toBe(1);

      // Tab becomes visible
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Immediate refresh happened
      expect(pollCount).toBe(2);
      expect(screen.getByText("#105")).toBeDefined();

      // Cadence resumes after 10s
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(pollCount).toBe(3);
    });

    it("cleans up polling timers and event listeners on unmount", async () => {
      vi.useFakeTimers();
      activeFetchHandler = async () => jsonResponse([mockWaitingTicket]);

      let renderResult!: ReturnType<typeof render>;
      await act(async () => {
        renderResult = render(<MyTicketsPage />);
      });

      expect(vi.getTimerCount()).toBe(1);

      act(() => {
        renderResult.unmount();
      });

      expect(vi.getTimerCount()).toBe(0);

      const callsBefore = fetchMock.mock.calls.length;
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fetchMock.mock.calls.length).toBe(callsBefore);
    });

    it("preserves existing ticket list and does not render error alert when background poll fails", async () => {
      vi.useFakeTimers();
      let pollCount = 0;
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          pollCount++;
          if (pollCount === 1) return jsonResponse([mockWaitingTicket]);
          return jsonResponse({ error: "Temporary error" }, 500);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(screen.getByText("#42")).toBeDefined();
      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();

      // Trigger failing poll at 10s
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Tickets preserved, no disruptive error alert displayed
      expect(screen.getByText("#42")).toBeDefined();
      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();

      // Recover on subsequent poll
      activeFetchHandler = async () => jsonResponse([mockServingTicket]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(screen.getByText("#105")).toBeDefined();
      expect(screen.getByText("Now Serving")).toBeDefined();
    });

    it("stops recurring polling when ticket status transitions from active to terminal", async () => {
      vi.useFakeTimers();
      let pollCount = 0;
      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          pollCount++;
          if (pollCount === 1) return jsonResponse([mockWaitingTicket]);
          // Poll reports ticket has completed
          return jsonResponse([
            {
              ...mockWaitingTicket,
              status: "COMPLETED",
            },
          ]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(pollCount).toBe(1);

      // Poll at 10s reports ticket COMPLETED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(pollCount).toBe(2);
      expect(screen.getByText("Completed")).toBeDefined();
      expect(vi.getTimerCount()).toBe(0);

      // Advance another 30 seconds; verify no further polls occur
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      expect(pollCount).toBe(2);
    });

    it("stops polling immediately when user cancels their only active ticket", async () => {
      vi.useFakeTimers();
      mockConfirm.mockReturnValue(true);

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/tickets") {
          return jsonResponse([mockWaitingTicket]);
        }
        if (url.includes("/cancel") && init?.method === "PATCH") {
          return jsonResponse({
            ...mockWaitingTicket,
            status: "CANCELLED",
          });
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(screen.getByText("Waiting in Line")).toBeDefined();
      expect(vi.getTimerCount()).toBe(1);

      // User cancels ticket
      const cancelBtn = screen.getByRole("button", { name: /cancel ticket/i });
      await act(async () => {
        fireEvent.click(cancelBtn);
      });

      expect(screen.getByText("Cancelled")).toBeDefined();
      // No active tickets remain, timer is cleared
      expect(vi.getTimerCount()).toBe(0);

      // Advance 30s; no polls fire
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/tickets").length).toBe(1);
    });

    it("prevents stale background poll responses from overwriting newer ticket state", async () => {
      vi.useFakeTimers();
      let resolveSlowPoll!: (res: Response) => void;
      let callCount = 0;

      activeFetchHandler = async (url: string) => {
        if (url === "/api/tickets") {
          callCount++;
          if (callCount === 1) return jsonResponse([mockWaitingTicket]);
          if (callCount === 2) {
            return new Promise((resolve) => {
              resolveSlowPoll = resolve;
            });
          }
          return jsonResponse([mockServingTicket]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(screen.getByText("#42")).toBeDefined();

      // Trigger background poll at 10s (callCount 2, pending)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(callCount).toBe(2);

      // User performs manual retry/refresh or tab visibility refresh
      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          writable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(callCount).toBe(3);
      expect(screen.getByText("#105")).toBeDefined();

      // Now resolve slow background poll with older ticket (#42)
      await act(async () => {
        resolveSlowPoll(jsonResponse([mockWaitingTicket]));
      });

      // Stale ticket does NOT overwrite newer ticket
      expect(screen.getByText("#105")).toBeDefined();
      expect(screen.queryByText("#42")).toBeNull();
    });
  });

  describe("Turn Notifications on Authenticated Dashboard", () => {
    it("displays banner and plays chime once when a ticket transitions from WAITING to CALLED during polling", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse([mockWaitingTicket]);
        return jsonResponse([
          {
            ...mockWaitingTicket,
            status: "CALLED",
            counter: { name: "Room 101" },
          },
        ]);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });

      expect(screen.getByText("#42")).toBeDefined();
      expect(mockPlayTurnChime).not.toHaveBeenCalled();
      expect(screen.queryByText(/Your turn/i)).toBeNull();

      // Advance timer for background poll (10s)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(
        screen.getByText("Your turn! Please proceed to Room 101."),
      ).toBeDefined();
      expect(screen.getByText("Room 101")).toBeDefined();
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);
    });

    it("does not replay chime on repeated background polling when ticket remains CALLED", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse([mockWaitingTicket]);
        return jsonResponse([
          {
            ...mockWaitingTicket,
            status: "CALLED",
            counter: { name: "Room 101" },
          },
        ]);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });
      expect(screen.getByText("#42")).toBeDefined();

      // Poll 1 (10s): transitions to CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);

      // Poll 2 (20s): still CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      // Poll 3 (30s): still CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);
    });

    it("initial load with ticket already CALLED displays the banner without autoplaying chime", async () => {
      activeFetchHandler = async () => jsonResponse([mockCalledTicket]);

      render(<MyTicketsPage />);

      expect(
        await screen.findByText("Your turn! Please proceed to Counter 2."),
      ).toBeDefined();
      expect(screen.getByText("Counter 2")).toBeDefined();
      expect(mockPlayTurnChime).not.toHaveBeenCalled();
    });

    it("dismissing banner removes it from UI and keeps it dismissed across subsequent polls", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse([mockWaitingTicket]);
        return jsonResponse([
          {
            ...mockWaitingTicket,
            status: "CALLED",
            counter: { name: "Counter 1" },
          },
        ]);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });
      expect(screen.getByText("#42")).toBeDefined();

      // Advance to 10s: transitions to CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(
        screen.getByText("Your turn! Please proceed to Counter 1."),
      ).toBeDefined();

      // Dismiss banner
      const dismissBtn = screen.getByRole("button", { name: /^dismiss$/i });
      await act(async () => {
        fireEvent.click(dismissBtn);
      });
      expect(screen.queryByText(/Your turn/i)).toBeNull();

      // Advance to 20s and 30s: ticket is still CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.queryByText(/Your turn/i)).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.queryByText(/Your turn/i)).toBeNull();
    });

    it("transitioning away from CALLED and then called again triggers a new notification and plays chime", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1) return jsonResponse([mockWaitingTicket]);
        if (pollCount === 2)
          return jsonResponse([{ ...mockWaitingTicket, status: "CALLED" }]);
        if (pollCount === 3)
          return jsonResponse([{ ...mockWaitingTicket, status: "SERVING" }]);
        return jsonResponse([{ ...mockWaitingTicket, status: "CALLED" }]);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });
      expect(screen.getByText("#42")).toBeDefined();

      // Poll 1 (10s) -> CALLED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Your turn/i)).toBeDefined();

      // Dismiss banner
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^dismiss$/i }));
      });
      expect(screen.queryByText(/Your turn/i)).toBeNull();

      // Poll 2 (20s) -> SERVING
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.queryByText(/Your turn/i)).toBeNull();

      // Poll 3 (30s) -> CALLED again
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(screen.getByText(/Your turn/i)).toBeDefined();
      expect(mockPlayTurnChime).toHaveBeenCalledTimes(2);
    });

    it("handles multiple tickets independently with distinct counter information and individual dismissals", async () => {
      const ticket1 = {
        ...mockWaitingTicket,
        id: "t-1",
        number: 10,
        status: "CALLED",
        counter: { name: "Counter Alpha" },
      };
      const ticket2 = {
        ...mockWaitingTicket,
        id: "t-2",
        number: 20,
        status: "CALLED",
        counter: { name: "Counter Beta" },
      };

      activeFetchHandler = async () => jsonResponse([ticket1, ticket2]);

      render(<MyTicketsPage />);

      expect(await screen.findByText("Ticket #10")).toBeDefined();
      expect(
        screen.getByText("Your turn! Please proceed to Counter Alpha."),
      ).toBeDefined();

      expect(screen.getByText("Ticket #20")).toBeDefined();
      expect(
        screen.getByText("Your turn! Please proceed to Counter Beta."),
      ).toBeDefined();

      // Dismiss only the first banner
      const dismissButtons = screen.getAllByRole("button", { name: /^dismiss$/i });
      await act(async () => {
        fireEvent.click(dismissButtons[0]);
      });

      // Ticket 10 banner is dismissed, Ticket 20 banner remains visible
      expect(
        screen.queryByText("Your turn! Please proceed to Counter Alpha."),
      ).toBeNull();
      expect(
        screen.getByText("Your turn! Please proceed to Counter Beta."),
      ).toBeDefined();
    });

    it("displays fallback message when counter is null or undefined", async () => {
      const ticketWithoutCounter = {
        ...mockWaitingTicket,
        status: "CALLED",
        counter: null,
      };

      activeFetchHandler = async () => jsonResponse([ticketWithoutCounter]);

      render(<MyTicketsPage />);

      expect(
        await screen.findByText("Your turn! Please proceed to the service counter."),
      ).toBeDefined();
      expect(
        screen.getByText("Please proceed to the service counter."),
      ).toBeDefined();
    });

    it("cleans up banners and halts polling when ticket transitions to terminal state (COMPLETED)", async () => {
      vi.useFakeTimers();

      let pollCount = 0;
      activeFetchHandler = async () => {
        pollCount++;
        if (pollCount === 1)
          return jsonResponse([{ ...mockWaitingTicket, status: "CALLED" }]);
        return jsonResponse([mockCompletedTicketWithoutToken]);
      };

      await act(async () => {
        render(<MyTicketsPage />);
      });
      expect(screen.getByText(/Your turn/i)).toBeDefined();

      // Advance to poll (10s) returning COMPLETED
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });

      // Banner is removed
      expect(screen.queryByText(/Your turn/i)).toBeNull();
      // Polling halts because no active tickets remain
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});



