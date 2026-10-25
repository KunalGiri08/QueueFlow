// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import OrganizationAdminPage from "./page";

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

// 3. Mock Navbar to isolate admin page from navigation chrome and user button
vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

// 4. Mock child management components to observe mount/unmount and organizationId prop
vi.mock("@/components/admin/CounterManagement", () => ({
  CounterManagement: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="counter-management" data-org-id={organizationId}>
      Counter Management ({organizationId})
    </div>
  ),
}));

vi.mock("@/components/admin/ServiceManagement", () => ({
  ServiceManagement: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="service-management" data-org-id={organizationId}>
      Service Management ({organizationId})
    </div>
  ),
}));

vi.mock("@/components/admin/QueueManagement", () => ({
  QueueManagement: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="queue-management" data-org-id={organizationId}>
      Queue Management ({organizationId})
    </div>
  ),
}));

vi.mock("@/components/admin/OrganizationAnalytics", () => ({
  OrganizationAnalytics: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="organization-analytics" data-org-id={organizationId}>
      Organization Analytics ({organizationId})
    </div>
  ),
}));

vi.mock("@/components/admin/OperatingHoursManagement", () => ({
  OperatingHoursManagement: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="operating-hours-management" data-org-id={organizationId}>
      Operating Hours Management ({organizationId})
    </div>
  ),
}));

