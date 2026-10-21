// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CancelAppointmentDialog } from "./CancelAppointmentDialog";
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

describe("CancelAppointmentDialog", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders nothing when isOpen is false", () => {
    render(
      <CancelAppointmentDialog
        isOpen={false}
        appointment={mockAppointment}
        isCancelling={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog with appointment details when isOpen is true", () => {
    render(
      <CancelAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isCancelling={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(screen.getByText("Cancel Appointment")).toBeDefined();
    expect(screen.getByText("City Health Clinic")).toBeDefined();
    expect(screen.getByText(/General Consultation/)).toBeDefined();
  });

  it("calls onConfirm when user clicks Yes, Cancel Appointment", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <CancelAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isCancelling={false}
        error={null}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />,
    );

    const confirmBtn = screen.getByRole("button", {
      name: /yes, cancel appointment/i,
    });
    fireEvent.click(confirmBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("calls onClose when user clicks Keep Appointment or presses Escape", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <CancelAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isCancelling={false}
        error={null}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />,
    );

    const keepBtn = screen.getByRole("button", { name: /keep appointment/i });
    fireEvent.click(keepBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("disables buttons and shows spinner while isCancelling is true", () => {
    render(
      <CancelAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isCancelling={true}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const keepBtn = screen.getByRole("button", { name: /keep appointment/i });
    expect(keepBtn.hasAttribute("disabled")).toBe(true);

    const confirmBtn = screen.getByRole("button", { name: /cancelling/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);
  });

  it("renders error alert when error prop is provided", () => {
    render(
      <CancelAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isCancelling={false}
        error="Unable to cancel at this time."
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Unable to cancel at this time.");
  });
});
