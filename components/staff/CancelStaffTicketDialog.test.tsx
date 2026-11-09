// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CancelStaffTicketDialog } from "./CancelStaffTicketDialog";
import type { OperatorQueueItem } from "./StaffAssignedQueues";

const mockQueueWithTickets: OperatorQueueItem = {
  id: "queue-1",
  name: "General Inquiries",
  isActive: true,
  service: {
    id: "service-1",
    name: "Customer Service",
  },
  waitingCount: 2,
  currentlyServing: 10,
  waitingTickets: [
    { id: "ticket-101", number: 101, createdAt: "2026-11-09T10:00:00Z" },
    { id: "ticket-102", number: 102, createdAt: "2026-11-09T10:05:00Z" },
  ],
};

describe("CancelStaffTicketDialog", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not render when isOpen is false or queue is null", () => {
    const { rerender } = render(
      <CancelStaffTicketDialog
        isOpen={false}
        queue={mockQueueWithTickets}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <CancelStaffTicketDialog
        isOpen={true}
        queue={null}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders waiting tickets in a select dropdown and defaults to first ticket", () => {
    render(
      <CancelStaffTicketDialog
        isOpen={true}
        queue={mockQueueWithTickets}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: /cancel waiting ticket/i }),
    ).toBeDefined();
    expect(
      screen.getByText("Queue: General Inquiries (Customer Service)"),
    ).toBeDefined();

    const select = screen.getByRole("combobox", {
      name: /select ticket to cancel/i,
    }) as HTMLSelectElement;
    expect(select.value).toBe("ticket-101");
    expect(
      screen.getByText(/Are you sure you want to cancel/),
    ).toBeDefined();
    expect(screen.getAllByText("Ticket #101").length).toBeGreaterThanOrEqual(1);
  });

  it("updates selected ticket when user changes the select dropdown", () => {
    render(
      <CancelStaffTicketDialog
        isOpen={true}
        queue={mockQueueWithTickets}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const select = screen.getByRole("combobox", {
      name: /select ticket to cancel/i,
    });
    fireEvent.change(select, { target: { value: "ticket-102" } });

    expect((select as HTMLSelectElement).value).toBe("ticket-102");
    expect(screen.getAllByText("Ticket #102").length).toBeGreaterThanOrEqual(1);
  });

  it("successfully cancels ticket, invokes onSuccess and closes dialog", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "ticket-101", status: "CANCELLED" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <CancelStaffTicketDialog
        isOpen={true}
        queue={mockQueueWithTickets}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: /yes, cancel ticket/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tickets/ticket-101/cancel",
        { method: "PATCH" },
      );
      expect(handleSuccess).toHaveBeenCalledTimes(1);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it("displays error message when API returns 409 conflict", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Ticket cannot be cancelled in its current state" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <CancelStaffTicketDialog
        isOpen={true}
        queue={mockQueueWithTickets}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: /yes, cancel ticket/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(
        screen.getByText("This ticket can no longer be cancelled because its status has changed."),
      ).toBeDefined();
    });

    expect(handleSuccess).not.toHaveBeenCalled();
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("displays error message when API returns 403 forbidden", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "User is not allowed to cancel this ticket" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <CancelStaffTicketDialog
        isOpen={true}
        queue={mockQueueWithTickets}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: /yes, cancel ticket/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeDefined();
      expect(
        screen.getByText("You are not authorized to cancel tickets for this organization."),
      ).toBeDefined();
    });
  });

  it("closes dialog when Keep Ticket button is clicked without calling API", () => {
    const handleClose = vi.fn();
    render(
      <CancelStaffTicketDialog
        isOpen={true}
        queue={mockQueueWithTickets}
        onClose={handleClose}
        onSuccess={vi.fn()}
      />,
    );

    const keepBtn = screen.getByRole("button", { name: /keep ticket/i });
    fireEvent.click(keepBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes dialog when Escape key is pressed", () => {
    const handleClose = vi.fn();
    render(
      <CancelStaffTicketDialog
        isOpen={true}
        queue={mockQueueWithTickets}
        onClose={handleClose}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
