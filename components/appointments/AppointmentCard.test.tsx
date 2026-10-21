// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppointmentCard } from "./AppointmentCard";
import type { CustomerAppointment } from "./types";

const mockAppointment: CustomerAppointment = {
  id: "appt-1",
  userId: "user-1",
  serviceId: "svc-1",
  scheduledAt: "2026-11-20T14:30:00.000Z",
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

describe("AppointmentCard", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders appointment details, organization, service, and formatted scheduled date", () => {
    const handleCancel = vi.fn();
    const handleReschedule = vi.fn();

    render(
      <AppointmentCard
        appointment={mockAppointment}
        onCancelClick={handleCancel}
        onRescheduleClick={handleReschedule}
      />,
    );

    expect(screen.getByText("General Consultation")).toBeDefined();
    expect(screen.getByText("City Health Clinic")).toBeDefined();
    expect(screen.getByText("Booked")).toBeDefined();
    expect(screen.getByText(/Booked on/i)).toBeDefined();
  });

  it("triggers onRescheduleClick and onCancelClick when buttons are clicked for BOOKED appointment", () => {
    const handleCancel = vi.fn();
    const handleReschedule = vi.fn();

    render(
      <AppointmentCard
        appointment={mockAppointment}
        onCancelClick={handleCancel}
        onRescheduleClick={handleReschedule}
      />,
    );

    const rescheduleBtn = screen.getByRole("button", { name: /^reschedule$/i });
    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });

    fireEvent.click(rescheduleBtn);
    expect(handleReschedule).toHaveBeenCalledWith(mockAppointment);

    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledWith(mockAppointment);
  });

  it("does not render action buttons for COMPLETED, CANCELLED, or NO_SHOW appointments", () => {
    const handleCancel = vi.fn();
    const handleReschedule = vi.fn();

    const { rerender } = render(
      <AppointmentCard
        appointment={{ ...mockAppointment, status: "COMPLETED" }}
        onCancelClick={handleCancel}
        onRescheduleClick={handleReschedule}
      />,
    );

    expect(screen.queryByRole("button", { name: /^reschedule$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).toBeNull();

    rerender(
      <AppointmentCard
        appointment={{ ...mockAppointment, status: "CANCELLED" }}
        onCancelClick={handleCancel}
        onRescheduleClick={handleReschedule}
      />,
    );

    expect(screen.queryByRole("button", { name: /^reschedule$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).toBeNull();

    rerender(
      <AppointmentCard
        appointment={{ ...mockAppointment, status: "NO_SHOW" }}
        onCancelClick={handleCancel}
        onRescheduleClick={handleReschedule}
      />,
    );

    expect(screen.queryByRole("button", { name: /^reschedule$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^cancel$/i })).toBeNull();
  });

  it("renders actionError when provided", () => {
    render(
      <AppointmentCard
        appointment={mockAppointment}
        onCancelClick={vi.fn()}
        onRescheduleClick={vi.fn()}
        actionError="Cancellation failed. Please try again."
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Cancellation failed. Please try again.");
  });
});
