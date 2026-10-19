// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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

// 3. Mock Navbar to isolate the tickets page from global header links and Clerk user components
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

describe("app/tickets/page (My Tickets Customer Frontend)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let activeFetchHandler: (url: string, init?: RequestInit) => Promise<Response> | Response;

  let mockConfirm: ReturnType<typeof vi.fn<() => boolean>>;

  beforeEach(() => {
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
      const actionAlert = await screen.findByRole("alert");
      expect(actionAlert.textContent).toContain(
        "This ticket can no longer be cancelled because its status has changed."
      );

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
});


