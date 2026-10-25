// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import {
  OperatingHoursManagement,
  type ScheduleIntervalItem,
  type ClosureItem,
} from "./OperatingHoursManagement";

// Mock router
const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

const mockIntervals: ScheduleIntervalItem[] = [
  {
    id: "interval-1",
    organizationId: "org-1",
    dayOfWeek: 1, // Monday
    startTime: "09:00",
    endTime: "13:00",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "interval-2",
    organizationId: "org-1",
    dayOfWeek: 1, // Monday (Shift 2)
    startTime: "14:00",
    endTime: "18:00",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "interval-3",
    organizationId: "org-1",
    dayOfWeek: 2, // Tuesday
    startTime: "08:30",
    endTime: "16:30",
    isActive: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const mockClosures: ClosureItem[] = [
  {
    id: "closure-1",
    organizationId: "org-1",
    startDate: "2026-12-25",
    endDate: "2026-12-25",
    reason: "Christmas Day",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "closure-2",
    organizationId: "org-1",
    startDate: "2026-12-31",
    endDate: "2027-01-01",
    reason: "New Year Holiday",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function jsonResponse(data: unknown, status = 200) {
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

describe("OperatingHoursManagement Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading skeleton while fetching schedule and closures", () => {
    const deferredSchedule = createDeferred<Response>();
    const deferredClosures = createDeferred<Response>();

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/schedule")) return deferredSchedule.promise;
      if (url.includes("/closures")) return deferredClosures.promise;
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);

    expect(screen.getByLabelText("Loading operating hours")).toBeDefined();
  });

  it("redirects to sign-in when schedule returns 401 Unauthorized", async () => {
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/schedule")) {
        return Promise.resolve(jsonResponse({ error: "Unauthorized" }, 401));
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/sign-in?redirect_url=${encodeURIComponent("/admin")}`,
      );
    });
  });

  it("displays schedule error and retries successfully when retry button is clicked", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/schedule")) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(jsonResponse({ error: "DB error" }, 500));
        }
        return Promise.resolve(jsonResponse(mockIntervals));
      }
      return Promise.resolve(jsonResponse(mockClosures));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert.textContent).toContain("Failed to load working schedule");

    const retryBtn = screen.getByRole("button", { name: /retry schedule/i });
    fireEvent.click(retryBtn);

    expect(await screen.findByText("09:00 - 13:00")).toBeDefined();
  });

  it("renders all seven days with their intervals and closed states", async () => {
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/schedule")) {
        return Promise.resolve(jsonResponse(mockIntervals));
      }
      return Promise.resolve(jsonResponse(mockClosures));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);

    // All days displayed
    expect(await screen.findByText("Monday")).toBeDefined();
    expect(screen.getByText("Tuesday")).toBeDefined();
    expect(screen.getByText("Wednesday")).toBeDefined();
    expect(screen.getByText("Thursday")).toBeDefined();
    expect(screen.getByText("Friday")).toBeDefined();
    expect(screen.getByText("Saturday")).toBeDefined();
    expect(screen.getByText("Sunday")).toBeDefined();

    // Monday shows two intervals
    expect(screen.getByText("09:00 - 13:00")).toBeDefined();
    expect(screen.getByText("14:00 - 18:00")).toBeDefined();

    // Tuesday shows inactive interval
    expect(screen.getByText("08:30 - 16:30")).toBeDefined();

    // Wednesday, Thursday, Friday, Saturday, Sunday show Closed
    const closedBadges = screen.getAllByText("Closed");
    expect(closedBadges.length).toBeGreaterThanOrEqual(4);
  });

  it("renders existing closures with dates, reason, and status badges", async () => {
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/schedule")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse(mockClosures));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);

    expect(await screen.findByText("Christmas Day")).toBeDefined();
    expect(screen.getByText("New Year Holiday")).toBeDefined();
    expect(screen.getByText("2026-12-25")).toBeDefined();
  });

  it("displays empty state when no closures are scheduled", async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));

    render(<OperatingHoursManagement organizationId="org-1" />);

    expect(
      await screen.findByText("No exceptional closures scheduled"),
    ).toBeDefined();
  });

  it("validates time constraints client-side when adding an interval", async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("Weekly Operating Hours")).toBeDefined();

    // Click Add Hours button
    fireEvent.click(screen.getByRole("button", { name: /^add hours$/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();

    const startInput = within(dialog).getByLabelText(/opening time/i);
    const endInput = within(dialog).getByLabelText(/closing time/i);
    const saveBtn = within(dialog).getByRole("button", { name: /save interval/i });

    // Set end time earlier than start time (17:00 -> 09:00)
    fireEvent.change(startInput, { target: { value: "17:00" } });
    fireEvent.change(endInput, { target: { value: "09:00" } });
    fireEvent.click(saveBtn);

    expect(
      await within(dialog).findByText("Start time must be earlier than end time."),
    ).toBeDefined();
  });

  it("validates overlapping intervals client-side before sending POST request", async () => {
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/schedule")) {
        return Promise.resolve(jsonResponse(mockIntervals));
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("09:00 - 13:00")).toBeDefined();

    // Click + Add Shift under Monday
    const addShiftButtons = screen.getAllByRole("button", { name: /\+ add shift/i });
    fireEvent.click(addShiftButtons[0]); // Monday is first in list

    const dialog = screen.getByRole("dialog");
    const daySelect = within(dialog).getByLabelText(/day of week/i);
    const startInput = within(dialog).getByLabelText(/opening time/i);
    const endInput = within(dialog).getByLabelText(/closing time/i);
    const saveBtn = within(dialog).getByRole("button", { name: /save interval/i });

    // Select Monday (value 1)
    fireEvent.change(daySelect, { target: { value: "1" } });
    // Overlaps with 09:00 - 13:00
    fireEvent.change(startInput, { target: { value: "10:00" } });
    fireEvent.change(endInput, { target: { value: "12:00" } });
    fireEvent.click(saveBtn);

    expect(
      await within(dialog).findByText(/overlaps with existing active hours/i),
    ).toBeDefined();
  });

  it("creates a new schedule interval and updates the UI", async () => {
    let postBody: unknown;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "POST" && url.includes("/schedule")) {
        postBody = JSON.parse(init.body as string);
        return Promise.resolve(
          jsonResponse(
            {
              id: "interval-new",
              organizationId: "org-1",
              dayOfWeek: 3, // Wednesday
              startTime: "10:00",
              endTime: "16:00",
              isActive: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            201,
          ),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("Weekly Operating Hours")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^add hours$/i }));

    const dialog = screen.getByRole("dialog");
    const daySelect = within(dialog).getByLabelText(/day of week/i);
    const startInput = within(dialog).getByLabelText(/opening time/i);
    const endInput = within(dialog).getByLabelText(/closing time/i);
    const saveBtn = within(dialog).getByRole("button", { name: /save interval/i });

    fireEvent.change(daySelect, { target: { value: "3" } });
    fireEvent.change(startInput, { target: { value: "10:00" } });
    fireEvent.change(endInput, { target: { value: "16:00" } });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText("Schedule interval added successfully."),
    ).toBeDefined();
    expect(postBody).toEqual({
      dayOfWeek: 3,
      startTime: "10:00",
      endTime: "16:00",
      isActive: true,
    });
    expect(screen.getByText("10:00 - 16:00")).toBeDefined();
  });

  it("edits an existing schedule interval", async () => {
    let patchBody: unknown;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "PATCH" && url.includes("/schedule/interval-1")) {
        patchBody = JSON.parse(init.body as string);
        return Promise.resolve(
          jsonResponse({
            ...mockIntervals[0],
            startTime: "08:00",
            endTime: "12:00",
          }),
        );
      }
      if (url.includes("/schedule")) {
        return Promise.resolve(jsonResponse(mockIntervals));
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("09:00 - 13:00")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: /edit monday interval 09:00 to 13:00/i,
      }),
    );

    const dialog = screen.getByRole("dialog");
    const startInput = within(dialog).getByLabelText(/opening time/i);
    const endInput = within(dialog).getByLabelText(/closing time/i);
    const saveBtn = within(dialog).getByRole("button", { name: /save interval/i });

    fireEvent.change(startInput, { target: { value: "08:00" } });
    fireEvent.change(endInput, { target: { value: "12:00" } });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText("Schedule interval updated successfully."),
    ).toBeDefined();
    expect(patchBody).toEqual({
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "12:00",
      isActive: true,
    });
    expect(screen.getByText("08:00 - 12:00")).toBeDefined();
  });

  it("toggles single interval active/inactive status", async () => {
    let patchBody: unknown;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "PATCH" && url.includes("/schedule/interval-1")) {
        patchBody = JSON.parse(init.body as string);
        return Promise.resolve(
          jsonResponse({
            ...mockIntervals[0],
            isActive: false,
          }),
        );
      }
      if (url.includes("/schedule")) {
        return Promise.resolve(jsonResponse(mockIntervals));
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("09:00 - 13:00")).toBeDefined();

    // Click Pause button for interval-1
    const pauseButtons = screen.getAllByRole("button", { name: /^pause$/i });
    fireEvent.click(pauseButtons[0]);

    await waitFor(() => {
      expect(patchBody).toEqual({ isActive: false });
    });
    expect(
      await screen.findByText(/interval 09:00 - 13:00 deactivated/i),
    ).toBeDefined();
  });

  it("deletes a schedule interval after confirmation", async () => {
    let deleteCalled = false;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "DELETE" && url.includes("/schedule/interval-1")) {
        deleteCalled = true;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.includes("/schedule")) {
        return Promise.resolve(jsonResponse(mockIntervals));
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("09:00 - 13:00")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", {
        name: /delete monday interval 09:00 to 13:00/i,
      }),
    );

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
    expect(
      await screen.findByText("Schedule interval deleted successfully."),
    ).toBeDefined();
    expect(screen.queryByText("09:00 - 13:00")).toBeNull();
  });

  it("disables a day by deactivating all active intervals for that day", async () => {
    const patchedIntervalIds: string[] = [];
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "PATCH" && url.includes("/schedule/")) {
        const id = url.split("/schedule/")[1];
        patchedIntervalIds.push(id);
        const interval = mockIntervals.find((i) => i.id === id);
        return Promise.resolve(jsonResponse({ ...interval, isActive: false }));
      }
      if (url.includes("/schedule")) {
        return Promise.resolve(jsonResponse(mockIntervals));
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("09:00 - 13:00")).toBeDefined();

    // Toggle Monday off (Monday has interval-1 and interval-2 active)
    fireEvent.click(
      screen.getByRole("button", { name: /toggle monday opening status/i }),
    );

    await waitFor(() => {
      expect(patchedIntervalIds).toContain("interval-1");
      expect(patchedIntervalIds).toContain("interval-2");
    });
    expect(await screen.findByText("Monday marked as closed.")).toBeDefined();
  });

  it("creates a new exceptional closure", async () => {
    let postBody: unknown;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "POST" && url.includes("/closures")) {
        postBody = JSON.parse(init.body as string);
        return Promise.resolve(
          jsonResponse(
            {
              id: "closure-new",
              organizationId: "org-1",
              startDate: "2026-11-26",
              endDate: "2026-11-27",
              reason: "Thanksgiving Break",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            201,
          ),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(
      await screen.findByText("Exceptional Closures & Holidays"),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^add closure$/i }));

    const dialog = screen.getByRole("dialog");
    const startInput = within(dialog).getByLabelText(/start date/i);
    const endInput = within(dialog).getByLabelText(/end date/i);
    const reasonInput = within(dialog).getByLabelText(/reason/i);
    const saveBtn = within(dialog).getByRole("button", { name: /save closure/i });

    fireEvent.change(startInput, { target: { value: "2026-11-26" } });
    fireEvent.change(endInput, { target: { value: "2026-11-27" } });
    fireEvent.change(reasonInput, { target: { value: "Thanksgiving Break" } });
    fireEvent.click(saveBtn);

    expect(
      await screen.findByText("Closure created successfully."),
    ).toBeDefined();
    expect(postBody).toEqual({
      startDate: "2026-11-26",
      endDate: "2026-11-27",
      reason: "Thanksgiving Break",
    });
    expect(screen.getByText("Thanksgiving Break")).toBeDefined();
  });

  it("validates closure dates rejecting endDate earlier than startDate", async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(
      await screen.findByText("Exceptional Closures & Holidays"),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^add closure$/i }));

    const dialog = screen.getByRole("dialog");
    const startInput = within(dialog).getByLabelText(/start date/i);
    const endInput = within(dialog).getByLabelText(/end date/i);
    const saveBtn = within(dialog).getByRole("button", { name: /save closure/i });

    fireEvent.change(startInput, { target: { value: "2026-12-25" } });
    fireEvent.change(endInput, { target: { value: "2026-12-20" } });
    fireEvent.click(saveBtn);

    expect(
      await within(dialog).findByText(
        "End date must be greater than or equal to start date.",
      ),
    ).toBeDefined();
  });

  it("edits an existing exceptional closure", async () => {
    let patchBody: unknown;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "PATCH" && url.includes("/closures/closure-1")) {
        patchBody = JSON.parse(init.body as string);
        return Promise.resolve(
          jsonResponse({
            ...mockClosures[0],
            reason: "Christmas Day (Observed)",
          }),
        );
      }
      if (url.includes("/closures")) {
        return Promise.resolve(jsonResponse(mockClosures));
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("Christmas Day")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: /edit closure for 2026-12-25/i }),
    );

    const dialog = screen.getByRole("dialog");
    const reasonInput = within(dialog).getByLabelText(/reason/i);
    const saveBtn = within(dialog).getByRole("button", { name: /save closure/i });

    fireEvent.change(reasonInput, { target: { value: "Christmas Day (Observed)" } });
    fireEvent.click(saveBtn);

    expect(await screen.findByText("Closure updated successfully.")).toBeDefined();
    expect(patchBody).toEqual({
      startDate: "2026-12-25",
      endDate: "2026-12-25",
      reason: "Christmas Day (Observed)",
    });
    expect(screen.getByText("Christmas Day (Observed)")).toBeDefined();
  });

  it("deletes an exceptional closure after confirmation", async () => {
    let deleteCalled = false;
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "DELETE" && url.includes("/closures/closure-1")) {
        deleteCalled = true;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.includes("/closures")) {
        return Promise.resolve(jsonResponse(mockClosures));
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<OperatingHoursManagement organizationId="org-1" />);
    expect(await screen.findByText("Christmas Day")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: /delete closure for 2026-12-25/i }),
    );

    await waitFor(() => {
      expect(deleteCalled).toBe(true);
    });
    expect(await screen.findByText("Closure deleted successfully.")).toBeDefined();
    expect(screen.queryByText("Christmas Day")).toBeNull();
  });

  it("prevents stale responses when organizationId changes", async () => {
    const deferredOrg1Schedule = createDeferred<Response>();
    const deferredOrg1Closures = createDeferred<Response>();

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("org-1/schedule")) return deferredOrg1Schedule.promise;
      if (url.includes("org-1/closures")) return deferredOrg1Closures.promise;
      if (url.includes("org-2/schedule")) {
        return Promise.resolve(
          jsonResponse([
            {
              id: "interval-org2",
              organizationId: "org-2",
              dayOfWeek: 4, // Thursday
              startTime: "11:00",
              endTime: "19:00",
              isActive: true,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ]),
        );
      }
      if (url.includes("org-2/closures")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.reject(new Error(`Unhandled: ${url}`));
    });

    const { rerender } = render(<OperatingHoursManagement organizationId="org-1" />);

    // Rapidly switch to org-2 before org-1 resolves
    rerender(<OperatingHoursManagement organizationId="org-2" />);

    // Now resolve org-1 with stale data
    deferredOrg1Schedule.resolve(jsonResponse(mockIntervals));
    deferredOrg1Closures.resolve(jsonResponse(mockClosures));

    // Verify org-2's data is displayed, NOT org-1's
    expect(await screen.findByText("11:00 - 19:00")).toBeDefined();
    expect(screen.queryByText("09:00 - 13:00")).toBeNull();
    expect(screen.queryByText("Christmas Day")).toBeNull();
  });
});
