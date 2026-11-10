// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CustomerTicketCard } from "./CustomerTicketCard";
import type { CustomerTicket } from "@/app/tickets/page";

const mockTicket: CustomerTicket = {
  id: "ticket-1",
  number: 42,
  status: "WAITING",
  trackingToken: "token-abc-123",
  createdAt: "2026-11-10T08:00:00.000Z",
  updatedAt: "2026-11-10T08:00:00.000Z",
  queue: {
    id: "queue-1",
    name: "General Inquiry",
    service: {
      id: "svc-1",
      name: "Customer Support",
      organization: {
        id: "org-1",
        name: "Acme Corp",
      },
    },
  },
};

describe("components/tickets/CustomerTicketCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders ticket number, status badge, organization, and service details", () => {
    const handleCancel = vi.fn();

    render(
      <CustomerTicketCard
        ticket={mockTicket}
        onCancel={handleCancel}
      />,
    );

    expect(screen.getByText("#42")).toBeDefined();
    expect(screen.getByText(/waiting in line/i)).toBeDefined();
    expect(screen.getByText("Acme Corp")).toBeDefined();
    expect(screen.getByText(/Customer Support/)).toBeDefined();
    expect(screen.getByText(/General Inquiry/)).toBeDefined();
    expect(screen.getByText(/Joined/i)).toBeDefined();
  });

  it("renders responsive card padding and action button layout", () => {
    const { container } = render(
      <CustomerTicketCard
        ticket={mockTicket}
        onCancel={vi.fn()}
      />,
    );

    const article = container.querySelector("article");
    expect(article?.className).toContain("p-4");
    expect(article?.className).toContain("sm:p-6");

    const trackLink = screen.getByRole("link", { name: /track status/i });
    expect(trackLink.className).toContain("w-full");
    expect(trackLink.className).toContain("sm:w-auto");

    const cancelBtn = screen.getByRole("button", { name: /cancel ticket/i });
    expect(cancelBtn.className).toContain("w-full");
    expect(cancelBtn.className).toContain("sm:w-auto");
  });

  it("triggers onCancel when Cancel Ticket button is clicked for WAITING ticket", () => {
    const handleCancel = vi.fn();

    render(
      <CustomerTicketCard
        ticket={mockTicket}
        onCancel={handleCancel}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: /cancel ticket/i });
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledWith(mockTicket);
  });

  it("shows cancelling spinner when isCancelling is true", () => {
    render(
      <CustomerTicketCard
        ticket={mockTicket}
        isCancelling={true}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Cancelling...")).toBeDefined();
  });

  it("does not render Cancel button for non-WAITING tickets", () => {
    render(
      <CustomerTicketCard
        ticket={{ ...mockTicket, status: "SERVING" }}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /cancel ticket/i })).toBeNull();
  });

  it("renders actionError when present", () => {
    render(
      <CustomerTicketCard
        ticket={mockTicket}
        actionError="Unable to cancel ticket at this time"
        onCancel={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Unable to cancel ticket at this time");
  });
});
