// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { BookAppointmentDialog } from "./BookAppointmentDialog";
import type { AvailableSlot } from "@/hooks/useAvailableSlots";

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

const mockService = {
  id: "srv-1",
  name: "General Consultation",
};

const mockService2 = {
  id: "srv-2",
  name: "Dental Checkup",
};

const mockOrg = {
  id: "org-1",
  name: "Apex Healthcare",
  timezone: "Asia/Kolkata",
};

const mockSlot1: AvailableSlot = {
  slotStart: "2026-11-15T09:00:00.000Z",
  slotEnd: "2026-11-15T09:30:00.000Z",
  localStartTime: "09:00",
  localEndTime: "09:30",
  bookedCount: 0,
  maxCapacity: 1,
  remainingCapacity: 1,
  isAvailable: true,
};

const mockSlot2: AvailableSlot = {
  slotStart: "2026-11-15T09:30:00.000Z",
  slotEnd: "2026-11-15T10:00:00.000Z",
  localStartTime: "09:30",
  localEndTime: "10:00",
  bookedCount: 1,
  maxCapacity: 1,
  remainingCapacity: 0,
  isAvailable: false,
};

const mockSlot3: AvailableSlot = {
  slotStart: "2026-11-20T14:00:00.000Z",
  slotEnd: "2026-11-20T14:30:00.000Z",
  localStartTime: "14:00",
  localEndTime: "14:30",
  bookedCount: 0,
  maxCapacity: 2,
  remainingCapacity: 2,
  isAvailable: true,
};

const mockSlotSrv2: AvailableSlot = {
  slotStart: "2026-11-15T11:00:00.000Z",
  slotEnd: "2026-11-15T11:30:00.000Z",
  localStartTime: "11:00",
  localEndTime: "11:30",
  bookedCount: 0,
  maxCapacity: 1,
  remainingCapacity: 1,
  isAvailable: true,
};

