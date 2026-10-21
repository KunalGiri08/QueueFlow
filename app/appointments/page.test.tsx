// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import MyAppointmentsPage from "./page";

// 1. Mock Next.js navigation with stable router object identity
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

// 3. Mock Navbar to isolate page from global header
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

const futureIso = new Date(Date.now() + 86_400_000).toISOString();
const pastIso = new Date(Date.now() - 86_400_000).toISOString();

const mockBookedAppointment = {
  id: "appt-1",
  userId: "user-1",
  serviceId: "svc-1",
  scheduledAt: futureIso,
  status: "BOOKED",
  createdAt: "2026-10-18T10:00:00.000Z",
  updatedAt: "2026-10-18T10:00:00.000Z",
  service: {
    id: "svc-1",
    name: "General Consultation",
    organization: {
      id: "org-1",
      name: "City Health Clinic",
    },
  },
};

const mockCompletedAppointment = {
  id: "appt-2",
  userId: "user-1",
  serviceId: "svc-2",
  scheduledAt: pastIso,
  status: "COMPLETED",
  createdAt: "2026-10-15T10:00:00.000Z",
  updatedAt: "2026-10-15T11:00:00.000Z",
  service: {
    id: "svc-2",
    name: "Dental Checkup",
    organization: {
      id: "org-2",
      name: "Smile Care Dental",
    },
  },
};

const mockCancelledAppointment = {
  id: "appt-3",
  userId: "user-1",
  serviceId: "svc-1",
  scheduledAt: futureIso,
  status: "CANCELLED",
  createdAt: "2026-10-16T10:00:00.000Z",
  updatedAt: "2026-10-16T10:30:00.000Z",
  service: {
    id: "svc-1",
    name: "General Consultation",
    organization: {
      id: "org-1",
      name: "City Health Clinic",
    },
  },
};

const mockNoShowAppointment = {
  id: "appt-4",
  userId: "user-1",
  serviceId: "svc-3",
  scheduledAt: pastIso,
  status: "NO_SHOW",
  createdAt: "2026-10-10T10:00:00.000Z",
  updatedAt: "2026-10-10T12:00:00.000Z",
  service: {
    id: "svc-3",
    name: "Eye Examination",
    organization: {
      id: "org-3",
      name: "Vision Center",
    },
  },
};

