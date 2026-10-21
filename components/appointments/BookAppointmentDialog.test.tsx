// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BookAppointmentDialog } from "./BookAppointmentDialog";

const mockService = {
  id: "srv-1",
  name: "General Consultation",
};

const mockOrg = {
  id: "org-1",
  name: "Apex Healthcare",
};

describe("BookAppointmentDialog", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when isOpen is false", () => {
    render(
      <BookAppointmentDialog
        isOpen={false}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog with service name, organization name, and datetime input when isOpen is true", () => {
    render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Book Appointment")).toBeDefined();
    expect(screen.getByText("Apex Healthcare")).toBeDefined();
    expect(screen.getByText(/General Consultation/)).toBeDefined();
    expect(
      screen.getByLabelText(/appointment date and time/i),
    ).toBeDefined();
  });

  it("submits ISO string when user selects a valid future date", () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />,
    );

    const input = screen.getByLabelText(/appointment date and time/i);
    const future = new Date(Date.now() + 5 * 86_400_000);
    const local = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}T14:00`;
    fireEvent.change(input, { target: { value: local } });

    const submitBtn = screen.getByRole("button", {
      name: /confirm booking/i,
    });
    fireEvent.click(submitBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    const submittedArg = handleConfirm.mock.calls[0][0];
    expect(new Date(submittedArg).getTime()).toBeGreaterThan(Date.now());
  });

  it("shows validation error and prevents submission when date is in the past", () => {
    const handleConfirm = vi.fn();

    render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={handleConfirm}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/appointment date and time/i);
    fireEvent.change(input, { target: { value: "2021-01-01T12:00" } });

    const submitBtn = screen.getByRole("button", {
      name: /confirm booking/i,
    });
    fireEvent.click(submitBtn);

    expect(handleConfirm).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "Appointment must be scheduled in the future.",
    );
  });

  it("shows validation error when date input is empty", () => {
    const handleConfirm = vi.fn();

    render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={handleConfirm}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/appointment date and time/i);
    fireEvent.change(input, { target: { value: "" } });

    const submitBtn = screen.getByRole("button", {
      name: /confirm booking/i,
    });
    fireEvent.click(submitBtn);

    expect(handleConfirm).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Please select a date and time.");
  });

  it("calls onClose when user clicks Cancel or presses Escape", () => {
    const handleClose = vi.fn();

    render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={handleClose}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("disables inputs and buttons and shows loading spinner while isSubmitting is true", () => {
    render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={true}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText(/appointment date and time/i);
    expect(input.hasAttribute("disabled")).toBe(true);

    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    expect(cancelBtn.hasAttribute("disabled")).toBe(true);

    const submitBtn = screen.getByRole("button", { name: /booking\.\.\./i });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);
  });

  it("displays server error message while keeping input value intact", () => {
    const { rerender } = render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByLabelText<HTMLInputElement>(
      /appointment date and time/i,
    );
    fireEvent.change(input, { target: { value: "2026-11-20T14:00" } });

    rerender(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error="This appointment time slot is already booked. Please choose another time."
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "This appointment time slot is already booked. Please choose another time.",
    );
    expect(input.value).toBe("2026-11-20T14:00");
  });

  it("displays success confirmation with navigation link when successData is provided", () => {
    const handleClose = vi.fn();
    const success = {
      id: "appt-999",
      serviceId: "srv-1",
      scheduledAt: "2026-11-20T14:30:00.000Z",
    };

    render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={success}
        onConfirm={vi.fn()}
        onClose={handleClose}
      />,
    );

    expect(screen.getByText("Appointment Booked!")).toBeDefined();
    expect(screen.getByText("General Consultation")).toBeDefined();
    expect(screen.getByText("Apex Healthcare")).toBeDefined();

    const link = screen.getByRole("link", { name: /view my appointments/i });
    expect(link.getAttribute("href")).toBe("/appointments");

    const doneBtn = screen.getByRole("button", { name: /done/i });
    fireEvent.click(doneBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
