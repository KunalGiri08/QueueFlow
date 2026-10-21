// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
  StaffAppointmentsManagement,
  type StaffOrganizationAppointment,
} from "./StaffAppointmentsManagement";

const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockAppointments: StaffOrganizationAppointment[] = [
  {
    id: "app-1",
    scheduledAt: "2026-10-22T09:00:00.000Z",
    status: "BOOKED",
    createdAt: "2026-10-20T10:00:00.000Z",
    service: {
      id: "srv-1",
      name: "General Consultation",
    },
    user: {
      id: "usr-1",
      name: "Alice Johnson",
      email: "alice@example.com",
    },
  },
  {
    id: "app-2",
    scheduledAt: "2026-10-22T10:30:00.000Z",
    status: "COMPLETED",
    createdAt: "2026-10-20T11:00:00.000Z",
    service: {
      id: "srv-2",
      name: "Vaccination",
    },
    user: {
      id: "usr-2",
      name: "Bob Smith",
      email: "bob@example.com",
    },
  },
  {
    id: "app-3",
    scheduledAt: "2026-10-22T14:00:00.000Z",
    status: "NO_SHOW",
    createdAt: "2026-10-20T12:00:00.000Z",
    service: {
      id: "srv-1",
      name: "General Consultation",
    },
    user: {
      id: "usr-3",
      name: null,
      email: "charlie@example.com",
    },
  },
];

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("StaffAppointmentsManagement", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();

    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/organizations/org-1/appointments")) {
        return Promise.resolve(jsonResponse(mockAppointments));
      }
      return Promise.resolve(jsonResponse([]));
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders loading skeleton while fetching appointments", async () => {
    const deferred = createDeferred<Response>();
    fetchMock.mockImplementation(() => deferred.promise);

    render(<StaffAppointmentsManagement organizationId="org-1" organizationName="Apex Health" />);

    expect(screen.getByRole("status", { name: "Loading appointments" })).toBeDefined();
    expect(screen.getByText(/Apex Health/)).toBeDefined();

    deferred.resolve(jsonResponse([]));
    await waitFor(() => {
      expect(screen.getByText("No Appointments Scheduled")).toBeDefined();
    });
  });

  it("renders the appointment list on successful load", async () => {
    render(<StaffAppointmentsManagement organizationId="org-1" organizationName="Apex Health" />);

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });

    expect(screen.getByText("alice@example.com")).toBeDefined();
    expect(screen.getAllByText("General Consultation")).toHaveLength(2);
    expect(screen.getByText("Bob Smith")).toBeDefined();
    expect(screen.getByText("bob@example.com")).toBeDefined();
    expect(screen.getByText("Vaccination")).toBeDefined();
    // User without name falls back to "Customer"
    expect(screen.getByText("Customer")).toBeDefined();
    expect(screen.getByText("charlie@example.com")).toBeDefined();
  });

  it("renders empty state when organization has no appointments", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    render(<StaffAppointmentsManagement organizationId="org-empty" organizationName="Empty Clinic" />);

    await waitFor(() => {
      expect(screen.getByText("No Appointments Scheduled")).toBeDefined();
    });

    expect(
      screen.getByText(/There are currently no customer appointments booked for Empty Clinic/i),
    ).toBeDefined();
  });

  it("handles fetch errors with retry button", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Internal error", { status: 500 }));

    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
    });

    expect(
      screen.getByText("Unable to load scheduled appointments. Please try again."),
    ).toBeDefined();

    // Now clicking retry succeeds
    fetchMock.mockResolvedValueOnce(jsonResponse(mockAppointments));
    fireEvent.click(screen.getByRole("button", { name: "Retry Loading" }));

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });
  });

  it("redirects to sign-in on 401 unauthorized", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fstaff");
    });
  });

  it("displays permission error on 403 forbidden", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));

    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("You do not have permission to view appointments for this organization."),
      ).toBeDefined();
    });
  });

  it("filters appointments by status when filter pill is clicked", async () => {
    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });

    // Initial count checks on filter buttons
    expect(screen.getByRole("button", { name: /^Booked 1$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Completed 1$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^No Show 1$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Cancelled 0$/i })).toBeDefined();

    // Filter to BOOKED
    fireEvent.click(screen.getByRole("button", { name: /^Booked 1$/i }));

    expect(screen.getByText("Alice Johnson")).toBeDefined();
    expect(screen.queryByText("Bob Smith")).toBeNull();
    expect(screen.queryByText("charlie@example.com")).toBeNull();

    // Filter to CANCELLED (0 matches)
    fireEvent.click(screen.getByRole("button", { name: /^Cancelled 0$/i }));

    expect(screen.getByText(/No appointments matching the “cancelled” filter/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Reset to All/i })).toBeDefined();

    // Reset to All
    fireEvent.click(screen.getByRole("button", { name: /Reset to All/i }));
    expect(screen.getByText("Alice Johnson")).toBeDefined();
    expect(screen.getByText("Bob Smith")).toBeDefined();
  });

  it("allows only BOOKED appointments to be marked COMPLETED or NO_SHOW", async () => {
    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });

    // BOOKED row (app-1) has Complete and No Show buttons
    const completeBtn = screen.getByRole("button", {
      name: "Mark appointment for Alice Johnson as completed",
    });
    const noShowBtn = screen.getByRole("button", {
      name: "Mark appointment for Alice Johnson as no show",
    });
    expect(completeBtn).toBeDefined();
    expect(noShowBtn).toBeDefined();

    // COMPLETED row (app-2) and NO_SHOW row (app-3) have "No actions available"
    const noActionLabels = screen.getAllByText("No actions available");
    expect(noActionLabels).toHaveLength(2);
  });

  it("successfully marks a booked appointment as COMPLETED", async () => {
    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/organizations/org-1/appointments/app-1") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ id: "app-1", status: "COMPLETED" }));
      }
      return Promise.resolve(jsonResponse(mockAppointments));
    });

    const completeBtn = screen.getByRole("button", {
      name: "Mark appointment for Alice Johnson as completed",
    });

    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/organizations/org-1/appointments/app-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "COMPLETED" }),
        }),
      );
    });

    // Status is updated to completed and action buttons are replaced with "No actions available"
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Mark appointment for Alice Johnson as completed",
        }),
      ).toBeNull();
    });
  });

  it("successfully marks a booked appointment as NO_SHOW", async () => {
    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/organizations/org-1/appointments/app-1") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ id: "app-1", status: "NO_SHOW" }));
      }
      return Promise.resolve(jsonResponse(mockAppointments));
    });

    const noShowBtn = screen.getByRole("button", {
      name: "Mark appointment for Alice Johnson as no show",
    });

    fireEvent.click(noShowBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/organizations/org-1/appointments/app-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "NO_SHOW" }),
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Mark appointment for Alice Johnson as no show",
        }),
      ).toBeNull();
    });
  });

  it("handles 409 conflict during status update by notifying user and refetching", async () => {
    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/organizations/org-1/appointments/app-1") && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse({ error: "Status changed" }, 409));
      }
      if (url.includes("/api/organizations/org-1/appointments")) {
        // Return updated list where app-1 is already COMPLETED
        return Promise.resolve(
          jsonResponse([
            { ...mockAppointments[0], status: "COMPLETED" },
            mockAppointments[1],
            mockAppointments[2],
          ]),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    const completeBtn = screen.getByRole("button", {
      name: "Mark appointment for Alice Johnson as completed",
    });

    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(
        screen.getByText("Appointment status changed or conflict occurred; refreshed list."),
      ).toBeDefined();
    });

    // Fresh fetch confirmed app-1 is completed
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Mark appointment for Alice Johnson as completed",
        }),
      ).toBeNull();
    });
  });

  it("prevents duplicate submissions while an action is in flight", async () => {
    render(<StaffAppointmentsManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });

    const patchDeferred = createDeferred<Response>();
    let patchCount = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/organizations/org-1/appointments/app-1") && init?.method === "PATCH") {
        patchCount++;
        return patchDeferred.promise;
      }
      return Promise.resolve(jsonResponse(mockAppointments));
    });

    const completeBtn = screen.getByRole("button", {
      name: "Mark appointment for Alice Johnson as completed",
    });

    // Rapid double click
    fireEvent.click(completeBtn);
    fireEvent.click(completeBtn);

    expect(patchCount).toBe(1);

    patchDeferred.resolve(jsonResponse({ id: "app-1", status: "COMPLETED" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "Mark appointment for Alice Johnson as completed",
        }),
      ).toBeNull();
    });
  });

  it("handles organization switching safely and ignores stale responses", async () => {
    const org2Appointments: StaffOrganizationAppointment[] = [
      {
        id: "app-org2-1",
        scheduledAt: "2026-10-23T11:00:00.000Z",
        status: "BOOKED",
        createdAt: "2026-10-21T10:00:00.000Z",
        service: {
          id: "srv-99",
          name: "Dental Checkup",
        },
        user: {
          id: "usr-99",
          name: "Daniel Craig",
          email: "daniel@example.com",
        },
      },
    ];

    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/api/organizations/org-1/appointments")) {
        return Promise.resolve(jsonResponse(mockAppointments));
      }
      if (url.includes("/api/organizations/org-2/appointments")) {
        return Promise.resolve(jsonResponse(org2Appointments));
      }
      return Promise.resolve(jsonResponse([]));
    });

    const { rerender } = render(
      <StaffAppointmentsManagement organizationId="org-1" organizationName="Apex Health" />,
    );

    await waitFor(() => {
      expect(screen.getByText("Alice Johnson")).toBeDefined();
    });

    // Switch organization to org-2
    rerender(<StaffAppointmentsManagement organizationId="org-2" organizationName="Beacon Dental" />);

    await waitFor(() => {
      expect(screen.getByText("Daniel Craig")).toBeDefined();
    });

    expect(screen.getByText("Dental Checkup")).toBeDefined();
    expect(screen.queryByText("Alice Johnson")).toBeNull();
  });
});
