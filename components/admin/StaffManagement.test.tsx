// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { StaffManagement } from "./StaffManagement";

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

const mockStaffData = [
  {
    id: "user-1",
    name: "Alice Admin",
    email: "alice@example.com",
    role: "ADMIN",
    counters: [{ id: "counter-1", name: "Window 1" }],
  },
  {
    id: "user-2",
    name: "Bob Operator",
    email: "bob@example.com",
    role: "STAFF",
    counters: [],
  },
];

const mockCountersData = [
  { id: "counter-1", name: "Window 1", isActive: true, organizationId: "org-1" },
  { id: "counter-2", name: "Window 2", isActive: true, organizationId: "org-1" },
  { id: "counter-3", name: "Window 3 (Inactive)", isActive: false, organizationId: "org-1" },
];

describe("StaffManagement", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    window.confirm = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("Initial Loading and Display", () => {
    it("renders loading skeleton with role=status and aria-busy while fetching", () => {
      const deferred = createDeferred<Response>();
      global.fetch = vi.fn().mockImplementation(() => deferred.promise);

      render(<StaffManagement organizationId="org-1" />);

      const skeleton = screen.getByRole("status", {
        name: /loading staff members and assignments/i,
      });
      expect(skeleton).toBeDefined();
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
    });

    it("renders staff members with roles, emails, and assigned counters on success", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      expect(await screen.findByText("Alice Admin")).toBeDefined();
      expect(screen.getByText("alice@example.com")).toBeDefined();
      expect(screen.getByText("Admin")).toBeDefined();
      expect(screen.getByTestId("staff-card-user-1").textContent).toContain("Window 1");

      expect(screen.getByText("Bob Operator")).toBeDefined();
      expect(screen.getByText("bob@example.com")).toBeDefined();
      expect(screen.getByText("Staff")).toBeDefined();
      expect(screen.getByText("No counters assigned")).toBeDefined();

      expect(screen.getByText("2 members")).toBeDefined();
    });

    it("displays empty state when organization has no staff members", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      expect(await screen.findByText("No staff members found")).toBeDefined();
      expect(screen.getByText("0 members")).toBeDefined();
    });

    it("displays error alert and recovers on retry when initial fetch fails", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(jsonResponse({ error: "Server error" }, 500));
          }
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      const errorAlert = await screen.findByRole("alert");
      expect(errorAlert.textContent).toContain(
        "Unable to load staff members and counters. Please try again.",
      );

      const retryBtn = screen.getByRole("button", { name: /retry/i });
      fireEvent.click(retryBtn);

      expect(await screen.findByText("Alice Admin")).toBeDefined();
    });

    it("manual refresh button triggers re-fetch of staff and counters", async () => {
      let staffFetchCount = 0;
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          staffFetchCount++;
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      expect(await screen.findByText("Alice Admin")).toBeDefined();
      expect(staffFetchCount).toBe(1);

      const refreshBtn = screen.getByRole("button", { name: /refresh staff list/i });
      fireEvent.click(refreshBtn);

      await waitFor(() => {
        expect(staffFetchCount).toBe(2);
      });
    });

    it("redirects to sign-in if initial fetch returns 401", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse({ error: "Unauthorized" }, 401));
        }
        return Promise.resolve(jsonResponse([]));
      });

      render(<StaffManagement organizationId="org-1" />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
    });
  });

  describe("Onboarding Staff Operator", () => {
    it("successfully onboards staff member, updates list, clears inputs, and shows success alert", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        if (url === "/api/staff" && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({
              id: "user-3",
              name: "Charlie Brown",
              email: "charlie@example.com",
              role: "STAFF",
            }, 201),
          );
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      expect(await screen.findByText("Alice Admin")).toBeDefined();

      const nameInput = screen.getByLabelText(/full name/i) as HTMLInputElement;
      const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
      const submitBtn = screen.getByRole("button", { name: /onboard staff/i });

      fireEvent.change(nameInput, { target: { value: "Charlie Brown" } });
      fireEvent.change(emailInput, { target: { value: "charlie@example.com" } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Charlie Brown")).toBeDefined();
        expect(screen.getByText("charlie@example.com")).toBeDefined();
      });

      expect(nameInput.value).toBe("");
      expect(emailInput.value).toBe("");
      const successStatus = screen.getByRole("status");
      expect(successStatus.textContent).toContain("Staff operator Charlie Brown onboarded successfully.");
    });

    it("displays validation error when name or email is missing/invalid", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(jsonResponse([]));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("No staff members found");

      const submitBtn = screen.getByRole("button", { name: /onboard staff/i });
      fireEvent.click(submitBtn);

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Staff member name is required.");

      const nameInput = screen.getByLabelText(/full name/i);
      fireEvent.change(nameInput, { target: { value: "Charlie" } });
      fireEvent.click(submitBtn);

      expect(alert.textContent).toContain("A valid email address is required.");
    });

    it("displays conflict error when user is already a member", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        if (url === "/api/staff" && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({ error: "User is already a member of this organization" }, 409),
          );
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Alice Admin");

      fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Alice" } });
      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "alice@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: /onboard staff/i }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("User is already a member of this organization");
    });

    it("redirects to sign-in if onboarding returns 401", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        if (url === "/api/staff" && init?.method === "POST") {
          return Promise.resolve(jsonResponse({ error: "Unauthorized" }, 401));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Alice Admin");

      fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "David" } });
      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "david@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: /onboard staff/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
    });

    it("prevents duplicate submissions via synchronous lock ref", async () => {
      const deferredPost = createDeferred<Response>();
      let postCallCount = 0;

      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        if (url === "/api/staff" && init?.method === "POST") {
          postCallCount++;
          return deferredPost.promise;
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Alice Admin");

      fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "David" } });
      fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "david@example.com" } });

      const submitBtn = screen.getByRole("button", { name: /onboard staff/i });
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn); // immediate duplicate click

      expect(postCallCount).toBe(1);

      await act(async () => {
        deferredPost.resolve(
          jsonResponse({
            id: "user-4",
            name: "David",
            email: "david@example.com",
            role: "STAFF",
          }, 201),
        );
      });

      await waitFor(() => {
        expect(screen.getByText("David")).toBeDefined();
      });
    });
  });

  describe("Counter Assignment & Unassignment", () => {
    it("assigns active counter to staff member, updating list optimistically", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({
              id: "assignment-2",
              staffId: "user-2",
              counter: { id: "counter-2", name: "Window 2" },
            }, 201),
          );
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Bob Operator");

      // Bob has no counters assigned initially
      const select = screen.getByLabelText(/select counter to assign to bob operator/i);
      fireEvent.change(select, { target: { value: "counter-2" } });

      const assignBtn = screen.getAllByRole("button", { name: /^assign$/i })[1];
      fireEvent.click(assignBtn);

      await waitFor(() => {
        const bobCard = screen.getByTestId("staff-card-user-2");
        expect(bobCard.textContent).toContain("Window 2");
      });

      expect(screen.getByRole("status").textContent).toContain("Counter assigned successfully.");
    });

    it("displays error alert when assigning counter fails with 409 duplicate assignment", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters") && init?.method === "POST") {
          return Promise.resolve(
            jsonResponse({ error: "Staff member is already assigned to this counter" }, 409),
          );
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Bob Operator");

      const select = screen.getByLabelText(/select counter to assign to bob operator/i);
      fireEvent.change(select, { target: { value: "counter-2" } });

      const assignBtn = screen.getAllByRole("button", { name: /^assign$/i })[1];
      fireEvent.click(assignBtn);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Staff member is already assigned to this counter");
    });

    it("unassigns counter from staff member on remove click", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters/counter-1") && init?.method === "DELETE") {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Alice Admin");
      expect(screen.getByTestId("staff-card-user-1").textContent).toContain("Window 1");

      const unassignBtn = screen.getByRole("button", {
        name: /unassign window 1 from alice admin/i,
      });
      fireEvent.click(unassignBtn);

      await waitFor(() => {
        const aliceCard = screen.getByTestId("staff-card-user-1");
        expect(aliceCard.textContent).toContain("No counters assigned");
      });

      expect(screen.getByRole("status").textContent).toContain("Counter assignment removed.");
    });

    it("displays error alert when unassigning fails due to active ticket (409)", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters/counter-1") && init?.method === "DELETE") {
          return Promise.resolve(
            jsonResponse(
              { error: "Cannot remove assignment while the staff member has an active ticket" },
              409,
            ),
          );
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Alice Admin");

      const unassignBtn = screen.getByRole("button", {
        name: /unassign window 1 from alice admin/i,
      });
      fireEvent.click(unassignBtn);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "Cannot remove assignment while the staff member has an active ticket",
      );
      // Window 1 should still be present
      expect(screen.getByTestId("staff-card-user-1").textContent).toContain("Window 1");
    });
  });

  describe("Staff Member Removal", () => {
    it("removes staff member when confirmation is accepted", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        if (url === "/api/organizations/org-1/staff/user-2" && init?.method === "DELETE") {
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Bob Operator");

      const removeBtn = screen.getByRole("button", { name: /remove member bob operator/i });
      fireEvent.click(removeBtn);

      await waitFor(() => {
        expect(screen.queryByText("Bob Operator")).toBeNull();
      });

      expect(screen.getByRole("status").textContent).toContain("Bob Operator was removed from the organization.");
    });

    it("does not remove member if confirmation dialog is cancelled", async () => {
      window.confirm = vi.fn().mockReturnValue(false);
      let deleteCalled = false;

      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        if (init?.method === "DELETE") {
          deleteCalled = true;
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Bob Operator");

      const removeBtn = screen.getByRole("button", { name: /remove member bob operator/i });
      fireEvent.click(removeBtn);

      expect(deleteCalled).toBe(false);
      expect(screen.getByText("Bob Operator")).toBeDefined();
    });

    it("displays error alert when member removal fails with 409 last admin protection", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        if (url === "/api/organizations/org-1/staff/user-1" && init?.method === "DELETE") {
          return Promise.resolve(
            jsonResponse(
              { error: "Cannot remove the last administrator of an organization" },
              409,
            ),
          );
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      render(<StaffManagement organizationId="org-1" />);

      await screen.findByText("Alice Admin");

      const removeBtn = screen.getByRole("button", { name: /remove member alice admin/i });
      fireEvent.click(removeBtn);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "Cannot remove the last administrator of an organization",
      );
      expect(screen.getByText("Alice Admin")).toBeDefined();
    });
  });

  describe("Organization Switching & Concurrency", () => {
    it("resets state, clears inputs, and fetches new organization staff on prop change", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/staff?organizationId=org-1") {
          return Promise.resolve(jsonResponse(mockStaffData));
        }
        if (url === "/api/staff?organizationId=org-2") {
          return Promise.resolve(
            jsonResponse([
              {
                id: "user-99",
                name: "Dental Admin",
                email: "dental@example.com",
                role: "ADMIN",
                counters: [],
              },
            ]),
          );
        }
        if (url.includes("/counters")) {
          return Promise.resolve(jsonResponse(mockCountersData));
        }
        return Promise.reject(new Error(`Unhandled: ${url}`));
      });

      const { rerender } = render(<StaffManagement organizationId="org-1" />);

      expect(await screen.findByText("Alice Admin")).toBeDefined();

      rerender(<StaffManagement organizationId="org-2" />);

      expect(await screen.findByText("Dental Admin")).toBeDefined();
      expect(screen.queryByText("Alice Admin")).toBeNull();
    });

    it("silently handles AbortError on unmount without throwing unhandled rejections", async () => {
      const deferred = createDeferred<Response>();
      global.fetch = vi.fn().mockImplementation(() => deferred.promise);

      const { unmount } = render(<StaffManagement organizationId="org-1" />);

      unmount();

      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      deferred.reject(abortError);

      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
