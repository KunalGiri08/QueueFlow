// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RescheduleAppointmentDialog } from "./RescheduleAppointmentDialog";
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

describe("RescheduleAppointmentDialog", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders nothing when isOpen is false", () => {
    render(
      <RescheduleAppointmentDialog
        isOpen={false}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog with current appointment time and datetime input", () => {
    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Reschedule Appointment")).toBeDefined();
    expect(screen.getByText(/Currently scheduled:/)).toBeDefined();
    expect(screen.getByLabelText(/new appointment date and time/i)).toBeDefined();
  });

  it("submits ISO string when user selects a valid future date", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />,
    );

    const input = screen.getByLabelText(/new appointment date and time/i);
    const future = new Date(Date.now() + 5 * 86_400_000);
    const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T15:00`;
    fireEvent.change(input, { target: { value: local } });

    const submitBtn = screen.getByRole("button", {
      name: /confirm reschedule/i,
    });
    fireEvent.click(submitBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    const submittedArg = handleConfirm.mock.calls[0][0];
    expect(new Date(submittedArg).getTime()).toBeGreaterThan(Date.now());
  });

  it("shows validation error and prevents submission when date is in the past", () => {
    const handleConfirm = vi.fn();

    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={handleConfirm}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/new appointment date and time/i);
    fireEvent.change(input, { target: { value: "2021-01-01T12:00" } });

    const submitBtn = screen.getByRole("button", {
      name: /confirm reschedule/i,
    });
    fireEvent.click(submitBtn);

    expect(handleConfirm).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "Appointment must be scheduled in the future.",
    );
  });

  it("shows validation error when date is empty", () => {
    const handleConfirm = vi.fn();

    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={handleConfirm}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/new appointment date and time/i);
    fireEvent.change(input, { target: { value: "" } });

    const submitBtn = screen.getByRole("button", {
      name: /confirm reschedule/i,
    });
    fireEvent.click(submitBtn);

    expect(handleConfirm).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Please select a new date and time.");
  });

  it("shows server error when error prop is passed", () => {
    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error="This appointment time slot is already booked."
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "This appointment time slot is already booked.",
    );
  });

  it("displays organization timezone and converts facility-local time to UTC ISO string on reschedule", () => {
    const handleConfirm = vi.fn();
    const nyAppointment: CustomerAppointment = {
      ...mockAppointment,
      service: {
        ...mockAppointment.service,
        organization: {
          id: "org-ny",
          name: "New York Clinic",
          timezone: "America/New_York",
        },
      },
    };

    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={nyAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={handleConfirm}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Appointment time: America\/New_York/),
    ).toBeDefined();

    const input = screen.getByLabelText(/new appointment date and time/i);
    // 2026-11-20 11:30 EST (UTC-5) -> 16:30 UTC
    fireEvent.change(input, { target: { value: "2026-11-20T11:30" } });

    const submitBtn = screen.getByRole("button", {
      name: /confirm reschedule/i,
    });
    fireEvent.click(submitBtn);

    expect(handleConfirm).toHaveBeenCalledWith("2026-11-20T16:30:00.000Z");
  });

  it("shows validation error and prevents submission for ambiguous DST fall-back time", () => {
    const handleConfirm = vi.fn();
    const nyAppointment: CustomerAppointment = {
      ...mockAppointment,
      service: {
        ...mockAppointment.service,
        organization: {
          id: "org-ny",
          name: "New York Clinic",
          timezone: "America/New_York",
        },
      },
    };

    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={nyAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={handleConfirm}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/new appointment date and time/i);
    // 2027-11-07 01:30 is ambiguous in America/New_York (clocks fall back 02:00 -> 01:00)
    fireEvent.change(input, { target: { value: "2027-11-07T01:30" } });

    const submitBtn = screen.getByRole("button", {
      name: /confirm reschedule/i,
    });
    fireEvent.click(submitBtn);

    expect(handleConfirm).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "The selected time is invalid or ambiguous in the organization's timezone. Please select another time.",
    );

    // Clears error when selecting a valid time
    fireEvent.change(input, { target: { value: "2027-11-07T02:30" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
