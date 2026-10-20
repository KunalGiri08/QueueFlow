// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  StaffAssignedQueues,
  type OperatorQueueItem,
} from "./StaffAssignedQueues";

afterEach(() => {
  cleanup();
});

const mockQueues: OperatorQueueItem[] = [
  {
    id: "queue-1",
    name: "General Line",
    isActive: true,
    service: {
      id: "service-1",
      name: "Check-in",
    },
    waitingCount: 5,
    currentlyServing: 12,
  },
  {
    id: "queue-2",
    name: "Priority Line",
    isActive: true,
    service: {
      id: "service-2",
      name: "Express Triage",
    },
    waitingCount: 0,
    currentlyServing: null,
  },
];

describe("StaffAssignedQueues", () => {
  it("renders empty state with organization name when assignedQueues is empty", () => {
    render(
      <StaffAssignedQueues
        assignedQueues={[]}
        isRefreshingQueues={false}
        onRefreshQueues={vi.fn()}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
        organizationName="Apex Healthcare"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No Queues Assigned" }),
    ).toBeDefined();
    expect(screen.getByText("Apex Healthcare")).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /Call next ticket/i }),
    ).toBeNull();
  });

  it("renders queue card details including name, service, Active badge, waiting count, and serving number", () => {
    render(
      <StaffAssignedQueues
        assignedQueues={[mockQueues[0]]}
        isRefreshingQueues={false}
        onRefreshQueues={vi.fn()}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
        organizationName="Apex Healthcare"
      />,
    );

    expect(screen.getByText("General Line")).toBeDefined();
    expect(screen.getByText("Service: Check-in")).toBeDefined();
    expect(screen.getByText("Active")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("#12")).toBeDefined();
  });

  it("falls back to 'None' when currentlyServing is null", () => {
    render(
      <StaffAssignedQueues
        assignedQueues={[mockQueues[1]]}
        isRefreshingQueues={false}
        onRefreshQueues={vi.fn()}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
        organizationName="Apex Healthcare"
      />,
    );

    expect(screen.getByText("Priority Line")).toBeDefined();
    expect(screen.getByText("None")).toBeDefined();
  });

  it("invokes onRefreshQueues when Refresh button is clicked", () => {
    const handleRefresh = vi.fn();
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={false}
        onRefreshQueues={handleRefresh}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
      />,
    );

    const refreshBtn = screen.getByRole("button", { name: "Refresh queues" });
    fireEvent.click(refreshBtn);

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it("displays 'Refreshing...' and disables the button when isRefreshingQueues is true", () => {
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={true}
        onRefreshQueues={vi.fn()}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
      />,
    );

    const refreshBtn = screen.getByRole("button", {
      name: "Refresh queues",
    }) as HTMLButtonElement;
    expect(refreshBtn.textContent).toContain("Refreshing...");
    expect(refreshBtn.disabled).toBe(true);
  });

  it("disables Refresh button when isRefreshDisabled is true", () => {
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={false}
        isRefreshDisabled={true}
        onRefreshQueues={vi.fn()}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
      />,
    );

    const refreshBtn = screen.getByRole("button", {
      name: "Refresh queues",
    }) as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);
  });

  it("renders queue refresh error banner and invokes onRefreshQueues when Retry is clicked", () => {
    const handleRefresh = vi.fn();
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={false}
        onRefreshQueues={handleRefresh}
        queuesError="Failed to refresh queues."
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Failed to refresh queues.");

    const retryBtn = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryBtn);

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it("renders Call Next error banner with dismiss button and invokes onDismissCallError when clicked", () => {
    const handleDismiss = vi.fn();
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={false}
        onRefreshQueues={vi.fn()}
        callActionError="Please select an active assigned counter before calling a ticket."
        onDismissCallError={handleDismiss}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Unable to Call Next Ticket");
    expect(alert.textContent).toContain(
      "Please select an active assigned counter before calling a ticket.",
    );

    const dismissBtn = screen.getByRole("button", { name: "Dismiss error" });
    fireEvent.click(dismissBtn);

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render any alerts when queuesError and callActionError are null", () => {
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={false}
        onRefreshQueues={vi.fn()}
        queuesError={null}
        callActionError={null}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={() => true}
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("invokes onCallNext callback with the correct queue object when Call Next Ticket is clicked", () => {
    const handleCallNext = vi.fn();
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={false}
        onRefreshQueues={vi.fn()}
        callingQueueId={null}
        onCallNext={handleCallNext}
        canCallNext={() => true}
      />,
    );

    const callBtn = screen.getByRole("button", {
      name: "Call next ticket for General Line",
    });
    fireEvent.click(callBtn);

    expect(handleCallNext).toHaveBeenCalledTimes(1);
    expect(handleCallNext).toHaveBeenCalledWith(mockQueues[0]);
  });

  it("displays spinner and 'Calling Next Ticket...' only for the active queue being called", () => {
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={false}
        onRefreshQueues={vi.fn()}
        callingQueueId="queue-1"
        onCallNext={vi.fn()}
        canCallNext={() => false}
      />,
    );

    const activeCallingBtn = screen.getByRole("button", {
      name: "Call next ticket for General Line",
    }) as HTMLButtonElement;
    expect(activeCallingBtn.textContent).toContain("Calling Next Ticket...");
    expect(activeCallingBtn.disabled).toBe(true);

    const otherBtn = screen.getByRole("button", {
      name: "Call next ticket for Priority Line",
    }) as HTMLButtonElement;
    expect(otherBtn.textContent).toContain("Call Next Ticket");
    expect(otherBtn.disabled).toBe(true);
  });

  it("disables Call Next button when canCallNext returns false", () => {
    render(
      <StaffAssignedQueues
        assignedQueues={mockQueues}
        isRefreshingQueues={false}
        onRefreshQueues={vi.fn()}
        callingQueueId={null}
        onCallNext={vi.fn()}
        canCallNext={(q) => q.id !== "queue-1"}
      />,
    );

    const q1Btn = screen.getByRole("button", {
      name: "Call next ticket for General Line",
    }) as HTMLButtonElement;
    expect(q1Btn.disabled).toBe(true);

    const q2Btn = screen.getByRole("button", {
      name: "Call next ticket for Priority Line",
    }) as HTMLButtonElement;
    expect(q2Btn.disabled).toBe(false);
  });
});