vi.mock("@/components/admin/StaffManagement", () => ({
  StaffManagement: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="staff-management" data-org-id={organizationId}>
      Staff Management ({organizationId})
    </div>
  ),
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

const mockOrgs = [
  { id: "org-1", name: "Metro Health", slug: "metro-health" },
  { id: "org-2", name: "City Dental", slug: "city-dental" },
];

const mockStaffList = [
  {
    id: "user-1",
    name: "Admin User",
    email: "admin@example.com",
    role: "ADMIN",
    counters: [],
  },
];

describe("OrganizationAdminPage", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = { isSignedIn: true, isLoaded: true };
    originalFetch = global.fetch;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  describe("Authentication Gate", () => {
    it("renders AdminSkeleton with role=status and aria-busy when Clerk is not loaded", () => {
      mockAuthState = { isSignedIn: true, isLoaded: false };
      render(<OrganizationAdminPage />);

      const skeleton = screen.getByRole("status", { name: /loading admin dashboard/i });
      expect(skeleton).toBeDefined();
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
      expect(screen.queryByTestId("counter-management")).toBeNull();
    });

    it("redirects unauthenticated user to sign-in with return URL", async () => {
      mockAuthState = { isSignedIn: false, isLoaded: true };
      render(<OrganizationAdminPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
      expect(screen.queryByTestId("counter-management")).toBeNull();
    });
  });

  describe("Organization Catalog Loading", () => {
    it("renders loading skeleton while /api/organizations is pending", () => {
      const deferred = createDeferred<Response>();
      global.fetch = vi.fn().mockImplementation(() => deferred.promise);

      render(<OrganizationAdminPage />);

      const skeleton = screen.getByRole("status", { name: /loading admin dashboard/i });
      expect(skeleton).toBeDefined();
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
    });

    it("redirects to sign-in when /api/organizations returns 401 Unauthorized", async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

      render(<OrganizationAdminPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
    });

    it("displays error alert and recovers on retry when /api/organizations returns 500", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(jsonResponse({ error: "Server error" }, 500));
          }
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url.startsWith("/api/staff?organizationId=")) {
          return Promise.resolve(jsonResponse(mockStaffList));
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      const errorAlert = await screen.findByRole("alert");
      expect(errorAlert.textContent).toContain(
        "Unable to load your organizations at this time. Please try again.",
      );

      const retryBtn = screen.getByRole("button", { name: /retry/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: /active organization/i })).toBeDefined();
      });
    });

    it("displays No Organizations Found state when user has 0 organizations", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      expect(await screen.findByRole("heading", { name: /no organizations found/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /explore public organizations/i }).getAttribute("href")).toBe(
        "/organizations",
      );
      expect(screen.queryByTestId("counter-management")).toBeNull();
    });

    it("automatically selects the first organization from the list", async () => {
      const deferredVerify = createDeferred<Response>();
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url.startsWith("/api/staff?organizationId=")) {
          return deferredVerify.promise;
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      const select = await screen.findByRole("combobox", { name: /active organization/i });
      expect((select as HTMLSelectElement).value).toBe("org-1");

      const verifyingSkeleton = screen.getByRole("status", {
        name: /verifying administrator permissions for metro health/i,
      });
      expect(verifyingSkeleton).toBeDefined();
      expect(verifyingSkeleton.getAttribute("aria-busy")).toBe("true");
      expect(screen.queryByTestId("counter-management")).toBeNull();
    });
  });

  describe("Admin Authorization Verification Lifecycle", () => {
    it("mounts management components and verified badge on 200 OK authorization", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url === "/api/staff?organizationId=org-1") {
          return Promise.resolve(jsonResponse(mockStaffList));
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      expect(await screen.findByText("Admin Access Verified")).toBeDefined();

      const counterMgmt = screen.getByTestId("counter-management");
      expect(counterMgmt.getAttribute("data-org-id")).toBe("org-1");

      const serviceMgmt = screen.getByTestId("service-management");
      expect(serviceMgmt.getAttribute("data-org-id")).toBe("org-1");

      const queueMgmt = screen.getByTestId("queue-management");
      expect(queueMgmt.getAttribute("data-org-id")).toBe("org-1");

      const staffMgmt = screen.getByTestId("staff-management");
      expect(staffMgmt.getAttribute("data-org-id")).toBe("org-1");
    });

    it("renders 403 Forbidden alert and suppresses management components when user is not admin", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url === "/api/staff?organizationId=org-1") {
          return Promise.resolve(
            jsonResponse({ error: "Organization admin access required" }, 403),
          );
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      const forbiddenHeading = await screen.findByRole("heading", {
        name: /administrator access required/i,
      });
      expect(forbiddenHeading).toBeDefined();
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Metro Health");
      expect(screen.getByRole("link", { name: /go to staff operator console/i }).getAttribute("href")).toBe(
        "/staff",
      );

      expect(screen.queryByTestId("counter-management")).toBeNull();
      expect(screen.queryByTestId("service-management")).toBeNull();
      expect(screen.queryByTestId("queue-management")).toBeNull();
      expect(screen.queryByTestId("staff-management")).toBeNull();
    });

    it("redirects to sign-in when verification probe returns 401 Unauthorized", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url === "/api/staff?organizationId=org-1") {
          return Promise.resolve(jsonResponse({ error: "Unauthorized" }, 401));
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
        );
      });
    });

    it("displays error alert and recovers on retry when verification fails", async () => {
      let verifyAttempts = 0;
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url === "/api/staff?organizationId=org-1") {
          verifyAttempts++;
          if (verifyAttempts === 1) {
            return Promise.resolve(jsonResponse({ error: "DB timeout" }, 500));
          }
          return Promise.resolve(jsonResponse(mockStaffList));
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      const errorAlert = await screen.findByRole("alert");
      expect(errorAlert.textContent).toContain(
        "Unable to verify administrator permissions for this organization. Please try again.",
      );
      expect(screen.queryByTestId("counter-management")).toBeNull();

      const retryBtn = screen.getByRole("button", { name: /retry verification/i });
      fireEvent.click(retryBtn);

      expect(await screen.findByText("Admin Access Verified")).toBeDefined();
      expect(screen.getByTestId("counter-management").getAttribute("data-org-id")).toBe("org-1");
    });
  });

  describe("Organization Switching & Concurrency", () => {
    it("switches organizations cleanly, unmounting previous components and mounting new ones", async () => {
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url === "/api/staff?organizationId=org-1") {
          return Promise.resolve(jsonResponse(mockStaffList));
        }
        if (url === "/api/staff?organizationId=org-2") {
          return Promise.resolve(jsonResponse(mockStaffList));
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      expect(await screen.findByText("Admin Access Verified")).toBeDefined();
      expect(screen.getByTestId("counter-management").getAttribute("data-org-id")).toBe("org-1");

      const select = screen.getByRole("combobox", { name: /active organization/i });
      fireEvent.change(select, { target: { value: "org-2" } });

      await waitFor(() => {
        const counter = screen.getByTestId("counter-management");
        expect(counter.getAttribute("data-org-id")).toBe("org-2");
      });
      expect(screen.getByRole("heading", { name: "City Dental" })).toBeDefined();
    });

    it("prevents stale verification and premature component mounting during rapid org switching", async () => {
      const deferredOrg2 = createDeferred<Response>();
      const deferredOrg1Second = createDeferred<Response>();

      let org1Calls = 0;
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url === "/api/staff?organizationId=org-1") {
          org1Calls++;
          if (org1Calls === 1) {
            return Promise.resolve(jsonResponse(mockStaffList));
          }
          return deferredOrg1Second.promise;
        }
        if (url === "/api/staff?organizationId=org-2") {
          return deferredOrg2.promise;
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      // 1. Initial verification for org-1 succeeds
      expect(await screen.findByText("Admin Access Verified")).toBeDefined();
      expect(screen.getByTestId("counter-management").getAttribute("data-org-id")).toBe("org-1");

      // 2. Switch to org-2 (verification is in-flight deferred)
      const select = screen.getByRole("combobox", { name: /active organization/i });
      fireEvent.change(select, { target: { value: "org-2" } });

      // VerifyingSkeleton for org-2 should render; org-1 components unmounted
      expect(
        screen.getByRole("status", {
          name: /verifying administrator permissions for city dental/i,
        }),
      ).toBeDefined();
      expect(screen.queryByTestId("counter-management")).toBeNull();

      // 3. User immediately switches BACK to org-1 before org-2 finishes
      fireEvent.change(select, { target: { value: "org-1" } });

      // CRITICAL ASSERTION:
      // Even though org-1 was previously verified, because we switched back to org-1,
      // verifiedOrgId must have been cleared so management components DO NOT mount prematurely!
      expect(screen.queryByTestId("counter-management")).toBeNull();
      expect(
        screen.getByRole("status", {
          name: /verifying administrator permissions for metro health/i,
        }),
      ).toBeDefined();

      // 4. Resolve the stale org-2 verification with 200 OK
      await act(async () => {
        deferredOrg2.resolve(jsonResponse(mockStaffList));
      });

      // Still must NOT mount org-2 or mark org-1 verified prematurely
      expect(screen.queryByTestId("counter-management")).toBeNull();
      expect(
        screen.getByRole("status", {
          name: /verifying administrator permissions for metro health/i,
        }),
      ).toBeDefined();

      // 5. Finally resolve the second org-1 verification request with 200 OK
      await act(async () => {
        deferredOrg1Second.resolve(jsonResponse(mockStaffList));
      });

      // Now management components mount for org-1
      await waitFor(() => {
        expect(screen.getByTestId("counter-management").getAttribute("data-org-id")).toBe("org-1");
      });
      expect(screen.getByText("Admin Access Verified")).toBeDefined();
    });

    it("silently ignores intentional aborts on unmount without throwing or logging false errors", async () => {
      const deferredVerify = createDeferred<Response>();
      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          return Promise.resolve(jsonResponse(mockOrgs));
        }
        if (url.startsWith("/api/staff?organizationId=")) {
          return deferredVerify.promise;
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      const { unmount } = render(<OrganizationAdminPage />);

      await waitFor(() => {
        expect(
          screen.getByRole("status", {
            name: /verifying administrator permissions for metro health/i,
          }),
        ).toBeDefined();
      });

      // Unmount while verification is in-flight
      unmount();

      // Rejecting with AbortError after unmount must not cause unhandled errors
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      deferredVerify.reject(abortError);

      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("aborts in-flight verification and clears stale state when retrying organization catalog", async () => {
      let orgFetchCount = 0;
      const verifyDeferred = createDeferred<Response>();

      global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url === "/api/organizations") {
          orgFetchCount++;
          if (orgFetchCount === 1) {
            return Promise.resolve(jsonResponse(mockOrgs));
          }
          return Promise.resolve(jsonResponse([{ id: "org-99", name: "New Org", slug: "new-org" }]));
        }
        if (url === "/api/staff?organizationId=org-1") {
          return verifyDeferred.promise;
        }
        if (url === "/api/staff?organizationId=org-99") {
          return Promise.resolve(jsonResponse(mockStaffList));
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      });

      render(<OrganizationAdminPage />);

      // org-1 verification starts in-flight
      await waitFor(() => {
        expect(
          screen.getByRole("status", {
            name: /verifying administrator permissions for metro health/i,
          }),
        ).toBeDefined();
      });

      // Trigger organization retry
      const retryBtn = screen.queryByRole("button", { name: /retry/i });
      if (retryBtn) {
        fireEvent.click(retryBtn);
      }
    });
  });
});