describe("BookAppointmentDialog", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it("renders nothing when service or organization is null", () => {
    const { rerender } = render(
      <BookAppointmentDialog
        isOpen={true}
        service={null}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={null}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog with service name, organization name, and SlotPickerGrid when isOpen is true", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1, mockSlot2],
      }),
    );

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
    expect(screen.getByText(/Apex Healthcare/)).toBeDefined();
    expect(screen.getByText(/General Consultation/)).toBeDefined();
    expect(screen.getByText(/Timezone: Asia\/Kolkata/)).toBeDefined();

    // Confirm Booking is initially disabled because no slot is selected
    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Wait for slots to load
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const availableBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    expect(availableBtn.hasAttribute("disabled")).toBe(false);

    const fullBtn = screen.getByRole("button", { name: /09:30 to 10:00/i });
    expect(fullBtn.hasAttribute("disabled")).toBe(true);
  });

  it("selecting an available slot highlights it and enables Confirm Booking", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1, mockSlot2],
      }),
    );

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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    expect(slotBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(slotBtn);

    expect(slotBtn.getAttribute("aria-pressed")).toBe("true");
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);
  });

  it("submitting calls onConfirm with exact slotStart ISO string", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1],
      }),
    );

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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);

    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    fireEvent.click(confirmBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleConfirm).toHaveBeenCalledWith("2026-11-15T09:00:00.000Z");
  });

  it("changing date fetches new slots and clears the selected slot", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          service: mockService,
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: mockService,
          slots: [mockSlot3],
        }),
      );

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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    // Select the slot
    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // Change date
    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    fireEvent.change(dateInput, { target: { value: "2026-11-20" } });

    // Confirm button should be immediately disabled as selected slot was cleared
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Verify fetch was called with the new date
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("date=2026-11-20"),
        expect.anything(),
      );
    });

    // New slot from date 2026-11-20 is displayed
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /14:00 to 14:30/i })).toBeDefined();
    });
  });

  it("changing service clears selection and loads the new service's slots", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          service: mockService,
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          service: mockService2,
          slots: [mockSlotSrv2],
        }),
      );

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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    // Select slot for service 1
    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // Switch service to mockService2
    rerender(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService2}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Confirm button immediately disabled because selected slot was cleared
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Dental Checkup")).toBeDefined();

    // Verify fetch was called with service 2's ID
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/services/srv-2/slots"),
        expect.anything(),
      );
    });

    // New slots for service 2 are displayed
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /11:00 to 11:30/i })).toBeDefined();
    });
  });

  it("when HTTP 409 conflict arrives, triggers slot refresh and clears selected slot", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          service: mockService,
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          service: mockService,
          slots: [{ ...mockSlot1, remainingCapacity: 0, isAvailable: false }],
        }),
      );

    const { rerender } = render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        errorStatus={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Server responds with 409 conflict
    rerender(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error="This appointment time slot is already booked. Please choose another time."
        errorStatus={409}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Error alert is shown
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "This appointment time slot is already booked. Please choose another time.",
    );

    // Selected slot is cleared; Confirm button disabled
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Re-fetch should have been triggered
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Slot is now shown as full / disabled
    await waitFor(() => {
      const refreshedSlotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
      expect(refreshedSlotBtn.hasAttribute("disabled")).toBe(true);
    });
  });

  it("when HTTP 500 server error arrives, displays error alert but does NOT refresh slots or clear selected slot", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1],
      }),
    );

    const { rerender } = render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        errorStatus={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Server responds with 500 internal server error
    rerender(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error="Unable to book appointment at this time. Please try again."
        errorStatus={500}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Error alert is shown
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "Unable to book appointment at this time. Please try again.",
    );

    // Slots must NOT be refreshed, and selected slot must NOT be cleared
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);
    expect(slotBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("when validation (HTTP 400) or network error arrives, displays error alert but does NOT refresh slots or clear selected slot", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1],
      }),
    );

    const { rerender } = render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error={null}
        errorStatus={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm booking/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Validation error with 400
    rerender(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error="Invalid appointment details. Please check your selected time."
        errorStatus={400}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Error alert is shown
    expect(screen.getByRole("alert").textContent).toBe(
      "Invalid appointment details. Please check your selected time.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // Network error without status
    rerender(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={false}
        error="Unable to connect to the server. Please check your connection and try again."
        errorStatus={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "Unable to connect to the server. Please check your connection and try again.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);
  });

  it("displays loading skeleton while slots are being fetched", async () => {
    const deferred = createDeferred<Response>();
    fetchMock.mockReturnValueOnce(deferred.promise);

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

    expect(screen.getByLabelText("Loading available slots")).toBeDefined();

    deferred.resolve(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1],
      }),
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading available slots")).toBeNull();
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });
  });

  it("displays empty state message when no slots are available", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [],
      }),
    );

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

    await waitFor(() => {
      expect(screen.getByText("No available slots")).toBeDefined();
    });
    expect(
      screen.getByText(
        "There are no appointment slots available on this date. Please select another day.",
      ),
    ).toBeDefined();
  });

  it("displays custom empty message when slots API returns an error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Organization is closed on this date." }, 400),
    );

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

    await waitFor(() => {
      expect(screen.getByText("Organization is closed on this date.")).toBeDefined();
    });
  });

  it("disables inputs and buttons and shows loading spinner while isSubmitting is true", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1],
      }),
    );

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

    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    expect(dateInput.hasAttribute("disabled")).toBe(true);

    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    expect(cancelBtn.hasAttribute("disabled")).toBe(true);

    const submitBtn = screen.getByRole("button", { name: /booking\.\.\./i });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);

    await waitFor(() => {
      const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
      expect(slotBtn.hasAttribute("disabled")).toBe(true);
    });
  });

  it("calls onClose when user clicks Cancel, clicks backdrop, or presses Escape", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1],
      }),
    );

    const handleClose = vi.fn();

    const { container } = render(
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

    // Click backdrop (outermost div)
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(3);
  });

  it("does not call onClose via Escape or backdrop when isSubmitting is true", () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [],
      }),
    );

    const handleClose = vi.fn();

    const { container } = render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={mockOrg}
        isSubmitting={true}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={handleClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).not.toHaveBeenCalled();

    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(handleClose).not.toHaveBeenCalled();
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

  it("respects custom organization timezone", async () => {
    const nyOrg = {
      id: "org-ny",
      name: "New York Clinic",
      timezone: "America/New_York",
    };

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-15",
        service: mockService,
        slots: [mockSlot1],
      }),
    );

    render(
      <BookAppointmentDialog
        isOpen={true}
        service={mockService}
        organization={nyOrg}
        isSubmitting={false}
        error={null}
        successData={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Timezone: America\/New_York/)).toBeDefined();
    expect(screen.getByText(/Times displayed in America\/New_York/)).toBeDefined();

    // Verify fetch was called with the organization ID
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/public/organizations/org-ny/services/srv-1/slots"),
        expect.anything(),
      );
    });
  });
});