describe("app/appointments/page (My Appointments Customer Frontend)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let activeFetchHandler: (url: string, init?: RequestInit) => Promise<Response> | Response;

  beforeEach(() => {
    mockAuthState = {
      isSignedIn: true,
      isLoaded: true,
    };
    mockPush.mockReset();

    activeFetchHandler = async (url: string) => {
      if (url === "/api/appointments") {
        return jsonResponse([mockBookedAppointment]);
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
    it("renders loading skeleton and does not redirect while Clerk is loading", () => {
      mockAuthState = {
        isSignedIn: false,
        isLoaded: false,
      };

      render(<MyAppointmentsPage />);

      expect(screen.getByLabelText("Loading your appointments")).toBeDefined();
      expect(mockPush).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redirects to sign-in with return URL when Clerk reports user is unauthenticated", () => {
      mockAuthState = {
        isSignedIn: false,
        isLoaded: true,
      };

      render(<MyAppointmentsPage />);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fappointments");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redirects to sign-in when /api/appointments returns 401 Unauthorized", async () => {
      activeFetchHandler = async () => jsonResponse({ error: "Unauthorized" }, 401);

      render(<MyAppointmentsPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/sign-in?redirect_url=%2Fappointments");
      });
    });
  });

  describe("Initial appointment fetching and loading state", () => {
    it("renders loading skeleton while appointments are in flight", () => {
      const deferred = createDeferred<Response>();
      activeFetchHandler = () => deferred.promise;

      render(<MyAppointmentsPage />);

      expect(screen.getByLabelText("Loading your appointments")).toBeDefined();
      expect(screen.queryByText("General Consultation")).toBeNull();
    });

    it("displays customer appointments with metadata, status badges, and action buttons for booked status", async () => {
      activeFetchHandler = async (url: string) => {
        if (url === "/api/appointments") {
          return jsonResponse([
            mockBookedAppointment,
            mockCompletedAppointment,
            mockCancelledAppointment,
            mockNoShowAppointment,
          ]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      // Verify service names and organizations
      expect(await screen.findByText("Smile Care Dental")).toBeDefined();
      expect(screen.getByText("Vision Center")).toBeDefined();
      expect(screen.getAllByText("City Health Clinic").length).toBe(2);

      // Verify status badges
      expect(screen.getByText("Booked")).toBeDefined();
      expect(screen.getByText("Completed")).toBeDefined();
      expect(screen.getByText("Cancelled")).toBeDefined();
      expect(screen.getByText("No Show")).toBeDefined();

      // Only the BOOKED appointment should have action buttons
      const rescheduleButtons = screen.getAllByRole("button", { name: /^reschedule$/i });
      expect(rescheduleButtons.length).toBe(1);

      const cancelButtons = screen.getAllByRole("button", { name: /^cancel$/i });
      expect(cancelButtons.length).toBe(1);
    });
  });

  describe("Empty state", () => {
    it("displays empty state with explore link when user has no appointments", async () => {
      activeFetchHandler = async (url: string) => {
        if (url === "/api/appointments") {
          return jsonResponse([]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      expect(
        await screen.findByRole("heading", { name: /no appointments yet/i, level: 2 }),
      ).toBeDefined();
      expect(screen.getByText(/You don't have any scheduled or past appointments/i)).toBeDefined();

      const exploreLink = screen.getByRole("link", { name: /explore organizations/i });
      expect(exploreLink).toBeDefined();
      expect(exploreLink.getAttribute("href")).toBe("/organizations");
    });
  });

  describe("Error handling and retry", () => {
    it("displays error alert when /api/appointments request fails with a server error", async () => {
      activeFetchHandler = async () => jsonResponse({ error: "Internal server error" }, 500);

      render(<MyAppointmentsPage />);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "Unable to load your appointments at this time. Please try again.",
      );

      const retryBtn = screen.getByRole("button", { name: /retry/i });
      expect(retryBtn).toBeDefined();
    });

    it("recovers and displays appointments when user clicks Retry following an error", async () => {
      let callCount = 0;
      activeFetchHandler = async (url: string) => {
        if (url === "/api/appointments") {
          callCount++;
          if (callCount === 1) {
            return jsonResponse({ error: "Internal server error" }, 500);
          }
          return jsonResponse([mockBookedAppointment]);
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      const retryBtn = await screen.findByRole("button", { name: /retry/i });
      expect(screen.getByRole("alert")).toBeDefined();

      fireEvent.click(retryBtn);

      expect(await screen.findByText("General Consultation")).toBeDefined();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText("Booked")).toBeDefined();
      expect(callCount).toBe(2);
    });
  });

  describe("Appointment cancellation flow", () => {
    it("opens Cancel dialog and cancels appointment upon confirmation, updating status to CANCELLED", async () => {
      let patchCalled = false;

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/appointments" && (!init || !init.method || init.method === "GET")) {
          return jsonResponse([mockBookedAppointment]);
        }
        if (
          url === `/api/appointments/${encodeURIComponent(mockBookedAppointment.id)}/cancel` &&
          init?.method === "PATCH"
        ) {
          patchCalled = true;
          return jsonResponse({
            ...mockBookedAppointment,
            status: "CANCELLED",
          });
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      const cancelBtn = await screen.findByRole("button", { name: /^cancel$/i });
      fireEvent.click(cancelBtn);

      // Verify dialog is displayed
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(screen.getByText("Are you sure you want to cancel your appointment for", { exact: false })).toBeDefined();

      // Click Confirm Cancellation button in dialog
      const confirmBtn = screen.getByRole("button", { name: /yes, cancel appointment/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(patchCalled).toBe(true);
      });

      // Dialog should close and status updates to Cancelled
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(screen.getByText("Cancelled")).toBeDefined();
      expect(screen.queryByRole("button", { name: /^cancel$/i })).toBeNull();
    });

    it("closes Cancel dialog without sending request when user clicks Keep Appointment", async () => {
      let patchCalled = false;

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/appointments") {
          return jsonResponse([mockBookedAppointment]);
        }
        if (init?.method === "PATCH") {
          patchCalled = true;
          return jsonResponse({});
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      const cancelBtn = await screen.findByRole("button", { name: /^cancel$/i });
      fireEvent.click(cancelBtn);

      expect(screen.getByRole("dialog")).toBeDefined();

      const keepBtn = screen.getByRole("button", { name: /keep appointment/i });
      fireEvent.click(keepBtn);

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(patchCalled).toBe(false);
      expect(screen.getByText("Booked")).toBeDefined();
    });

    it("handles 409 conflict during cancellation: shows error in dialog and refreshes appointment list", async () => {
      let getCallCount = 0;

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/appointments" && (!init || !init.method || init.method === "GET")) {
          getCallCount++;
          if (getCallCount === 1) {
            return jsonResponse([mockBookedAppointment]);
          }
          return jsonResponse([
            {
              ...mockBookedAppointment,
              status: "COMPLETED",
            },
          ]);
        }

        if (
          url === `/api/appointments/${encodeURIComponent(mockBookedAppointment.id)}/cancel` &&
          init?.method === "PATCH"
        ) {
          return jsonResponse(
            { error: "Appointment cannot be cancelled in its current state" },
            409,
          );
        }

        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      const cancelBtn = await screen.findByRole("button", { name: /^cancel$/i });
      fireEvent.click(cancelBtn);

      const confirmBtn = screen.getByRole("button", { name: /yes, cancel appointment/i });
      fireEvent.click(confirmBtn);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain(
        "Appointment cannot be cancelled in its current state",
      );

      await waitFor(() => {
        expect(getCallCount).toBe(2);
      });
    });
  });

  describe("Appointment rescheduling flow", () => {
    it("opens Reschedule dialog, validates future date, and sends PATCH request on confirmation", async () => {
      let patchBody: unknown = null;
      const newFutureDate = new Date(Date.now() + 2 * 86_400_000);
      const newFutureIso = newFutureDate.toISOString();

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/appointments" && (!init || !init.method || init.method === "GET")) {
          return jsonResponse([mockBookedAppointment]);
        }
        if (
          url === `/api/appointments/${encodeURIComponent(mockBookedAppointment.id)}` &&
          init?.method === "PATCH"
        ) {
          patchBody = JSON.parse(init.body as string);
          return jsonResponse({
            ...mockBookedAppointment,
            scheduledAt: newFutureIso,
          });
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      const rescheduleBtn = await screen.findByRole("button", { name: /^reschedule$/i });
      fireEvent.click(rescheduleBtn);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();

      const input = screen.getByLabelText(/new appointment date and time/i);
      // Format as datetime-local string
      const localString = `${newFutureDate.getFullYear()}-${String(newFutureDate.getMonth() + 1).padStart(2, "0")}-${String(newFutureDate.getDate()).padStart(2, "0")}T14:30`;
      fireEvent.change(input, { target: { value: localString } });

      const submitBtn = screen.getByRole("button", { name: /confirm reschedule/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(patchBody).not.toBeNull();
      });

      // Verify body contained scheduledAt
      expect((patchBody as { scheduledAt: string }).scheduledAt).toBeDefined();

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
    });

    it("validates client-side and prevents submission if scheduled time is in the past", async () => {
      let patchCalled = false;

      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/appointments") {
          return jsonResponse([mockBookedAppointment]);
        }
        if (init?.method === "PATCH") {
          patchCalled = true;
          return jsonResponse({});
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      const rescheduleBtn = await screen.findByRole("button", { name: /^reschedule$/i });
      fireEvent.click(rescheduleBtn);

      const input = screen.getByLabelText(/new appointment date and time/i);
      fireEvent.change(input, { target: { value: "2020-01-01T10:00" } });

      const submitBtn = screen.getByRole("button", { name: /confirm reschedule/i });
      fireEvent.click(submitBtn);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Appointment must be scheduled in the future.");
      expect(patchCalled).toBe(false);
    });

    it("handles 409 conflict during rescheduling (time slot already booked)", async () => {
      activeFetchHandler = async (url: string, init?: RequestInit) => {
        if (url === "/api/appointments") {
          return jsonResponse([mockBookedAppointment]);
        }
        if (init?.method === "PATCH") {
          return jsonResponse(
            { error: "This appointment time slot is already booked" },
            409,
          );
        }
        return jsonResponse({ error: "Not found" }, 404);
      };

      render(<MyAppointmentsPage />);

      const rescheduleBtn = await screen.findByRole("button", { name: /^reschedule$/i });
      fireEvent.click(rescheduleBtn);

      const input = screen.getByLabelText(/new appointment date and time/i);
      const future = new Date(Date.now() + 3 * 86_400_000);
      const localString = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T10:00`;
      fireEvent.change(input, { target: { value: localString } });

      const submitBtn = screen.getByRole("button", { name: /confirm reschedule/i });
      fireEvent.click(submitBtn);

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("This appointment time slot is already booked");
      expect(screen.getByRole("dialog")).toBeDefined();
    });
  });

  describe("Concurrency, request cancellation, and unmount", () => {
    it("aborts in-flight request and discards stale response when newer fetch completes first", async () => {
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

      const { rerender } = render(<MyAppointmentsPage />);

      await waitFor(() => {
        expect(capturedSignals.length).toBe(1);
      });
      expect(capturedSignals[0].aborted).toBe(false);

      // Trigger second fetch via router reference change
      mockRouter = { push: mockPush };
      rerender(<MyAppointmentsPage />);

      await waitFor(() => {
        expect(capturedSignals.length).toBe(2);
      });

      // Request 1 was aborted when request 2 dispatched
      expect(capturedSignals[0].aborted).toBe(true);
      expect(capturedSignals[1].aborted).toBe(false);

      // Request 2 resolves first with mockCompletedAppointment
      deferredSecond.resolve(jsonResponse([mockCompletedAppointment]));

      expect(await screen.findByText("Dental Checkup")).toBeDefined();

      // Request 1 resolves later with stale mockBookedAppointment
      deferredFirst.resolve(jsonResponse([mockBookedAppointment]));

      // Stale response must not overwrite
      await waitFor(() => {
        expect(screen.queryByText("General Consultation")).toBeNull();
      });
      expect(screen.getByText("Dental Checkup")).toBeDefined();
    });

    it("aborts in-flight request when component unmounts", async () => {
      let capturedSignal: AbortSignal | null | undefined;

      activeFetchHandler = async (_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal;
        return createDeferred<Response>().promise;
      };

      const { unmount } = render(<MyAppointmentsPage />);

      await waitFor(() => {
        expect(capturedSignal).toBeDefined();
      });
      expect(capturedSignal!.aborted).toBe(false);

      unmount();

      expect(capturedSignal!.aborted).toBe(true);
    });

    it("silently ignores AbortError and does not display an error alert", async () => {
      let capturedSignal: AbortSignal | null | undefined;

      activeFetchHandler = async (_url: string, init?: RequestInit) => {
        capturedSignal = init?.signal;
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The user aborted a request.", "AbortError"));
          });
        });
      };

      const { rerender } = render(<MyAppointmentsPage />);

      await waitFor(() => {
        expect(capturedSignal).toBeDefined();
      });

      // Trigger newer fetch to abort the in-flight request
      mockRouter = { push: mockPush };
      rerender(<MyAppointmentsPage />);

      await waitFor(() => {
        expect(capturedSignal!.aborted).toBe(true);
      });

      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
