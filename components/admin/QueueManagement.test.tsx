// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { QueueManagement } from "./QueueManagement";

const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
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

const mockServices = [
  {
    id: "srv-1",
    name: "General Consultation",
    description: "Doctor consultations",
    organizationId: "org-1",
  },
  {
    id: "srv-2",
    name: "Pharmacy",
    description: "Prescription pickup",
    organizationId: "org-1",
  },
];

const mockQueuesSrv1 = [
  {
    id: "queue-1",
    name: "Standard Line",
    serviceId: "srv-1",
    nextTicketNumber: 42,
    isActive: true,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "queue-2",
    name: "Priority Line",
    serviceId: "srv-1",
    nextTicketNumber: 15,
    isActive: true,
    createdAt: "2026-03-02T10:00:00.000Z",
    updatedAt: "2026-03-02T10:00:00.000Z",
  },
];

const mockQueuesSrv2 = [
  {
    id: "queue-3",
    name: "Express Pickup",
    serviceId: "srv-2",
    nextTicketNumber: 8,
    isActive: true,
    createdAt: "2026-03-03T10:00:00.000Z",
    updatedAt: "2026-03-03T10:00:00.000Z",
  },
];

describe("components/admin/QueueManagement", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/services/") && url.includes("/queues")) {
        return jsonResponse([]);
      }
      if (url.includes("/services")) {
        return jsonResponse(mockServices);
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("Service discovery, selection, and empty states", () => {
    it("renders service loading skeleton while services are being fetched", () => {
      const deferredServices = createDeferred<Response>();
      fetchMock.mockImplementation(() => deferredServices.promise);

      render(<QueueManagement organizationId="org-1" />);

      expect(
        screen.getByLabelText("Loading service categories for queue management"),
      ).toBeDefined();
      expect(
        (screen.getByRole("button", { name: /refresh/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it("renders no-services empty state when organization has no configured services", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services")) {
          return jsonResponse([]);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);

      expect(
        await screen.findByText("No Service Categories Configured"),
      ).toBeDefined();
      expect(
        screen.getByText(
          /Queues belong to service categories\. Add at least one service category/i,
        ),
      ).toBeDefined();
    });

    it("automatically selects the first discovered service and displays its details", async () => {
      render(<QueueManagement organizationId="org-1" />);

      expect(await screen.findByText("Add Queue to General Consultation")).toBeDefined();
      expect(screen.getByText(/“Doctor consultations”/i)).toBeDefined();

      const select = screen.getByLabelText(
        /select service category/i,
      ) as HTMLSelectElement;
      expect(select.value).toBe("srv-1");
    });

    it("allows selecting a different service from dropdown and triggers queue fetch for new service", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services/srv-1/queues")) {
          return jsonResponse(mockQueuesSrv1);
        }
        if (url.includes("/services/srv-2/queues")) {
          return jsonResponse(mockQueuesSrv2);
        }
        if (url.includes("/services")) {
          return jsonResponse(mockServices);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);

      // Initially loads queues for srv-1
      expect(await screen.findByText("Standard Line")).toBeDefined();
      expect(screen.getByText("Priority Line")).toBeDefined();

      // Change service dropdown to Pharmacy (srv-2)
      const select = screen.getByLabelText(/select service category/i);
      fireEvent.change(select, { target: { value: "srv-2" } });

      // Verifies queues for srv-2 are displayed
      expect(await screen.findByText("Express Pickup")).toBeDefined();
      expect(screen.getByText("Add Queue to Pharmacy")).toBeDefined();
      expect(screen.queryByText("Standard Line")).toBeNull();
    });
  });

  describe("Queue loading, rendering, empty states, and errors", () => {
    it("renders queues loading skeleton while queues are being fetched", async () => {
      const deferredQueues = createDeferred<Response>();
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services/srv-1/queues")) {
          return deferredQueues.promise;
        }
        if (url.includes("/services")) {
          return jsonResponse(mockServices);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);

      expect(await screen.findByLabelText("Loading queues")).toBeDefined();
      expect(
        (screen.getByRole("button", { name: /refresh/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it("displays populated active queues with next ticket number badge", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services/srv-1/queues")) {
          return jsonResponse(mockQueuesSrv1);
        }
        if (url.includes("/services")) {
          return jsonResponse(mockServices);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);

      expect(await screen.findByText("Standard Line")).toBeDefined();
      expect(screen.getByText("Priority Line")).toBeDefined();
      expect(screen.getByText("#42")).toBeDefined();
      expect(screen.getByText("#15")).toBeDefined();
      expect(screen.getByText("2 active queues")).toBeDefined();
    });

    it("displays empty state when selected service has no active queues", async () => {
      render(<QueueManagement organizationId="org-1" />);

      expect(
        await screen.findByText("No Active Queues for General Consultation"),
      ).toBeDefined();
      expect(
        screen.getByText(
          /Add your first queue above to allow customers to join and staff operators to call tickets/i,
        ),
      ).toBeDefined();
    });

    it("displays error alert with retry button when queue fetch fails", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services/srv-1/queues")) {
          return new Response(JSON.stringify({ error: "Failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/services")) {
          return jsonResponse(mockServices);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);

      expect(
        await screen.findByText(
          "Unable to load queues for this service category. Please try again.",
        ),
      ).toBeDefined();

      const retryBtn = screen.getByRole("button", {
        name: /retry loading queues/i,
      });
      expect(retryBtn).toBeDefined();
    });

    it("retries fetching queues when the retry button is clicked", async () => {
      let callCount = 0;
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services/srv-1/queues")) {
          callCount++;
          if (callCount === 1) {
            return new Response(JSON.stringify({ error: "Failed" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return jsonResponse(mockQueuesSrv1);
        }
        if (url.includes("/services")) {
          return jsonResponse(mockServices);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);

      const retryBtn = await screen.findByRole("button", {
        name: /retry loading queues/i,
      });
      fireEvent.click(retryBtn);

      expect(await screen.findByText("Standard Line")).toBeDefined();
      expect(
        screen.queryByText(
          "Unable to load queues for this service category. Please try again.",
        ),
      ).toBeNull();
    });

    it("handles service fetch error with retry button", async () => {
      let callCount = 0;
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services")) {
          callCount++;
          if (callCount === 1) {
            return new Response(JSON.stringify({ error: "Server error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return jsonResponse(mockServices);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);

      expect(
        await screen.findByText(
          "Unable to load service categories at this time. Please try again.",
        ),
      ).toBeDefined();

      const retryBtn = screen.getByRole("button", {
        name: /retry loading service categories/i,
      });
      fireEvent.click(retryBtn);

      expect(await screen.findByText("Add Queue to General Consultation")).toBeDefined();
    });

    it("refresh button triggers dual refresh of services and queues", async () => {
      let servicesCalls = 0;
      let queuesCalls = 0;

      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services/srv-1/queues")) {
          queuesCalls++;
          return jsonResponse(mockQueuesSrv1);
        }
        if (url.includes("/services")) {
          servicesCalls++;
          return jsonResponse(mockServices);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);
      expect(await screen.findByText("Standard Line")).toBeDefined();

      const refreshBtn = screen.getByRole("button", {
        name: /refresh queues and service categories/i,
      });
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(servicesCalls).toBeGreaterThanOrEqual(2);
        expect(queuesCalls).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe("Queue creation form", () => {
    it("creates a queue and optimistically updates queue list on 201 success", async () => {
      let postPayload: unknown;
      let postUrl = "";

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (init?.method === "POST") {
          postUrl = url;
          postPayload = JSON.parse(init.body as string);
          return jsonResponse(
            {
              id: "new-queue-id",
              name: "Urgent Care Line",
              serviceId: "srv-1",
              nextTicketNumber: 1,
              isActive: true,
              createdAt: "2026-03-04T12:00:00.000Z",
              updatedAt: "2026-03-04T12:00:00.000Z",
            },
            201,
          );
        }
        if (url.includes("/services/srv-1/queues")) {
          return jsonResponse([]);
        }
        if (url.includes("/services")) {
          return jsonResponse(mockServices);
        }
        return jsonResponse([]);
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(
        /e\.g\., General Walk-in or Priority Desk/i,
      ) as HTMLInputElement;
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      expect((submitButton as HTMLButtonElement).disabled).toBe(true);

      fireEvent.change(input, { target: { value: "Urgent Care Line" } });
      expect((submitButton as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(submitButton);

      expect(
        await screen.findByText('Queue "Urgent Care Line" created successfully.'),
      ).toBeDefined();
      expect(screen.getByText("Urgent Care Line")).toBeDefined();
      expect(screen.getByText("#1")).toBeDefined();
      expect(input.value).toBe("");
      expect(postPayload).toEqual({ name: "Urgent Care Line" });
      expect(postUrl).toContain("/services/srv-1/queues");
    });

    it("redirects to sign-in on 401 response during queue creation", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (input.toString().includes("/services/srv-1/queues")) {
          return jsonResponse([]);
        }
        return jsonResponse(mockServices);
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Desk 1" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
    });

    it("displays error message when queue creation returns 409 conflict", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              error: "A queue with this name already exists in this service.",
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (input.toString().includes("/services/srv-1/queues")) {
          return jsonResponse([]);
        }
        return jsonResponse(mockServices);
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Duplicate Queue" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText(
          "A queue with this name already exists in this service.",
        ),
      ).toBeDefined();
    });

    it("displays field error when queue creation returns 400 validation error", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              error: "Invalid request body",
              details: {
                fieldErrors: {
                  name: ["Queue name is required"],
                },
              },
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (input.toString().includes("/services/srv-1/queues")) {
          return jsonResponse([]);
        }
        return jsonResponse(mockServices);
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Bad Name" } });
      fireEvent.click(submitButton);

      expect(await screen.findByText("Queue name is required")).toBeDefined();
    });

    it("displays error message when queue creation returns 403 forbidden", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ error: "Only organization admins can create queues" }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (input.toString().includes("/services/srv-1/queues")) {
          return jsonResponse([]);
        }
        return jsonResponse(mockServices);
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Non-Admin" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText("Only organization admins can create queues."),
      ).toBeDefined();
    });

    it("displays error message when queue creation returns 404 service not found", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ error: "Service not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (input.toString().includes("/services/srv-1/queues")) {
          return jsonResponse([]);
        }
        return jsonResponse(mockServices);
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Missing Service Queue" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText(
          "The selected service was not found. Please refresh and try again.",
        ),
      ).toBeDefined();
    });

    it("displays network error message when queue creation fails due to network failure", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          throw new Error("Network unreachable");
        }
        if (input.toString().includes("/services/srv-1/queues")) {
          return jsonResponse([]);
        }
        return jsonResponse(mockServices);
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Offline Queue" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText(
          "Failed to create queue due to a network error. Please try again.",
        ),
      ).toBeDefined();
    });

    it("synchronously blocks duplicate creation requests on rapid repeated interactions", async () => {
      const deferredCreate = createDeferred<Response>();
      let postCallCount = 0;

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          postCallCount++;
          return deferredCreate.promise;
        }
        if (input.toString().includes("/services/srv-1/queues")) {
          return jsonResponse([]);
        }
        return jsonResponse(mockServices);
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Rapid Queue" } });

      // Synchronous rapid repeated clicks
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);

      expect(postCallCount).toBe(1);

      await act(async () => {
        deferredCreate.resolve(
          jsonResponse(
            {
              id: "rapid-q-id",
              name: "Rapid Queue",
              serviceId: "srv-1",
              nextTicketNumber: 1,
              isActive: true,
              createdAt: "2026-03-04T12:00:00.000Z",
              updatedAt: "2026-03-04T12:00:00.000Z",
            },
            201,
          ),
        );
      });

      expect(
        await screen.findByText('Queue "Rapid Queue" created successfully.'),
      ).toBeDefined();
    });
  });

  describe("Organization and service switching, races, and cancellation", () => {
    it("resets form, selected service, queues, and errors immediately when organizationId changes", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ error: "Duplicate queue" }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        return jsonResponse(mockServices);
      });

      const { rerender } = render(<QueueManagement organizationId="org-1" />);
      await screen.findByText("No Active Queues for General Consultation");

      const input = screen.getByPlaceholderText(
        /e\.g\., General Walk-in or Priority Desk/i,
      ) as HTMLInputElement;
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Draft Queue" } });
      fireEvent.click(submitButton);

      expect(await screen.findByText("Duplicate queue")).toBeDefined();

      // Switch organizationId to org-2
      rerender(<QueueManagement organizationId="org-2" />);

      // Wait for org-2 services to load and re-render the queue creation card
      expect(await screen.findByText("Add Queue to General Consultation")).toBeDefined();

      const newInput = screen.getByPlaceholderText(
        /e\.g\., General Walk-in or Priority Desk/i,
      ) as HTMLInputElement;

      // Form errors and draft input must be cleared immediately
      expect(newInput.value).toBe("");
      expect(screen.queryByText("Duplicate queue")).toBeNull();
    });

    it("discards in-flight queue creation if organization was switched while POST was pending", async () => {
      const deferredCreate = createDeferred<Response>();

      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return deferredCreate.promise;
        }
        return Promise.resolve(jsonResponse(mockServices));
      });

      // 1. Initial render with org-A
      const { rerender } = render(<QueueManagement organizationId="org-A" />);
      await screen.findByText("No Active Queues for General Consultation");

      // 2. Start creating queue on org-A
      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Late Org A Queue" } });
      fireEvent.click(submitButton);

      // 3. User switches to org-B while POST is in-flight
      rerender(<QueueManagement organizationId="org-B" />);

      // 4. Creation for org-A resolves with 201
      deferredCreate.resolve(
        jsonResponse(
          {
            id: "late-q-id",
            name: "Late Org A Queue",
            serviceId: "srv-1",
            nextTicketNumber: 1,
            isActive: true,
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
          201,
        ),
      );

      // Verify Late Org A Queue is NOT added to org-B and no success message appears
      expect(screen.queryByText("Late Org A Queue")).toBeNull();
      expect(
        screen.queryByText('Queue "Late Org A Queue" created successfully.'),
      ).toBeNull();
    });

    it("discards in-flight queue creation if selected service was switched while POST was pending", async () => {
      const deferredCreate = createDeferred<Response>();

      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (init?.method === "POST") {
          return deferredCreate.promise;
        }
        if (url.includes("/services/srv-1/queues")) {
          return Promise.resolve(jsonResponse(mockQueuesSrv1));
        }
        if (url.includes("/services/srv-2/queues")) {
          return Promise.resolve(jsonResponse(mockQueuesSrv2));
        }
        return Promise.resolve(jsonResponse(mockServices));
      });

      render(<QueueManagement organizationId="org-1" />);
      expect(await screen.findByText("Standard Line")).toBeDefined();

      // Start queue creation on srv-1
      const input = screen.getByPlaceholderText(/e\.g\., General Walk-in or Priority Desk/i);
      const submitButton = screen.getByRole("button", {
        name: /create queue/i,
      });

      fireEvent.change(input, { target: { value: "Late Srv1 Queue" } });
      fireEvent.click(submitButton);

      // While POST is in-flight, switch service dropdown to srv-2
      const select = screen.getByLabelText(/select service category/i);
      fireEvent.change(select, { target: { value: "srv-2" } });

      expect(await screen.findByText("Express Pickup")).toBeDefined();

      // POST for srv-1 resolves
      deferredCreate.resolve(
        jsonResponse(
          {
            id: "late-srv1-id",
            name: "Late Srv1 Queue",
            serviceId: "srv-1",
            nextTicketNumber: 1,
            isActive: true,
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
          201,
        ),
      );

      // Verify Late Srv1 Queue is NOT added to srv-2 list and no success banner shown
      expect(screen.queryByText("Late Srv1 Queue")).toBeNull();
      expect(
        screen.queryByText('Queue "Late Srv1 Queue" created successfully.'),
      ).toBeNull();
    });

    it("disregards stale out-of-order queue GET responses when switching services", async () => {
      const deferredQ1 = createDeferred<Response>();
      const deferredQ2 = createDeferred<Response>();

      fetchMock.mockImplementation((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/services/srv-1/queues")) {
          return deferredQ1.promise;
        }
        if (url.includes("/services/srv-2/queues")) {
          return deferredQ2.promise;
        }
        return Promise.resolve(jsonResponse(mockServices));
      });

      render(<QueueManagement organizationId="org-1" />);
      await screen.findByLabelText("Loading queues");

      // Switch to srv-2 before srv-1 responds
      const select = screen.getByLabelText(/select service category/i);
      fireEvent.change(select, { target: { value: "srv-2" } });

      // srv-2 responds first
      deferredQ2.resolve(jsonResponse(mockQueuesSrv2));
      expect(await screen.findByText("Express Pickup")).toBeDefined();

      // srv-1 responds later (stale response)
      deferredQ1.resolve(jsonResponse(mockQueuesSrv1));

      // Express Pickup remains and Standard Line is not rendered
      expect(screen.getByText("Express Pickup")).toBeDefined();
      expect(screen.queryByText("Standard Line")).toBeNull();
    });

    it("aborts pending GET requests on unmount and handles AbortError silently", () => {
      let capturedSignal: AbortSignal | null | undefined;
      const deferred = createDeferred<Response>();
      fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
        capturedSignal = init?.signal;
        return deferred.promise;
      });

      const { unmount } = render(<QueueManagement organizationId="org-1" />);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      unmount();

      expect(capturedSignal?.aborted).toBe(true);

      const abortError = new Error("The user aborted a request.");
      abortError.name = "AbortError";
      deferred.reject(abortError);

      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
