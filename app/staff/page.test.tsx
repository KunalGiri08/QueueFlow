// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import StaffOperatorPage from "./page";

// 1. Mock Next.js navigation with a stable router object identity
const mockPush = vi.fn();
const mockRouter = {
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

// 3. Mock Navbar to isolate Staff Console from global navbar links and Clerk components
vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

// Shared test data conforming strictly to Staff Console validation schemas
const mockUser = {
  id: "user-staff-1",
  name: "Jane Operator",
  email: "jane@queueflow.com",
};

const mockOrg1 = {
  id: "org-1",
  name: "Apex Healthcare",
  slug: "apex",
};

const mockOrg2 = {
  id: "org-2",
  name: "Beacon Clinic",
  slug: "beacon",
};

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

const mockCounterOrg2 = {
  id: "assign-2",
  staffId: "user-staff-1",
  counter: {
    id: "counter-2",
    name: "Desk 2",
    isActive: true,
    organizationId: "org-2",
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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("app/staff/page (Staff Operator Console)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let activeFetchHandler: (url: string, init?: RequestInit) => Promise<Response> | Response;

  // Canonical default handler supporting session, counter, queue, and active ticket endpoints
  function defaultFetchHandler(url: string, init?: RequestInit): Response {
    const method = init?.method ?? "GET";

    if (url === "/api/auth/me") {
      return jsonResponse(mockUser);
    }

    if (url === "/api/organizations") {
      return jsonResponse([mockOrg1]);
    }

    if (url === `/api/organizations/org-1/staff/user-staff-1/counters`) {
      return jsonResponse([mockCounterOrg1]);
    }

    if (url === `/api/organizations/org-2/staff/user-staff-1/counters`) {
      return jsonResponse([mockCounterOrg2]);
    }

    if (url === `/api/organizations/org-1/staff/user-staff-1/active-ticket`) {
      return jsonResponse({ ticket: null });
    }

    if (url === `/api/organizations/org-2/staff/user-staff-1/active-ticket`) {
      return jsonResponse({ ticket: null });
    }

    if (url === `/api/organizations/org-1/staff/user-staff-1/queues`) {
      return jsonResponse([mockQueueOrg1]);
    }

    if (url === `/api/organizations/org-2/staff/user-staff-1/queues`) {
      return jsonResponse([mockQueueOrg2]);
    }

    if (url === `/api/queues/queue-1`) {
      return jsonResponse({
        id: "queue-1",
        waitingCount: 3,
        currentlyServing: null,
      });
    }

    if (url === `/api/queues/queue-2`) {
      return jsonResponse({
        id: "queue-2",
        waitingCount: 1,
        currentlyServing: null,
      });
    }

    if (url === `/api/queues/queue-1/next` && method === "PATCH") {
      return jsonResponse({
        id: "ticket-101",
        number: 101,
        status: "CALLED",
        queueId: "queue-1",
        counterId: "counter-1",
        createdAt: "2026-10-19T10:00:00.000Z",
        updatedAt: "2026-10-19T10:00:00.000Z",
      });
    }

    return jsonResponse({ error: "Unhandled test route" }, 404);
  }

  beforeEach(() => {
    mockAuthState = {
      isSignedIn: true,
      isLoaded: true,
    };
    mockPush.mockReset();

    activeFetchHandler = (url, init) => defaultFetchHandler(url, init);
    fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return activeFetchHandler(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. Authentication & Session Bootstrapping", () => {
    it("redirects to sign-in when Clerk reports the user is unauthenticated", async () => {
      mockAuthState.isLoaded = true;
      mockAuthState.isSignedIn = false;

      render(<StaffOperatorPage />);

      expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fstaff");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Loading staff console")).toBeDefined();
    });

    it("shows a session error and retries when /api/auth/me fails", async () => {
      let meShouldFail = true;
      activeFetchHandler = (url, init) => {
        if (url === "/api/auth/me" && meShouldFail) {
          return jsonResponse({ error: "Internal error" }, 500);
        }
        return defaultFetchHandler(url, init);
      };

      render(<StaffOperatorPage />);

      // Error alert appears
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "Unable to load your operator session at this time. Please try again.",
      );

      // Fix endpoint and click retry button
      meShouldFail = false;
      const retryBtn = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(retryBtn);

      // Successfully recovers, displays operator name and clear error
      expect(await screen.findByText("Jane Operator")).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("2. Organization State & Tenant Isolation", () => {
    it("renders the empty-organization state when the user has no organization memberships", async () => {
      activeFetchHandler = (url, init) => {
        if (url === "/api/organizations") {
          return jsonResponse([]);
        }
        return defaultFetchHandler(url, init);
      };

      render(<StaffOperatorPage />);

      expect(
        await screen.findByRole("heading", { name: "No Organization Memberships" }),
      ).toBeDefined();
      expect(
        screen.getByText(/Your account \(jane@queueflow\.com\) is not currently a member of any organization/i),
      ).toBeDefined();
      expect(
        screen.getByRole("link", { name: "Explore Public Organizations" }),
      ).toBeDefined();
    });

    it("switches organizations without leaking the previous organization's ticket or queue data", async () => {
      const activeTicketOrg1 = {
        id: "ticket-101",
        number: 101,
        status: "CALLED",
        queueId: "queue-1",
        counterId: "counter-1",
        createdAt: "2026-10-19T10:00:00.000Z",
        updatedAt: "2026-10-19T10:05:00.000Z",
        queue: { id: "queue-1", name: "General Line" },
        service: { id: "service-1", name: "Check-in" },
        counter: { id: "counter-1", name: "Desk 1" },
      };

      activeFetchHandler = (url, init) => {
        if (url === "/api/organizations") {
          return jsonResponse([mockOrg1, mockOrg2]);
        }
        if (url === `/api/organizations/org-1/staff/user-staff-1/active-ticket`) {
          return jsonResponse({ ticket: activeTicketOrg1 });
        }
        return defaultFetchHandler(url, init);
      };

      render(<StaffOperatorPage />);

      // Initially Org 1 is active: displays ticket #101 and General Line
      expect(await screen.findByText("#101")).toBeDefined();
      expect(screen.getByText("General Line")).toBeDefined();
      expect(screen.getByText("Desk 1 (Active)")).toBeDefined();

      // Switch to Org 2
      const orgSelect = screen.getByLabelText("Select Organization");
      fireEvent.change(orgSelect, { target: { value: "org-2" } });

      // Verify Org 2 state renders cleanly without Org 1 remnants
      expect(await screen.findByRole("heading", { name: "No Active Ticket" })).toBeDefined();
      expect(await screen.findByText("Triage Line")).toBeDefined();
      expect(screen.getByText("Desk 2 (Active)")).toBeDefined();
      expect(screen.queryByText("#101")).toBeNull();
      expect(screen.queryByText("General Line")).toBeNull();
    });
  });

  describe("3. Counter Assignment & Inactivity Warning", () => {
    it("displays the correct warning when an active ticket's counter is no longer assigned", async () => {
      const ticketWithUnassignedCounter = {
        id: "ticket-77",
        number: 77,
        status: "CALLED",
        queueId: "queue-1",
        counterId: "counter-legacy-99",
        createdAt: "2026-10-19T10:00:00.000Z",
        updatedAt: "2026-10-19T10:05:00.000Z",
        queue: { id: "queue-1", name: "General Line" },
        service: { id: "service-1", name: "Check-in" },
        counter: { id: "counter-legacy-99", name: "Desk 99" },
      };

      activeFetchHandler = (url, init) => {
        if (url === `/api/organizations/org-1/staff/user-staff-1/active-ticket`) {
          return jsonResponse({ ticket: ticketWithUnassignedCounter });
        }
        // Operator is only assigned to Desk 1
        return defaultFetchHandler(url, init);
      };

      render(<StaffOperatorPage />);

      // Warning alert must render the exact canonical warning copy
      const warningAlert = await screen.findByRole("alert");
      expect(warningAlert.textContent).toContain(
        'This active ticket is tied to Counter "Desk 99", which is no longer assigned to your account in this organization.',
      );

      // Ticket #77 is still presented in the hero card
      expect(screen.getByText("#77")).toBeDefined();
      expect(screen.getByText("Counter: Desk 99")).toBeDefined();
    });
  });

  describe("4. Ticket Action Lifecycle Transitions", () => {
    it("verifies the Start Service and Complete Service transitions using actual API response shapes", async () => {
      const activeCalledTicket = {
        id: "ticket-55",
        number: 55,
        status: "CALLED",
        queueId: "queue-1",
        counterId: "counter-1",
        createdAt: "2026-10-19T10:00:00.000Z",
        updatedAt: "2026-10-19T10:00:00.000Z",
        queue: { id: "queue-1", name: "General Line" },
        service: { id: "service-1", name: "Check-in" },
        counter: { id: "counter-1", name: "Desk 1" },
      };

      activeFetchHandler = (url, init) => {
        const method = init?.method ?? "GET";

        if (url === `/api/organizations/org-1/staff/user-staff-1/active-ticket`) {
          return jsonResponse({ ticket: activeCalledTicket });
        }

        // Start service mutation
        if (url === `/api/tickets/ticket-55/start` && method === "PATCH") {
          return jsonResponse({
            id: "ticket-55",
            number: 55,
            status: "SERVING",
            queueId: "queue-1",
            counterId: "counter-1",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:02:00.000Z",
          });
        }

        // Complete service mutation
        if (url === `/api/tickets/ticket-55/complete` && method === "PATCH") {
          return jsonResponse({
            id: "ticket-55",
            number: 55,
            status: "COMPLETED",
            queueId: "queue-1",
            counterId: "counter-1",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:04:00.000Z",
          });
        }

        return defaultFetchHandler(url, init);
      };

      render(<StaffOperatorPage />);

      // Initially CALLED: displays "Called" status and "Start Service" action
      expect(await screen.findByText("#55")).toBeDefined();
      expect(screen.getByText("Called")).toBeDefined();
      expect(screen.getByText(/Updated /)).toBeDefined();
      const startBtn = screen.getByRole("button", {
        name: "Start service for ticket #55",
      });
      expect(startBtn).toBeDefined();

      // Click Start Service
      fireEvent.click(startBtn);

      // Transitions to SERVING: badge updates to "Now Serving" and action to "Complete Service"
      expect(await screen.findByText("Now Serving")).toBeDefined();
      expect(screen.getByText(/Updated /)).toBeDefined();
      expect(screen.queryByText("Start Service")).toBeNull();
      const completeBtn = screen.getByRole("button", {
        name: "Complete service for ticket #55",
      });
      expect(completeBtn).toBeDefined();

      // Click Complete Service
      fireEvent.click(completeBtn);

      // Ticket is cleared and desk returns to idle state
      expect(
        await screen.findByRole("heading", { name: "No Active Ticket" }),
      ).toBeDefined();
      expect(screen.queryByText("#55")).toBeNull();
    });
  });

  describe("5. Calling Next Ticket & 409 Conflict Self-Healing", () => {
    it("displays the error and triggers active-ticket recovery when Call Next returns 409 Conflict", async () => {
      let activeTicketAfterConflict: unknown = null;

      activeFetchHandler = (url, init) => {
        const method = init?.method ?? "GET";

        if (url === `/api/organizations/org-1/staff/user-staff-1/active-ticket`) {
          return jsonResponse({ ticket: activeTicketAfterConflict });
        }

        // Call Next returns 409 Conflict (e.g. staff already has an active ticket)
        if (url === `/api/queues/queue-1/next` && method === "PATCH") {
          // Prepare recovered ticket for the subsequent recovery GET request
          activeTicketAfterConflict = {
            id: "ticket-recovered-88",
            number: 88,
            status: "CALLED",
            queueId: "queue-1",
            counterId: "counter-1",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:05:00.000Z",
            queue: { id: "queue-1", name: "General Line" },
            service: { id: "service-1", name: "Check-in" },
            counter: { id: "counter-1", name: "Desk 1" },
          };

          return jsonResponse(
            { error: "Staff member already has an active ticket" },
            409,
          );
        }

        return defaultFetchHandler(url, init);
      };

      render(<StaffOperatorPage />);

      // Wait for organization operator data to load (queue and desk)
      expect(await screen.findByText("General Line")).toBeDefined();
      expect(screen.getByText("Desk 1 (Active)")).toBeDefined();
      expect(
        screen.getByRole("heading", { name: "No Active Ticket" }),
      ).toBeDefined();

      const callNextBtn = screen.getByRole("button", {
        name: "Call next ticket for General Line",
      });
      expect(callNextBtn).toBeDefined();

      // Click Call Next Ticket
      fireEvent.click(callNextBtn);

      // 409 conflict error banner appears
      expect(
        await screen.findByText("Unable to Call Next Ticket"),
      ).toBeDefined();
      expect(
        screen.getByText("Staff member already has an active ticket"),
      ).toBeDefined();

      // Self-healing recovery: active-ticket endpoint was called and restored ticket #88
      expect(await screen.findByText("#88")).toBeDefined();
      expect(screen.getByText("Check-in")).toBeDefined();
      expect(screen.getByText("Counter: Desk 1")).toBeDefined();
    });
  });
});
