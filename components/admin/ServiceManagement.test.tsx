// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { ServiceManagement } from "./ServiceManagement";

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
    name: "Consultation",
    description: "Walk-in general consultations",
    organizationId: "org-1",
    isActive: true,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "srv-2",
    name: "Pharmacy",
    description: null,
    organizationId: "org-1",
    isActive: true,
    createdAt: "2026-03-02T10:00:00.000Z",
    updatedAt: "2026-03-02T10:00:00.000Z",
  },
];

describe("components/admin/ServiceManagement", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async () => {
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

  describe("Initial service fetching and loading states", () => {
    it("renders loading skeleton while services are being fetched", () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockImplementation(() => deferred.promise);

      render(<ServiceManagement organizationId="org-1" />);

      expect(screen.getByLabelText("Loading service categories")).toBeDefined();
      expect(
        (screen.getByRole("button", { name: /refresh/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it("displays the returned services when fetching succeeds", async () => {
      fetchMock.mockResolvedValue(jsonResponse(mockServices));

      render(<ServiceManagement organizationId="org-1" />);

      expect(await screen.findByText("Consultation")).toBeDefined();
      expect(screen.getByText("Walk-in general consultations")).toBeDefined();
      expect(screen.getByText("Pharmacy")).toBeDefined();
      expect(screen.getByText("No description provided")).toBeDefined();
      expect(screen.getByText("2 services")).toBeDefined();
      expect(screen.queryByLabelText("Loading service categories")).toBeNull();
    });

    it("displays empty state when organization has no configured services", async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));

      render(<ServiceManagement organizationId="org-1" />);

      expect(
        await screen.findByText("No Service Categories Configured"),
      ).toBeDefined();
      expect(
        screen.getByText(
          /Add your first service category above\. Queues and appointments require at least one service category\./i,
        ),
      ).toBeDefined();
      expect(screen.getByText("0 services")).toBeDefined();
    });

    it("displays an error alert with retry button when initial fetch fails", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<ServiceManagement organizationId="org-1" />);

      expect(
        await screen.findByText(
          "Unable to load services at this time. Please try again.",
        ),
      ).toBeDefined();

      const retryBtn = screen.getByRole("button", {
        name: /retry loading services/i,
      });
      expect(retryBtn).toBeDefined();
    });

    it("retries fetching when the retry button is clicked", async () => {
      let callCount = 0;
      fetchMock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: "Failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return jsonResponse(mockServices);
      });

      render(<ServiceManagement organizationId="org-1" />);

      const retryBtn = await screen.findByRole("button", {
        name: /retry loading services/i,
      });
      fireEvent.click(retryBtn);

      expect(await screen.findByText("Consultation")).toBeDefined();
      expect(
        screen.queryByText(
          "Unable to load services at this time. Please try again.",
        ),
      ).toBeNull();
    });

    it("aborts pending GET request on unmount and handles AbortError silently without showing error alert", () => {
      let capturedSignal: AbortSignal | null | undefined;
      const deferred = createDeferred<Response>();
      fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
        capturedSignal = init?.signal;
        return deferred.promise;
      });

      const { unmount } = render(<ServiceManagement organizationId="org-1" />);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(false);

      unmount();

      expect(capturedSignal?.aborted).toBe(true);

      const abortError = new Error("The user aborted a request.");
      abortError.name = "AbortError";
      deferred.reject(abortError);

      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("prevents stale GET responses from a previous organization from replacing active organization services", async () => {
      const deferredOrgA = createDeferred<Response>();
      const deferredOrgB = createDeferred<Response>();

      fetchMock.mockImplementation((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/api/organizations/org-A/services")) {
          return deferredOrgA.promise;
        }
        if (url.includes("/api/organizations/org-B/services")) {
          return deferredOrgB.promise;
        }
        return Promise.resolve(jsonResponse([]));
      });

      // 1. Initial render with org-A
      const { rerender } = render(<ServiceManagement organizationId="org-A" />);

      // 2. Switch to org-B before org-A responds
      rerender(<ServiceManagement organizationId="org-B" />);

      // 3. Org-B responds first with Org B's service
      deferredOrgB.resolve(
        jsonResponse([
          {
            id: "b-1",
            name: "Org B Service",
            description: "Services for Org B",
            organizationId: "org-B",
            isActive: true,
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
        ]),
      );

      expect(await screen.findByText("Org B Service")).toBeDefined();

      // 4. Org-A responds LATER with Org A's service (stale response)
      deferredOrgA.resolve(
        jsonResponse([
          {
            id: "a-1",
            name: "Org A Stale Service",
            description: "Stale",
            organizationId: "org-A",
            isActive: true,
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
        ]),
      );

      // Verify Org A Stale Service is NEVER displayed and Org B Service remains
      expect(screen.queryByText("Org A Stale Service")).toBeNull();
      expect(screen.getByText("Org B Service")).toBeDefined();
    });

    it("renders services safely with Active default when GET response services omit isActive instead of showing 0 services", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse([
          {
            id: "legacy-srv-1",
            name: "Legacy Consultation",
            description: "No isActive field in payload",
            organizationId: "org-1",
            createdAt: "2026-03-01T10:00:00.000Z",
            updatedAt: "2026-03-01T10:00:00.000Z",
          },
        ]),
      );

      render(<ServiceManagement organizationId="org-1" />);

      expect(await screen.findByText("Legacy Consultation")).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();
      expect(screen.queryByText("No Service Categories Configured")).toBeNull();
      expect(
        screen.getByRole("button", { name: /deactivate legacy consultation/i }),
      ).toBeDefined();
    });

    it("displays an error alert and does not silently turn into an empty service list when fetch fails", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: "Organization not found" }, 404),
      );

      render(<ServiceManagement organizationId="org-1" />);

      expect(
        await screen.findByText(
          "Unable to load services at this time. Please try again.",
        ),
      ).toBeDefined();
      expect(screen.queryByText("No Service Categories Configured")).toBeNull();
    });
  });

  describe("Service creation form", () => {
    it("submits the new service with name and optional description and updates the list on success", async () => {
      let postPayload: unknown;

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          postPayload = JSON.parse(init.body as string);
          return jsonResponse(
            {
              id: "new-srv-id",
              name: "Cardiology",
              description: "Heart and vascular clinic",
              organizationId: "org-1",
              isActive: true,
              createdAt: "2026-03-03T12:00:00.000Z",
              updatedAt: "2026-03-03T12:00:00.000Z",
            },
            201,
          );
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(
        /e\.g\., Account Services/i,
      ) as HTMLInputElement;
      const descInput = screen.getByPlaceholderText(
        /e\.g\., Assistance with account verification/i,
      ) as HTMLInputElement;
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      // Submit button should be disabled when name is empty
      expect((submitButton as HTMLButtonElement).disabled).toBe(true);

      // Enter name and description
      fireEvent.change(nameInput, { target: { value: "Cardiology" } });
      fireEvent.change(descInput, { target: { value: "Heart and vascular clinic" } });
      expect((submitButton as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(submitButton);

      expect(
        await screen.findByText(
          'Service "Cardiology" created successfully.',
        ),
      ).toBeDefined();
      expect(screen.getByText("Cardiology")).toBeDefined();
      expect(screen.getByText("Heart and vascular clinic")).toBeDefined();
      expect(nameInput.value).toBe("");
      expect(descInput.value).toBe("");
      expect(postPayload).toEqual({
        name: "Cardiology",
        description: "Heart and vascular clinic",
      });
    });

    it("submits the new service without description when description is empty", async () => {
      let postPayload: unknown;

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          postPayload = JSON.parse(init.body as string);
          return jsonResponse(
            {
              id: "new-srv-2",
              name: "Pediatrics",
              description: null,
              organizationId: "org-1",
              isActive: true,
              createdAt: "2026-03-03T12:00:00.000Z",
              updatedAt: "2026-03-03T12:00:00.000Z",
            },
            201,
          );
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Pediatrics" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText('Service "Pediatrics" created successfully.'),
      ).toBeDefined();
      expect(postPayload).toEqual({
        name: "Pediatrics",
      });
    });

    it("displays Active badge and Deactivate button on newly created service confirmed by server", async () => {
      fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return jsonResponse(
            {
              id: "new-srv-active",
              name: "Particular Queries",
              description: "Support for queries",
              organizationId: "org-1",
              isActive: true,
              createdAt: "2026-03-03T12:00:00.000Z",
              updatedAt: "2026-03-03T12:00:00.000Z",
            },
            201,
          );
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Particular Queries" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText('Service "Particular Queries" created successfully.'),
      ).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();
      expect(
        screen.getByRole("button", { name: /deactivate particular queries/i }),
      ).toBeDefined();
    });

    it("safely defaults newly created service to Active badge even if server response omitted isActive", async () => {
      fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return jsonResponse(
            {
              id: "new-srv-legacy",
              name: "Particular Queries Legacy",
              description: "Legacy server response without isActive",
              organizationId: "org-1",
              createdAt: "2026-03-03T12:00:00.000Z",
              updatedAt: "2026-03-03T12:00:00.000Z",
            },
            201,
          );
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Particular Queries Legacy" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText('Service "Particular Queries Legacy" created successfully.'),
      ).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();
      expect(
        screen.getByRole("button", { name: /deactivate particular queries legacy/i }),
      ).toBeDefined();
    });

    it("redirects to sign-in on 401 response during creation", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Dental" } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
    });

    it("displays error message when service creation returns 409 conflict", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              error: "A service with this name already exists in this organization.",
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Duplicate Service" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText(
          "A service with this name already exists in this organization.",
        ),
      ).toBeDefined();
    });

    it("displays field error message when service creation returns 400 validation error", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              error: "Invalid request body",
              details: {
                fieldErrors: {
                  name: ["Service name is required"],
                },
              },
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Bad Input" } });
      fireEvent.click(submitButton);

      expect(await screen.findByText("Service name is required")).toBeDefined();
    });

    it("displays error message when service creation returns 403 forbidden", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              error: "Only organization admins can create services",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Admin Only" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText("Only organization admins can create services."),
      ).toBeDefined();
    });

    it("displays network error message when service creation throws a network failure", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          throw new Error("Network connection dropped");
        }
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Offline Test" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText(
          "Failed to create service due to a network error. Please try again.",
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
        return jsonResponse([]);
      });

      render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Rapid Submit" } });

      // Synchronous rapid repeated clicks
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);
      fireEvent.click(submitButton);

      // Synchronous guard must have blocked all repeated calls immediately
      expect(postCallCount).toBe(1);

      await act(async () => {
        deferredCreate.resolve(
          jsonResponse(
            {
              id: "rapid-id",
              name: "Rapid Submit",
              description: null,
              organizationId: "org-1",
              createdAt: "2026-03-03T12:00:00.000Z",
              updatedAt: "2026-03-03T12:00:00.000Z",
            },
            201,
          ),
        );
      });

      expect(
        await screen.findByText('Service "Rapid Submit" created successfully.'),
      ).toBeDefined();
    });
  });

  describe("Organization switching and stale response protection", () => {
    it("resets form inputs, errors, and success alerts when organizationId changes", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ error: "Duplicate service" }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        return jsonResponse([]);
      });

      const { rerender } = render(<ServiceManagement organizationId="org-1" />);
      await screen.findByText("No Service Categories Configured");

      const nameInput = screen.getByPlaceholderText(
        /e\.g\., Account Services/i,
      ) as HTMLInputElement;
      const descInput = screen.getByPlaceholderText(
        /e\.g\., Assistance with account verification/i,
      ) as HTMLInputElement;
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Draft Service" } });
      fireEvent.change(descInput, { target: { value: "Draft Description" } });
      fireEvent.click(submitButton);

      expect(await screen.findByText("Duplicate service")).toBeDefined();

      // Switch organizationId to org-2
      rerender(<ServiceManagement organizationId="org-2" />);

      // Form errors and draft input must be cleared immediately
      expect(nameInput.value).toBe("");
      expect(descInput.value).toBe("");
      expect(screen.queryByText("Duplicate service")).toBeNull();
    });

    it("discards creation response if organization was switched while creation was in flight", async () => {
      const deferredCreate = createDeferred<Response>();

      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return deferredCreate.promise;
        }
        return Promise.resolve(jsonResponse([]));
      });

      // 1. Initial GET for org-A
      const { rerender } = render(<ServiceManagement organizationId="org-A" />);
      await screen.findByText("No Service Categories Configured");

      // 2. User starts creating a service in org-A
      const nameInput = screen.getByPlaceholderText(/e\.g\., Account Services/i);
      const submitButton = screen.getByRole("button", {
        name: /create service/i,
      });

      fireEvent.change(nameInput, { target: { value: "Org A Late Service" } });
      fireEvent.click(submitButton);

      // 3. User switches to org-B while creation is in-flight
      rerender(<ServiceManagement organizationId="org-B" />);
      await screen.findByText("No Service Categories Configured");

      // 4. Creation for org-A finishes
      deferredCreate.resolve(
        jsonResponse(
          {
            id: "a-late",
            name: "Org A Late Service",
            description: null,
            organizationId: "org-A",
            isActive: true,
            createdAt: "2026-03-01T00:00:00.000Z",
            updatedAt: "2026-03-01T00:00:00.000Z",
          },
          201,
        ),
      );

      // Verify Org A Late Service is NOT added to org-B and no success message appears
      expect(screen.queryByText("Org A Late Service")).toBeNull();
      expect(
        screen.queryByText('Service "Org A Late Service" created successfully.'),
      ).toBeNull();
    });
  });

  describe("Service activation and deactivation controls", () => {
    it("successfully deactivates an active service and updates UI status and button", async () => {
      const initialServices = [
        {
          id: "srv-1",
          name: "Consultation",
          description: "General consultations",
          organizationId: "org-1",
          isActive: true,
          createdAt: "2026-03-01T10:00:00.000Z",
          updatedAt: "2026-03-01T10:00:00.000Z",
        },
      ];

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (
          init?.method === "PATCH" &&
          url.includes("/api/organizations/org-1/services/srv-1")
        ) {
          const body = JSON.parse(init.body as string);
          expect(body).toEqual({ isActive: false });
          return jsonResponse({
            ...initialServices[0],
            isActive: false,
            updatedAt: "2026-03-01T11:00:00.000Z",
          });
        }
        return jsonResponse(initialServices);
      });

      render(<ServiceManagement organizationId="org-1" />);

      expect(await screen.findByText("Consultation")).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();

      const deactivateBtn = screen.getByRole("button", {
        name: /deactivate consultation/i,
      });
      expect(deactivateBtn).toBeDefined();

      fireEvent.click(deactivateBtn);

      expect(
        await screen.findByText('Service "Consultation" deactivated successfully.'),
      ).toBeDefined();
      expect(screen.getByText("Inactive")).toBeDefined();
      expect(
        screen.getByRole("button", { name: /activate consultation/i }),
      ).toBeDefined();
    });

    it("successfully activates an inactive service and updates UI status and button", async () => {
      const initialServices = [
        {
          id: "srv-2",
          name: "Dental Care",
          description: "Dental clinic",
          organizationId: "org-1",
          isActive: false,
          createdAt: "2026-03-02T10:00:00.000Z",
          updatedAt: "2026-03-02T10:00:00.000Z",
        },
      ];

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (
          init?.method === "PATCH" &&
          url.includes("/api/organizations/org-1/services/srv-2")
        ) {
          const body = JSON.parse(init.body as string);
          expect(body).toEqual({ isActive: true });
          return jsonResponse({
            ...initialServices[0],
            isActive: true,
            updatedAt: "2026-03-02T11:00:00.000Z",
          });
        }
        return jsonResponse(initialServices);
      });

      render(<ServiceManagement organizationId="org-1" />);

      expect(await screen.findByText("Dental Care")).toBeDefined();
      expect(screen.getByText("Inactive")).toBeDefined();

      const activateBtn = screen.getByRole("button", {
        name: /activate dental care/i,
      });
      expect(activateBtn).toBeDefined();

      fireEvent.click(activateBtn);

      expect(
        await screen.findByText('Service "Dental Care" activated successfully.'),
      ).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();
      expect(
        screen.getByRole("button", { name: /deactivate dental care/i }),
      ).toBeDefined();
    });

    it("handles request failure without optimistic updates, keeping original status and displaying server error", async () => {
      const initialServices = [
        {
          id: "srv-1",
          name: "Consultation",
          description: "General consultations",
          organizationId: "org-1",
          isActive: true,
          createdAt: "2026-03-01T10:00:00.000Z",
          updatedAt: "2026-03-01T10:00:00.000Z",
        },
      ];

      fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return jsonResponse(
            { error: "Insufficient permissions to change service status." },
            403,
          );
        }
        return jsonResponse(initialServices);
      });

      render(<ServiceManagement organizationId="org-1" />);

      expect(await screen.findByText("Consultation")).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();

      const deactivateBtn = screen.getByRole("button", {
        name: /deactivate consultation/i,
      });
      fireEvent.click(deactivateBtn);

      expect(
        await screen.findByText(
          "Insufficient permissions to change service status.",
        ),
      ).toBeDefined();

      // UI status remains Active and button remains Deactivate
      expect(screen.getByText("Active")).toBeDefined();
      expect(
        screen.getByRole("button", { name: /deactivate consultation/i }),
      ).toBeDefined();

      // Dismiss button clears the error alert
      const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
      fireEvent.click(dismissBtn);
      expect(
        screen.queryByText("Insufficient permissions to change service status."),
      ).toBeNull();
    });

    it("displays pending state and disables the button during in-flight status update", async () => {
      const deferredPatch = createDeferred<Response>();
      const initialServices = [
        {
          id: "srv-1",
          name: "Consultation",
          description: "General consultations",
          organizationId: "org-1",
          isActive: true,
          createdAt: "2026-03-01T10:00:00.000Z",
          updatedAt: "2026-03-01T10:00:00.000Z",
        },
      ];

      fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return deferredPatch.promise;
        }
        return Promise.resolve(jsonResponse(initialServices));
      });

      render(<ServiceManagement organizationId="org-1" />);

      const deactivateBtn = await screen.findByRole("button", {
        name: /deactivate consultation/i,
      });
      expect((deactivateBtn as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(deactivateBtn);

      // Pending state: text changes to Deactivating... and button is disabled
      expect(screen.getByText(/deactivating\.\.\./i)).toBeDefined();
      expect((deactivateBtn as HTMLButtonElement).disabled).toBe(true);

      // Resolve the request
      deferredPatch.resolve(
        jsonResponse({
          ...initialServices[0],
          isActive: false,
        }),
      );

      // Once resolved, button returns to normal with Activate label and is enabled
      expect(
        await screen.findByRole("button", { name: /activate consultation/i }),
      ).toBeDefined();
      expect(
        (
          screen.getByRole("button", {
            name: /activate consultation/i,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false);
    });

    it("discards status update response if organization was switched while update was in flight", async () => {
      const deferredPatch = createDeferred<Response>();

      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (init?.method === "PATCH") {
          return deferredPatch.promise;
        }
        if (url.includes("/api/organizations/org-A/services")) {
          return Promise.resolve(
            jsonResponse([
              {
                id: "service-a",
                name: "Org A Service",
                description: "Description A",
                organizationId: "org-A",
                isActive: true,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
              },
            ]),
          );
        }
        if (url.includes("/api/organizations/org-B/services")) {
          return Promise.resolve(
            jsonResponse([
              {
                id: "service-b",
                name: "Org B Service",
                description: "Description B",
                organizationId: "org-B",
                isActive: true,
                createdAt: "2026-03-01T00:00:00.000Z",
                updatedAt: "2026-03-01T00:00:00.000Z",
              },
            ]),
          );
        }
        return Promise.resolve(jsonResponse([]));
      });

      // 1. Initial render on org-A
      const { rerender } = render(<ServiceManagement organizationId="org-A" />);
      const deactivateBtn = await screen.findByRole("button", {
        name: /deactivate org a service/i,
      });

      // 2. Click deactivate on org-A service
      fireEvent.click(deactivateBtn);
      expect(screen.getByText(/deactivating\.\.\./i)).toBeDefined();

      // 3. User switches to org-B while request is in flight
      rerender(<ServiceManagement organizationId="org-B" />);
      expect(await screen.findByText("Org B Service")).toBeDefined();

      // 4. Resolve org-A patch
      deferredPatch.resolve(
        jsonResponse({
          id: "service-a",
          name: "Org A Service",
          description: "Description A",
          organizationId: "org-A",
          isActive: false,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        }),
      );

      // 5. Ensure no success message or state pollution leaked into org-B
      expect(
        screen.queryByText('Service "Org A Service" deactivated successfully.'),
      ).toBeNull();
      expect(screen.getByText("Org B Service")).toBeDefined();
    });

    it("redirects to /sign-in on 401 response during status update", async () => {
      fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return jsonResponse({ error: "Unauthorized" }, 401);
        }
        return jsonResponse(mockServices);
      });

      render(<ServiceManagement organizationId="org-1" />);

      const deactivateBtn = await screen.findByRole("button", {
        name: /deactivate consultation/i,
      });
      fireEvent.click(deactivateBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
    });
  });
});
