// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTicketTurnNotifications } from "./useTicketTurnNotifications";
import type { CustomerTicket } from "@/app/tickets/page";

function makeTicket(overrides: Partial<CustomerTicket> = {}): CustomerTicket {
  return {
    id: "ticket-1",
    number: 42,
    status: "WAITING",
    trackingToken: "token-42",
    createdAt: "2026-10-26T10:00:00Z",
    updatedAt: "2026-10-26T10:00:00Z",
    counter: null,
    queue: {
      id: "q-1",
      name: "Standard Line",
      service: {
        id: "svc-1",
        name: "General Medicine",
        organization: {
          id: "org-1",
          name: "City Clinic",
        },
      },
    },
    ...overrides,
  };
}

describe("useTicketTurnNotifications hook", () => {
  let mockPlayChime: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayChime = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  });

  it("displays banner without autoplaying chime when ticket is already CALLED on initial load", () => {
    const initialTickets = [makeTicket({ status: "CALLED", number: 101 })];

    const { result } = renderHook(() =>
      useTicketTurnNotifications(initialTickets, { playChime: mockPlayChime }),
    );

    expect(result.current.activeTurnNotifications).toHaveLength(1);
    expect(result.current.activeTurnNotifications[0].ticketNumber).toBe(101);
    expect(result.current.activeTurnNotifications[0].ticketId).toBe("ticket-1");
    // Chime should NOT be auto-played on initial load
    expect(mockPlayChime).not.toHaveBeenCalled();
  });

  it("plays chime and displays banner when ticket transitions from WAITING to CALLED", () => {
    const waitingTicket = makeTicket({ status: "WAITING", number: 42 });

    const { result, rerender } = renderHook(
      ({ tickets }) =>
        useTicketTurnNotifications(tickets, { playChime: mockPlayChime }),
      { initialProps: { tickets: [waitingTicket] } },
    );

    expect(result.current.activeTurnNotifications).toHaveLength(0);
    expect(mockPlayChime).not.toHaveBeenCalled();

    // Transition to CALLED
    const calledTicket = makeTicket({ status: "CALLED", number: 42 });
    rerender({ tickets: [calledTicket] });

    expect(result.current.activeTurnNotifications).toHaveLength(1);
    expect(result.current.activeTurnNotifications[0].ticketNumber).toBe(42);
    expect(mockPlayChime).toHaveBeenCalledTimes(1);
  });

  it("does not replay chime on repeated polling or rerenders with CALLED status", () => {
    const waitingTicket = makeTicket({ status: "WAITING", number: 42 });

    const { result, rerender } = renderHook(
      ({ tickets }) =>
        useTicketTurnNotifications(tickets, { playChime: mockPlayChime }),
      { initialProps: { tickets: [waitingTicket] } },
    );

    // Transition to CALLED
    const calledTicket = makeTicket({ status: "CALLED", number: 42 });
    rerender({ tickets: [calledTicket] });
    expect(mockPlayChime).toHaveBeenCalledTimes(1);

    // Poll 1: still CALLED
    rerender({ tickets: [calledTicket] });
    expect(mockPlayChime).toHaveBeenCalledTimes(1);

    // Poll 2: still CALLED
    rerender({ tickets: [calledTicket] });
    expect(mockPlayChime).toHaveBeenCalledTimes(1);

    expect(result.current.activeTurnNotifications).toHaveLength(1);
  });

  it("allows dismissing banner and keeps it dismissed across subsequent polls in the same cycle", () => {
    const waitingTicket = makeTicket({ status: "WAITING", number: 42 });

    const { result, rerender } = renderHook(
      ({ tickets }) =>
        useTicketTurnNotifications(tickets, { playChime: mockPlayChime }),
      { initialProps: { tickets: [waitingTicket] } },
    );

    const calledTicket = makeTicket({ status: "CALLED", number: 42 });
    rerender({ tickets: [calledTicket] });
    expect(result.current.activeTurnNotifications).toHaveLength(1);

    // Dismiss the notification
    act(() => {
      result.current.dismissNotification("ticket-1");
    });

    expect(result.current.isDismissed("ticket-1")).toBe(true);
    expect(result.current.activeTurnNotifications).toHaveLength(0);

    // Subsequent poll: ticket is still CALLED
    rerender({ tickets: [calledTicket] });
    expect(result.current.activeTurnNotifications).toHaveLength(0);
    expect(mockPlayChime).toHaveBeenCalledTimes(1);
  });

  it("hides banner and resets dismissal cycle when transitioning away from CALLED", () => {
    const calledTicket = makeTicket({ status: "CALLED", number: 42 });

    const { result, rerender } = renderHook(
      ({ tickets }) =>
        useTicketTurnNotifications(tickets, { playChime: mockPlayChime }),
      { initialProps: { tickets: [calledTicket] } },
    );

    expect(result.current.activeTurnNotifications).toHaveLength(1);

    // Dismiss in current cycle
    act(() => {
      result.current.dismissNotification("ticket-1");
    });
    expect(result.current.activeTurnNotifications).toHaveLength(0);

    // Ticket transitions to SERVING
    const servingTicket = makeTicket({ status: "SERVING", number: 42 });
    rerender({ tickets: [servingTicket] });
    expect(result.current.activeTurnNotifications).toHaveLength(0);
    expect(result.current.isDismissed("ticket-1")).toBe(false);
  });

  it("triggers a new notification and plays chime if ticket is called again in a later cycle", () => {
    const waitingTicket = makeTicket({ status: "WAITING", number: 42 });

    const { result, rerender } = renderHook(
      ({ tickets }) =>
        useTicketTurnNotifications(tickets, { playChime: mockPlayChime }),
      { initialProps: { tickets: [waitingTicket] } },
    );

    // Cycle 1: called
    const calledTicket = makeTicket({ status: "CALLED", number: 42 });
    rerender({ tickets: [calledTicket] });
    expect(mockPlayChime).toHaveBeenCalledTimes(1);
    expect(result.current.activeTurnNotifications).toHaveLength(1);

    // Staff transitions ticket back to WAITING or SERVING
    const servingTicket = makeTicket({ status: "SERVING", number: 42 });
    rerender({ tickets: [servingTicket] });
    expect(result.current.activeTurnNotifications).toHaveLength(0);

    // Cycle 2: called again
    rerender({ tickets: [calledTicket] });
    expect(mockPlayChime).toHaveBeenCalledTimes(2);
    expect(result.current.activeTurnNotifications).toHaveLength(1);
  });

  it("handles multiple tickets independently", () => {
    const ticketA = makeTicket({ id: "ticket-A", number: 10, status: "WAITING" });
    const ticketB = makeTicket({ id: "ticket-B", number: 20, status: "WAITING" });

    const { result, rerender } = renderHook(
      ({ tickets }) =>
        useTicketTurnNotifications(tickets, { playChime: mockPlayChime }),
      { initialProps: { tickets: [ticketA, ticketB] } },
    );

    expect(result.current.activeTurnNotifications).toHaveLength(0);

    // Ticket A called
    const ticketACalled = { ...ticketA, status: "CALLED" };
    rerender({ tickets: [ticketACalled, ticketB] });
    expect(mockPlayChime).toHaveBeenCalledTimes(1);
    expect(result.current.activeTurnNotifications).toHaveLength(1);
    expect(result.current.activeTurnNotifications[0].ticketId).toBe("ticket-A");

    // Later Ticket B also called
    const ticketBCalled = { ...ticketB, status: "CALLED" };
    rerender({ tickets: [ticketACalled, ticketBCalled] });
    expect(mockPlayChime).toHaveBeenCalledTimes(2);
    expect(result.current.activeTurnNotifications).toHaveLength(2);

    // Dismiss only Ticket A
    act(() => {
      result.current.dismissNotification("ticket-A");
    });

    expect(result.current.activeTurnNotifications).toHaveLength(1);
    expect(result.current.activeTurnNotifications[0].ticketId).toBe("ticket-B");
    expect(result.current.isDismissed("ticket-A")).toBe(true);
    expect(result.current.isDismissed("ticket-B")).toBe(false);
  });

  it("passes counter information when available and falls back to null when absent", () => {
    const ticketWithCounter = makeTicket({
      id: "ticket-1",
      status: "CALLED",
      counter: { name: "Counter 4" },
    });
    const ticketWithoutCounter = makeTicket({
      id: "ticket-2",
      status: "CALLED",
      counter: null,
    });

    const { result } = renderHook(() =>
      useTicketTurnNotifications([ticketWithCounter, ticketWithoutCounter], {
        playChime: mockPlayChime,
      }),
    );

    expect(result.current.activeTurnNotifications).toHaveLength(2);
    expect(result.current.activeTurnNotifications[0].counter).toEqual({
      name: "Counter 4",
    });
    expect(result.current.activeTurnNotifications[1].counter).toBeNull();
  });

  it("cleans up tracking state when a ticket reaches a terminal status", () => {
    const calledTicket = makeTicket({ status: "CALLED" });

    const { result, rerender } = renderHook(
      ({ tickets }) =>
        useTicketTurnNotifications(tickets, { playChime: mockPlayChime }),
      { initialProps: { tickets: [calledTicket] } },
    );

    expect(result.current.activeTurnNotifications).toHaveLength(1);

    // Transition to COMPLETED (terminal)
    const completedTicket = makeTicket({ status: "COMPLETED" });
    rerender({ tickets: [completedTicket] });

    expect(result.current.activeTurnNotifications).toHaveLength(0);
    expect(result.current.isDismissed("ticket-1")).toBe(false);
  });

  it("handles empty ticket list without error", () => {
    const { result } = renderHook(() =>
      useTicketTurnNotifications([], { playChime: mockPlayChime }),
    );

    expect(result.current.activeTurnNotifications).toHaveLength(0);
    expect(mockPlayChime).not.toHaveBeenCalled();
  });
});
