// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Navbar, extractUserRoles } from "./Navbar";

let mockUserState: {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: unknown;
} = {
  isLoaded: true,
  isSignedIn: false,
  user: null,
};

vi.mock("@clerk/nextjs", () => ({
  useUser: () => mockUserState,
  UserButton: () => <div data-testid="user-button">UserButton</div>,
}));

describe("extractUserRoles helper", () => {
  it("returns false for staff and admin when user is null or undefined", () => {
    expect(extractUserRoles(null)).toEqual({
      hasStaffRole: false,
      hasAdminRole: false,
    });
    expect(extractUserRoles(undefined)).toEqual({
      hasStaffRole: false,
      hasAdminRole: false,
    });
  });

  it("handles empty memberships for a standard customer", () => {
    const user = { id: "user-1", organizationMemberships: [] };
    expect(extractUserRoles(user)).toEqual({
      hasStaffRole: false,
      hasAdminRole: false,
    });
  });

  it("identifies STAFF role from organizationMemberships", () => {
    const user = {
      organizationMemberships: [
        { role: "STAFF", organization: { id: "org-1" } },
      ],
    };
    expect(extractUserRoles(user)).toEqual({
      hasStaffRole: true,
      hasAdminRole: false,
    });
  });

  it("identifies ADMIN role from organizationMemberships", () => {
    const user = {
      organizationMemberships: [
        { role: "ADMIN", organization: { id: "org-1" } },
      ],
    };
    expect(extractUserRoles(user)).toEqual({
      hasStaffRole: false,
      hasAdminRole: true,
    });
  });

  it("identifies both STAFF and ADMIN roles across multiple memberships", () => {
    const user = {
      organizationMemberships: [
        { role: "STAFF", organization: { id: "org-1", name: "Bank Branch" } },
        { role: "ADMIN", organization: { id: "org-2", name: "Hospital Clinic" } },
      ],
    };
    expect(extractUserRoles(user)).toEqual({
      hasStaffRole: true,
      hasAdminRole: true,
    });
  });

  it("normalizes Clerk role formats such as org:staff and org:admin", () => {
    const user = {
      organizationMemberships: [
        { role: "org:staff" },
        { role: "org:admin" },
      ],
    };
    expect(extractUserRoles(user)).toEqual({
      hasStaffRole: true,
      hasAdminRole: true,
    });
  });

  it("extracts roles from publicMetadata if provided", () => {
    const user = {
      publicMetadata: {
        roles: ["STAFF", "ADMIN"],
      },
    };
    expect(extractUserRoles(user)).toEqual({
      hasStaffRole: true,
      hasAdminRole: true,
    });
  });
});

