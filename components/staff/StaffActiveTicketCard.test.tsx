// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  StaffActiveTicketCard,
  type ActiveTicket,
} from "./StaffActiveTicketCard";

afterEach(() => {
  cleanup();
});

const mockCalledTicket: ActiveTicket = {
  id: "ticket-55",
  number: 55,
  status: "CALLED",
  queueId: "queue-1",
  counterId: "counter-1",
  createdAt: "2026-10-19T10:00:00.000Z",
  updatedAt: "2026-10-19T10:00:00.000Z",
  queue: { id: "queue-1", name: "General Line" },
  service: { id: "service-1", name: "Check-in" },
  counter: { id: "counter-1", name: "Desk 1" },
};

const mockServingTicket: ActiveTicket = {
  id: "ticket-55",
  number: 55,
  status: "SERVING",
  queueId: "queue-1",
  counterId: "counter-1",
  createdAt: "2026-10-19T10:00:00.000Z",
  updatedAt: "2026-10-19T10:02:00.000Z",
  queue: { id: "queue-1", name: "General Line" },
  service: { id: "service-1", name: "Check-in" },
  counter: { id: "counter-1", name: "Desk 1" },
};

describe("StaffActiveTicketCard", () => {
  it("renders idle state card when activeTicket is null, without lifecycle action buttons", () => {
    render(
      <StaffActiveTicketCard
        activeTicket={null}
        activeTicketAction={null}
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No Active Ticket" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        /You are not currently serving any ticket in this organization/i,
      ),
    ).toBeDefined();

    expect(screen.queryByRole("button", { name: /Start service/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Complete service/i }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Skip ticket/i })).toBeNull();
  });

  it("renders CALLED ticket details, status badge, and only Start Service and Skip Ticket actions", () => {
    render(
      <StaffActiveTicketCard
        activeTicket={mockCalledTicket}
        activeTicketAction={null}
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    expect(screen.getByText("#55")).toBeDefined();
    expect(screen.getByText("Called")).toBeDefined();
    expect(screen.getByText("Check-in")).toBeDefined();
    expect(screen.getByText("Queue: General Line")).toBeDefined();
    expect(screen.getByText("Counter: Desk 1")).toBeDefined();
    expect(screen.getByText(/Updated /)).toBeDefined();

    const startBtn = screen.getByRole("button", {
      name: "Start service for ticket #55",
    });
    expect(startBtn).toBeDefined();
    expect(startBtn.textContent).toContain("Start Service");

    const skipBtn = screen.getByRole("button", {
      name: "Skip ticket #55",
    });
    expect(skipBtn).toBeDefined();
    expect(skipBtn.textContent).toContain("Skip Ticket");

    expect(
      screen.queryByRole("button", {
        name: "Complete service for ticket #55",
      }),
    ).toBeNull();
  });

  it("renders SERVING ticket details, status badge, and only Complete Service and Skip Ticket actions", () => {
    render(
      <StaffActiveTicketCard
        activeTicket={mockServingTicket}
        activeTicketAction={null}
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    expect(screen.getByText("#55")).toBeDefined();
    expect(screen.getByText("Now Serving")).toBeDefined();

    const completeBtn = screen.getByRole("button", {
      name: "Complete service for ticket #55",
    });
    expect(completeBtn).toBeDefined();
    expect(completeBtn.textContent).toContain("Complete Service");

    const skipBtn = screen.getByRole("button", {
      name: "Skip ticket #55",
    });
    expect(skipBtn).toBeDefined();

    expect(
      screen.queryByRole("button", {
        name: "Start service for ticket #55",
      }),
    ).toBeNull();
  });

  it("falls back to 'Counter: Unavailable' when ticket has no assigned counter object", () => {
    const ticketWithoutCounter: ActiveTicket = {
      ...mockCalledTicket,
      counter: null,
    };

    render(
      <StaffActiveTicketCard
        activeTicket={ticketWithoutCounter}
        activeTicketAction={null}
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    expect(screen.getByText("Counter: Unavailable")).toBeDefined();
  });

  it("invokes onStartService callback when Start Service button is clicked", () => {
    const handleStart = vi.fn();
    render(
      <StaffActiveTicketCard
        activeTicket={mockCalledTicket}
        activeTicketAction={null}
        onStartService={handleStart}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    const startBtn = screen.getByRole("button", {
      name: "Start service for ticket #55",
    });
    fireEvent.click(startBtn);

    expect(handleStart).toHaveBeenCalledTimes(1);
  });

  it("invokes onCompleteService callback when Complete Service button is clicked", () => {
    const handleComplete = vi.fn();
    render(
      <StaffActiveTicketCard
        activeTicket={mockServingTicket}
        activeTicketAction={null}
        onStartService={vi.fn()}
        onCompleteService={handleComplete}
        onSkipTicket={vi.fn()}
      />,
    );

    const completeBtn = screen.getByRole("button", {
      name: "Complete service for ticket #55",
    });
    fireEvent.click(completeBtn);

    expect(handleComplete).toHaveBeenCalledTimes(1);
  });

  it("invokes onSkipTicket callback when Skip Ticket button is clicked", () => {
    const handleSkip = vi.fn();
    render(
      <StaffActiveTicketCard
        activeTicket={mockCalledTicket}
        activeTicketAction={null}
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={handleSkip}
      />,
    );

    const skipBtn = screen.getByRole("button", {
      name: "Skip ticket #55",
    });
    fireEvent.click(skipBtn);

    expect(handleSkip).toHaveBeenCalledTimes(1);
  });

  it("displays loading label and spinner for Start Service and disables all buttons when activeTicketAction is 'start'", () => {
    render(
      <StaffActiveTicketCard
        activeTicket={mockCalledTicket}
        activeTicketAction="start"
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    const startBtn = screen.getByRole("button", {
      name: "Start service for ticket #55",
    }) as HTMLButtonElement;
    expect(startBtn.textContent).toContain("Starting Service...");
    expect(startBtn.disabled).toBe(true);

    const skipBtn = screen.getByRole("button", {
      name: "Skip ticket #55",
    }) as HTMLButtonElement;
    expect(skipBtn.disabled).toBe(true);
  });

  it("displays loading label and spinner for Complete Service and disables all buttons when activeTicketAction is 'complete'", () => {
    render(
      <StaffActiveTicketCard
        activeTicket={mockServingTicket}
        activeTicketAction="complete"
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    const completeBtn = screen.getByRole("button", {
      name: "Complete service for ticket #55",
    }) as HTMLButtonElement;
    expect(completeBtn.textContent).toContain("Completing Service...");
    expect(completeBtn.disabled).toBe(true);

    const skipBtn = screen.getByRole("button", {
      name: "Skip ticket #55",
    }) as HTMLButtonElement;
    expect(skipBtn.disabled).toBe(true);
  });

  it("displays loading label and spinner for Skip Ticket and disables all buttons when activeTicketAction is 'skip'", () => {
    render(
      <StaffActiveTicketCard
        activeTicket={mockCalledTicket}
        activeTicketAction="skip"
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    const skipBtn = screen.getByRole("button", {
      name: "Skip ticket #55",
    }) as HTMLButtonElement;
    expect(skipBtn.textContent).toContain("Skipping Ticket...");
    expect(skipBtn.disabled).toBe(true);

    const startBtn = screen.getByRole("button", {
      name: "Start service for ticket #55",
    }) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);
  });

  it("disables all buttons when isActionDisabled is true even if activeTicketAction is null", () => {
    render(
      <StaffActiveTicketCard
        activeTicket={mockCalledTicket}
        activeTicketAction={null}
        isActionDisabled={true}
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
      />,
    );

    const startBtn = screen.getByRole("button", {
      name: "Start service for ticket #55",
    }) as HTMLButtonElement;
    expect(startBtn.disabled).toBe(true);

    const skipBtn = screen.getByRole("button", {
      name: "Skip ticket #55",
    }) as HTMLButtonElement;
    expect(skipBtn.disabled).toBe(true);
  });

  it("renders the error alert with role='alert' when ticketActionError is provided", () => {
    const handleDismiss = vi.fn();
    render(
      <StaffActiveTicketCard
        activeTicket={mockCalledTicket}
        activeTicketAction={null}
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
        ticketActionError="Database lock conflict on ticket #55"
        onDismissError={handleDismiss}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(screen.getByText("Ticket Action Failed")).toBeDefined();
    expect(
      screen.getByText("Database lock conflict on ticket #55"),
    ).toBeDefined();

    const dismissBtn = screen.getByRole("button", {
      name: "Dismiss ticket action error",
    });
    fireEvent.click(dismissBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render error alert when ticketActionError is null or undefined", () => {
    render(
      <StaffActiveTicketCard
        activeTicket={mockCalledTicket}
        activeTicketAction={null}
        onStartService={vi.fn()}
        onCompleteService={vi.fn()}
        onSkipTicket={vi.fn()}
        ticketActionError={null}
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Ticket Action Failed")).toBeNull();
  });
});
