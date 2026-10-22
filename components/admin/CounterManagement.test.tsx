// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CounterManagement } from "./CounterManagement";

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

describe("components/admin/CounterManagement", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("Initial counter fetching and loading states", () => {
    it("renders loading skeleton while counters are being fetched", () => {
      const deferred = createDeferred<Response>();
      fetchMock.mockImplementation(() => deferred.promise);

      render(<CounterManagement organizationId="org-1" />);

      expect(screen.getByLabelText("Loading service counters")).toBeDefined();
      expect(
        (screen.getByRole("button", { name: /refresh/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it("displays the returned counters when fetching succeeds", async () => {
      const mockCounters = [
        {
          id: "counter-1",
          name: "Window A",
          organizationId: "org-1",
          isActive: true,
          createdAt: "2026-03-01T10:00:00.000Z",
        },
        {
          id: "counter-2",
          name: "Desk 2",
          organizationId: "org-1",
          isActive: false,
          createdAt: "2026-03-02T10:00:00.000Z",
        },
      ];

      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(mockCounters), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<CounterManagement organizationId="org-1" />);

      expect(await screen.findByText("Window A")).toBeDefined();
      expect(screen.getByText("Desk 2")).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();
      expect(screen.getByText("Inactive")).toBeDefined();
      expect(screen.getByText("2 counters")).toBeDefined();
      expect(screen.queryByLabelText("Loading service counters")).toBeNull();
    });

    it("displays empty state when organization has no configured counters", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<CounterManagement organizationId="org-1" />);

      expect(
        await screen.findByText("No Service Counters Configured"),
      ).toBeDefined();
      expect(
        screen.getByText(/Add your first counter above/i),
      ).toBeDefined();
      expect(screen.getByText("0 counters")).toBeDefined();
    });

    it("displays an error alert with retry button when initial fetch fails", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<CounterManagement organizationId="org-1" />);

      expect(
        await screen.findByText(
          "Unable to load service counters at this time. Please try again.",
        ),
      ).toBeDefined();

      const retryBtn = screen.getByRole("button", {
        name: /retry loading counters/i,
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
        return new Response(
          JSON.stringify([
            {
              id: "counter-1",
              name: "Window 1",
              organizationId: "org-1",
              isActive: true,
              createdAt: "2026-03-01T10:00:00.000Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      render(<CounterManagement organizationId="org-1" />);

      const retryBtn = await screen.findByRole("button", {
        name: /retry loading counters/i,
      });
      fireEvent.click(retryBtn);

      expect(await screen.findByText("Window 1")).toBeDefined();
      expect(
        screen.queryByText(
          "Unable to load service counters at this time. Please try again.",
        ),
      ).toBeNull();
    });
  });

  describe("Counter creation form", () => {
    it("submits the new counter and updates the counter list on success", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              id: "new-counter-id",
              name: "Counter 101",
              organizationId: "org-1",
              isActive: true,
              createdAt: "2026-03-03T12:00:00.000Z",
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      render(<CounterManagement organizationId="org-1" />);
      await screen.findByText("No Service Counters Configured");

      const input = screen.getByPlaceholderText(
        /e\.g\., Counter 1 or Window A/i,
      ) as HTMLInputElement;
      const submitButton = screen.getByRole("button", {
        name: /create counter/i,
      });

      // Submit button should be disabled when empty
      expect((submitButton as HTMLButtonElement).disabled).toBe(true);

      // Enter a counter name
      fireEvent.change(input, { target: { value: "Counter 101" } });
      expect(input.value).toBe("Counter 101");
      expect((submitButton as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(submitButton);

      // Verify success message and addition to list
      expect(
        await screen.findByText(
          'Counter "Counter 101" created successfully.',
        ),
      ).toBeDefined();
      expect(screen.getByText("Counter 101")).toBeDefined();
      expect(input.value).toBe("");
    });

    it("displays error message when counter creation returns 409 conflict", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              error: "A counter with this name already exists in this organization.",
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      render(<CounterManagement organizationId="org-1" />);
      await screen.findByText("No Service Counters Configured");

      const input = screen.getByPlaceholderText(
        /e\.g\., Counter 1 or Window A/i,
      );
      const submitButton = screen.getByRole("button", {
        name: /create counter/i,
      });

      fireEvent.change(input, { target: { value: "Duplicate Counter" } });
      fireEvent.click(submitButton);

      expect(
        await screen.findByText(
          "A counter with this name already exists in this organization.",
        ),
      ).toBeDefined();
    });

    it("redirects to sign-in on 401 response", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<CounterManagement organizationId="org-1" />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
    });
  });

  describe("Organization switching and stale response protection", () => {
    it("resets form inputs, errors, and success alerts when organizationId changes", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ error: "Duplicate counter" }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const { rerender } = render(<CounterManagement organizationId="org-1" />);
      await screen.findByText("No Service Counters Configured");

      const input = screen.getByPlaceholderText(
        /e\.g\., Counter 1 or Window A/i,
      ) as HTMLInputElement;
      const submitButton = screen.getByRole("button", {
        name: /create counter/i,
      });

      fireEvent.change(input, { target: { value: "Draft Counter" } });
      fireEvent.click(submitButton);

      expect(await screen.findByText("Duplicate counter")).toBeDefined();

      // Switch organizationId to org-2
      rerender(<CounterManagement organizationId="org-2" />);

      // Form errors and draft input must be cleared immediately
      expect(input.value).toBe("");
      expect(screen.queryByText("Duplicate counter")).toBeNull();
    });

    it("prevents stale GET responses from a previous organization from replacing active organization counters", async () => {
      const deferredOrgA = createDeferred<Response>();
      const deferredOrgB = createDeferred<Response>();

      fetchMock.mockImplementation((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.includes("/api/organizations/org-A/counters")) {
          return deferredOrgA.promise;
        }
        if (url.includes("/api/organizations/org-B/counters")) {
          return deferredOrgB.promise;
        }
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      // 1. Initial render with org-A
      const { rerender } = render(<CounterManagement organizationId="org-A" />);

      // 2. Switch to org-B before org-A responds
      rerender(<CounterManagement organizationId="org-B" />);

      // 3. Org-B responds first with Org B's counter
      deferredOrgB.resolve(
        new Response(
          JSON.stringify([
            {
              id: "b-1",
              name: "Org B Counter",
              organizationId: "org-B",
              isActive: true,
              createdAt: "2026-03-01T00:00:00.000Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      expect(await screen.findByText("Org B Counter")).toBeDefined();

      // 4. Org-A responds LATER with Org A's counter
      deferredOrgA.resolve(
        new Response(
          JSON.stringify([
            {
              id: "a-1",
              name: "Org A Stale Counter",
              organizationId: "org-A",
              isActive: true,
              createdAt: "2026-03-01T00:00:00.000Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      // Verify Org A Stale Counter is NEVER displayed and Org B Counter remains
      expect(screen.queryByText("Org A Stale Counter")).toBeNull();
      expect(screen.getByText("Org B Counter")).toBeDefined();
    });

    it("discards creation response if organization was switched while creation was in flight", async () => {
      const deferredCreate = createDeferred<Response>();

      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return deferredCreate.promise;
        }
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      // 1. Initial GET for org-A
      const { rerender } = render(<CounterManagement organizationId="org-A" />);
      await screen.findByText("No Service Counters Configured");

      // 2. User starts creating a counter in org-A
      const input = screen.getByPlaceholderText(
        /e\.g\., Counter 1 or Window A/i,
      );
      const submitButton = screen.getByRole("button", {
        name: /create counter/i,
      });

      fireEvent.change(input, { target: { value: "Org A Late Counter" } });
      fireEvent.click(submitButton);

      // 3. User switches to org-B while creation is in-flight
      rerender(<CounterManagement organizationId="org-B" />);
      await screen.findByText("No Service Counters Configured");

      // 4. Creation for org-A finishes
      deferredCreate.resolve(
        new Response(
          JSON.stringify({
            id: "a-late",
            name: "Org A Late Counter",
            organizationId: "org-A",
            isActive: true,
            createdAt: "2026-03-01T00:00:00.000Z",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );

      // Verify Org A Late Counter is NOT added to org-B and no success message appears
      expect(screen.queryByText("Org A Late Counter")).toBeNull();
      expect(
        screen.queryByText('Counter "Org A Late Counter" created successfully.'),
      ).toBeNull();
    });
  });

  describe("Counter activation and deactivation controls", () => {
    it("successfully deactivates an active counter and updates UI status", async () => {
      const mockCounters = [
        {
          id: "counter-1",
          name: "Window A",
          organizationId: "org-1",
          isActive: true,
          createdAt: "2026-03-01T10:00:00.000Z",
        },
      ];

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (init?.method === "PATCH" && url.includes("/api/organizations/org-1/counters/counter-1")) {
          const body = JSON.parse(init.body as string);
          expect(body).toEqual({ isActive: false });
          return new Response(
            JSON.stringify({
              ...mockCounters[0],
              isActive: false,
              updatedAt: "2026-03-01T11:00:00.000Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify(mockCounters), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      render(<CounterManagement organizationId="org-1" />);

      expect(await screen.findByText("Window A")).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();

      const deactivateBtn = screen.getByRole("button", {
        name: /deactivate window a/i,
      });
      expect(deactivateBtn).toBeDefined();

      fireEvent.click(deactivateBtn);

      expect(
        await screen.findByText('Counter "Window A" deactivated successfully.'),
      ).toBeDefined();
      expect(screen.getByText("Inactive")).toBeDefined();
      expect(
        screen.getByRole("button", { name: /activate window a/i }),
      ).toBeDefined();
    });

    it("successfully activates an inactive counter and updates UI status", async () => {
      const mockCounters = [
        {
          id: "counter-2",
          name: "Desk B",
          organizationId: "org-1",
          isActive: false,
          createdAt: "2026-03-01T10:00:00.000Z",
        },
      ];

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        if (init?.method === "PATCH" && url.includes("/api/organizations/org-1/counters/counter-2")) {
          const body = JSON.parse(init.body as string);
          expect(body).toEqual({ isActive: true });
          return new Response(
            JSON.stringify({
              ...mockCounters[0],
              isActive: true,
              updatedAt: "2026-03-01T11:00:00.000Z",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify(mockCounters), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      render(<CounterManagement organizationId="org-1" />);

      expect(await screen.findByText("Desk B")).toBeDefined();
      expect(screen.getByText("Inactive")).toBeDefined();

      const activateBtn = screen.getByRole("button", {
        name: /activate desk b/i,
      });
      expect(activateBtn).toBeDefined();

      fireEvent.click(activateBtn);

      expect(
        await screen.findByText('Counter "Desk B" activated successfully.'),
      ).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();
      expect(
        screen.getByRole("button", { name: /deactivate desk b/i }),
      ).toBeDefined();
    });

    it("handles request failure and keeps UI status consistent without false optimistic updates", async () => {
      const mockCounters = [
        {
          id: "counter-1",
          name: "Window A",
          organizationId: "org-1",
          isActive: true,
          createdAt: "2026-03-01T10:00:00.000Z",
        },
      ];

      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return new Response(
            JSON.stringify({
              error: "Cannot deactivate counter while it has an active ticket",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify(mockCounters), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      render(<CounterManagement organizationId="org-1" />);

      expect(await screen.findByText("Window A")).toBeDefined();
      expect(screen.getByText("Active")).toBeDefined();

      const deactivateBtn = screen.getByRole("button", {
        name: /deactivate window a/i,
      });
      fireEvent.click(deactivateBtn);

      expect(
        await screen.findByText(
          "Cannot deactivate counter while it has an active ticket",
        ),
      ).toBeDefined();

      // UI status remains Active and button remains Deactivate
      expect(screen.getByText("Active")).toBeDefined();
      expect(
        screen.getByRole("button", { name: /deactivate window a/i }),
      ).toBeDefined();
    });

    it("displays pending state and disables the button during in-flight status update", async () => {
      const deferredPatch = createDeferred<Response>();
      const mockCounters = [
        {
          id: "counter-1",
          name: "Window A",
          organizationId: "org-1",
          isActive: true,
          createdAt: "2026-03-01T10:00:00.000Z",
        },
      ];

      fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          return deferredPatch.promise;
        }
        return Promise.resolve(
          new Response(JSON.stringify(mockCounters), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      render(<CounterManagement organizationId="org-1" />);

      const deactivateBtn = await screen.findByRole("button", {
        name: /deactivate window a/i,
      });
      expect((deactivateBtn as HTMLButtonElement).disabled).toBe(false);

      fireEvent.click(deactivateBtn);

      // Pending state: text changes to Deactivating... and button is disabled
      expect(screen.getByText(/deactivating\.\.\./i)).toBeDefined();
      expect((deactivateBtn as HTMLButtonElement).disabled).toBe(true);

      // Resolve the request
      deferredPatch.resolve(
        new Response(
          JSON.stringify({
            ...mockCounters[0],
            isActive: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      // Once resolved, button returns to normal with Activate label
      expect(
        await screen.findByRole("button", { name: /activate window a/i }),
      ).toBeDefined();
      expect(
        (
          screen.getByRole("button", {
            name: /activate window a/i,
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
        if (url.includes("/api/organizations/org-A/counters")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: "counter-a",
                  name: "Org A Counter",
                  organizationId: "org-A",
                  isActive: true,
                  createdAt: "2026-03-01T00:00:00.000Z",
                },
              ]),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        if (url.includes("/api/organizations/org-B/counters")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: "counter-b",
                  name: "Org B Counter",
                  organizationId: "org-B",
                  isActive: true,
                  createdAt: "2026-03-01T00:00:00.000Z",
                },
              ]),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      });

      // 1. Initial render on org-A
      const { rerender } = render(<CounterManagement organizationId="org-A" />);
      const deactivateBtn = await screen.findByRole("button", {
        name: /deactivate org a counter/i,
      });

      // 2. Click deactivate on org-A counter
      fireEvent.click(deactivateBtn);
      expect(screen.getByText(/deactivating\.\.\./i)).toBeDefined();

      // 3. User switches to org-B while request is in flight
      rerender(<CounterManagement organizationId="org-B" />);
      expect(await screen.findByText("Org B Counter")).toBeDefined();

      // 4. Resolve org-A patch
      deferredPatch.resolve(
        new Response(
          JSON.stringify({
            id: "counter-a",
            name: "Org A Counter",
            organizationId: "org-A",
            isActive: false,
            createdAt: "2026-03-01T00:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      // 5. Ensure no success message or state pollution leaked into org-B
      expect(
        screen.queryByText('Counter "Org A Counter" deactivated successfully.'),
      ).toBeNull();
      expect(screen.getByText("Org B Counter")).toBeDefined();
    });
  });
});