describe("components/Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserState = {
      isLoaded: true,
      isSignedIn: false,
      user: null,
    };
  });

  afterEach(() => {
    cleanup();
  });

  describe("Signed-Out User", () => {
    it("renders public links, Explore Organizations, Sign In, and Get Started", () => {
      render(<Navbar />);

      expect(screen.getByLabelText("QueueFlow Home")).toBeDefined();

      const mainNav = screen.getByLabelText("Main navigation");
      expect(mainNav).toBeDefined();

      const exploreLinks = screen.getAllByRole("link", {
        name: /explore organizations/i,
      });
      expect(exploreLinks.length).toBeGreaterThanOrEqual(1);
      expect(exploreLinks[0].getAttribute("href")).toBe("/organizations");

      expect(screen.getByRole("link", { name: /sign in/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /get started/i })).toBeDefined();

      expect(screen.queryByRole("link", { name: /my tickets/i })).toBeNull();
      expect(
        screen.queryByRole("link", { name: /my appointments/i }),
      ).toBeNull();
      expect(screen.queryByRole("link", { name: /staff console/i })).toBeNull();
      expect(
        screen.queryByRole("link", { name: /admin dashboard/i }),
      ).toBeNull();
      expect(screen.queryByTestId("user-button")).toBeNull();
    });
  });

  describe("Signed-In Customer (no organization memberships)", () => {
    beforeEach(() => {
      mockUserState = {
        isLoaded: true,
        isSignedIn: true,
        user: {
          id: "cust-1",
          organizationMemberships: [],
        },
      };
    });

    it("renders My Tickets, My Appointments, and UserButton while hiding Staff/Admin links", () => {
      render(<Navbar />);

      expect(screen.getByRole("link", { name: /my tickets/i })).toBeDefined();
      expect(
        screen.getByRole("link", { name: /my appointments/i }),
      ).toBeDefined();

      const ticketsLink = screen.getByRole("link", { name: /my tickets/i });
      expect(ticketsLink.getAttribute("href")).toBe("/tickets");

      const appointmentsLink = screen.getByRole("link", {
        name: /my appointments/i,
      });
      expect(appointmentsLink.getAttribute("href")).toBe("/appointments");

      expect(screen.getByTestId("user-button")).toBeDefined();

      expect(screen.queryByRole("link", { name: /sign in/i })).toBeNull();
      expect(screen.queryByRole("link", { name: /get started/i })).toBeNull();

      expect(screen.queryByRole("link", { name: /staff console/i })).toBeNull();
      expect(
        screen.queryByRole("link", { name: /admin dashboard/i }),
      ).toBeNull();
    });
  });

  describe("STAFF Member", () => {
    beforeEach(() => {
      mockUserState = {
        isLoaded: true,
        isSignedIn: true,
        user: {
          id: "staff-1",
          organizationMemberships: [
            {
              role: "STAFF",
              organization: { id: "org-1", name: "Demo Bank", slug: "demo-bank" },
            },
          ],
        },
      };
    });

    it("exposes Staff Console link alongside customer links and hides Admin Dashboard", () => {
      render(<Navbar />);

      const staffLink = screen.getByRole("link", { name: /staff console/i });
      expect(staffLink).toBeDefined();
      expect(staffLink.getAttribute("href")).toBe("/staff");

      expect(screen.getByRole("link", { name: /my tickets/i })).toBeDefined();
      expect(
        screen.getByRole("link", { name: /my appointments/i }),
      ).toBeDefined();

      expect(
        screen.queryByRole("link", { name: /admin dashboard/i }),
      ).toBeNull();
      expect(screen.getByTestId("user-button")).toBeDefined();
    });
  });

  describe("ADMIN Member", () => {
    beforeEach(() => {
      mockUserState = {
        isLoaded: true,
        isSignedIn: true,
        user: {
          id: "admin-1",
          organizationMemberships: [
            {
              role: "ADMIN",
              organization: { id: "org-1", name: "Demo Bank", slug: "demo-bank" },
            },
          ],
        },
      };
    });

    it("exposes Admin Dashboard link alongside customer links and hides Staff Console", () => {
      render(<Navbar />);

      const adminLink = screen.getByRole("link", { name: /admin dashboard/i });
      expect(adminLink).toBeDefined();
      expect(adminLink.getAttribute("href")).toBe("/admin");

      expect(screen.getByRole("link", { name: /my tickets/i })).toBeDefined();
      expect(
        screen.getByRole("link", { name: /my appointments/i }),
      ).toBeDefined();

      expect(screen.queryByRole("link", { name: /staff console/i })).toBeNull();
      expect(screen.getByTestId("user-button")).toBeDefined();
    });
  });

  describe("User with Multiple Memberships & Roles", () => {
    beforeEach(() => {
      mockUserState = {
        isLoaded: true,
        isSignedIn: true,
        user: {
          id: "multi-role-1",
          organizationMemberships: [
            {
              role: "STAFF",
              organization: { id: "org-1", name: "Demo Bank" },
            },
            {
              role: "ADMIN",
              organization: { id: "org-2", name: "General Hospital" },
            },
          ],
        },
      };
    });

    it("exposes both Staff Console and Admin Dashboard links", () => {
      render(<Navbar />);

      const staffLink = screen.getByRole("link", { name: /staff console/i });
      expect(staffLink).toBeDefined();
      expect(staffLink.getAttribute("href")).toBe("/staff");

      const adminLink = screen.getByRole("link", { name: /admin dashboard/i });
      expect(adminLink).toBeDefined();
      expect(adminLink.getAttribute("href")).toBe("/admin");

      expect(screen.getByRole("link", { name: /my tickets/i })).toBeDefined();
      expect(
        screen.getByRole("link", { name: /my appointments/i }),
      ).toBeDefined();
      expect(screen.getByTestId("user-button")).toBeDefined();
    });
  });

  describe("Loading State", () => {
    beforeEach(() => {
      mockUserState = {
        isLoaded: false,
        isSignedIn: false,
        user: undefined,
      };
    });

    it("renders loading indicator and does not show sign-in buttons or protected links", () => {
      render(<Navbar />);

      expect(screen.getByRole("status")).toBeDefined();
      expect(screen.getByLabelText("Loading authentication")).toBeDefined();

      expect(screen.queryByRole("link", { name: /sign in/i })).toBeNull();
      expect(screen.queryByRole("link", { name: /get started/i })).toBeNull();
      expect(screen.queryByRole("link", { name: /my tickets/i })).toBeNull();
      expect(
        screen.queryByRole("link", { name: /my appointments/i }),
      ).toBeNull();
      expect(screen.queryByRole("link", { name: /staff console/i })).toBeNull();
      expect(
        screen.queryByRole("link", { name: /admin dashboard/i }),
      ).toBeNull();
      expect(screen.queryByTestId("user-button")).toBeNull();
    });
  });

  describe("Responsive Navigation Layout", () => {
    it("renders both Main navigation (desktop) and Mobile navigation (mobile)", () => {
      render(<Navbar />);

      const mainNav = screen.getByLabelText("Main navigation");
      expect(mainNav).toBeDefined();
      expect(mainNav.className).toContain("hidden");
      expect(mainNav.className).toContain("md:flex");

      const mobileNav = screen.getByLabelText("Mobile navigation");
      expect(mobileNav).toBeDefined();
      expect(mobileNav.className).toContain("md:hidden");

      // Verify both navigations contain Explore Organizations
      const allExploreLinks = screen.getAllByRole("link", {
        name: /explore organizations/i,
      });
      expect(allExploreLinks.length).toBe(2);
      expect(allExploreLinks[0].getAttribute("href")).toBe("/organizations");
      expect(allExploreLinks[1].getAttribute("href")).toBe("/organizations");
    });
  });
});
