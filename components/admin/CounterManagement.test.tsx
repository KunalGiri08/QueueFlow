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
});
