// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { RescheduleAppointmentDialog } from "./RescheduleAppointmentDialog";
import { getTodayInTimezone, type AvailableSlot } from "@/hooks/useAvailableSlots";
import type { CustomerAppointment } from "./types";

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
      timezone: "Asia/Kolkata",
    },
  },
};

const mockAppointment2: CustomerAppointment = {
  id: "appt-2",
  userId: "user-1",
  serviceId: "svc-2",
  scheduledAt: "2026-11-25T11:00:00.000Z",
  status: "BOOKED",
  createdAt: "2026-10-18T10:00:00.000Z",
  updatedAt: "2026-10-18T10:00:00.000Z",
  service: {
    id: "svc-2",
    name: "Dental Examination",
    organization: {
      id: "org-1",
      name: "City Health Clinic",
      timezone: "Asia/Kolkata",
    },
  },
};

const mockSlot1: AvailableSlot = {
  slotStart: "2026-11-20T09:00:00.000Z",
  slotEnd: "2026-11-20T09:30:00.000Z",
  localStartTime: "09:00",
  localEndTime: "09:30",
  bookedCount: 0,
  maxCapacity: 1,
  remainingCapacity: 1,
  isAvailable: true,
};

const mockSlot2: AvailableSlot = {
  slotStart: "2026-11-20T09:30:00.000Z",
  slotEnd: "2026-11-20T10:00:00.000Z",
  localStartTime: "09:30",
  localEndTime: "10:00",
  bookedCount: 1,
  maxCapacity: 1,
  remainingCapacity: 0,
  isAvailable: false,
};

const mockSlotNextDay: AvailableSlot = {
  slotStart: "2026-11-21T10:00:00.000Z",
  slotEnd: "2026-11-21T10:30:00.000Z",
  localStartTime: "10:00",
  localEndTime: "10:30",
  bookedCount: 0,
  maxCapacity: 1,
  remainingCapacity: 1,
  isAvailable: true,
};

const mockSlotAppt2: AvailableSlot = {
  slotStart: "2026-11-25T14:00:00.000Z",
  slotEnd: "2026-11-25T14:30:00.000Z",
  localStartTime: "14:00",
  localEndTime: "14:30",
  bookedCount: 0,
  maxCapacity: 1,
  remainingCapacity: 1,
  isAvailable: true,
};

describe("RescheduleAppointmentDialog", () => {
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

  it("renders nothing when appointment is null", () => {
    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={null}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog with current appointment summary and available slots", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1, mockSlot2],
      }),
    );

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
    expect(screen.getByText(/City Health Clinic/)).toBeDefined();
    expect(screen.getByText(/Timezone: Asia\/Kolkata/)).toBeDefined();
    expect(screen.getByText(/Currently scheduled:/)).toBeDefined();
    expect(screen.getByText(/General Consultation/)).toBeDefined();

    // Confirm Reschedule is initially disabled because no slot is selected
    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Available and full slots are rendered
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const availableBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    expect(availableBtn.hasAttribute("disabled")).toBe(false);

    const fullBtn = screen.getByRole("button", { name: /09:30 to 10:00/i });
    expect(fullBtn.hasAttribute("disabled")).toBe(true);
  });

  it("initial date uses the appointment's organization-local date when in future", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1],
      }),
    );

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

    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    // ScheduledAt is 2026-11-20T14:30:00.000Z -> 2026-11-20 in Asia/Kolkata
    expect(dateInput.value).toBe("2026-11-20");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("date=2026-11-20"),
        expect.anything(),
      );
    });
  });

  it("past appointment date falls back to organization-local today", async () => {
    const pastAppointment: CustomerAppointment = {
      ...mockAppointment,
      scheduledAt: "2020-01-01T10:00:00.000Z",
    };

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: getTodayInTimezone("Asia/Kolkata"),
        service: { id: "svc-1", name: "General Consultation" },
        slots: [],
      }),
    );

    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={pastAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const todayDate = getTodayInTimezone("Asia/Kolkata");
    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    expect(dateInput.value).toBe(todayDate);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`date=${encodeURIComponent(todayDate)}`),
        expect.anything(),
      );
    });
  });

  it("selecting an available slot highlights it and enables confirmation", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1, mockSlot2],
      }),
    );

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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
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
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1],
      }),
    );

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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);

    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    fireEvent.click(confirmBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleConfirm).toHaveBeenCalledWith("2026-11-20T09:00:00.000Z");
  });

  it("changing date clears selected slot and loads new availability", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-21",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlotNextDay],
        }),
      );

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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);

    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // Change date to next day
    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    fireEvent.change(dateInput, { target: { value: "2026-11-21" } });

    // Selection must be cleared immediately
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("date=2026-11-21"),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /10:00 to 10:30/i })).toBeDefined();
    });
  });

  it("changing appointment clears stale selection and loads new service availability", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-25",
          service: { id: "svc-2", name: "Dental Examination" },
          slots: [mockSlotAppt2],
        }),
      );

    const { rerender } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // Switch to mockAppointment2 (Dental Examination on 2026-11-25)
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment2}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Selected slot cleared immediately on new appointment modal
    const confirmBtn2 = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn2.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Dental Examination")).toBeDefined();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/services/svc-2/slots?date=2026-11-25"),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /14:00 to 14:30/i })).toBeDefined();
    });
  });

  it("same-service appointment switching after closing dialog updates date to Nov 20 and clears selection", async () => {
    const apptA: CustomerAppointment = {
      ...mockAppointment,
      id: "appt-A",
      serviceId: "svc-1",
      scheduledAt: "2026-11-15T10:00:00.000Z",
    };

    const apptB: CustomerAppointment = {
      ...mockAppointment,
      id: "appt-B",
      serviceId: "svc-1", // SAME SERVICE
      scheduledAt: "2026-11-20T10:00:00.000Z",
    };

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot2],
        }),
      );

    // 1. Open dialog for Appointment A (Nov 15)
    const { rerender } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={apptA}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    expect(dateInput.value).toBe("2026-11-15");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // 2. Close the dialog
    rerender(
      <RescheduleAppointmentDialog
        isOpen={false}
        appointment={null}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    // 3. Open dialog for Appointment B (same service, Nov 20)
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={apptB}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dateInputB = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    expect(dateInputB.value).toBe("2026-11-20");

    const confirmBtnB = screen.getByRole("button", { name: /confirm reschedule/i });
    // Appointment A's slot must NOT remain selected
    expect(confirmBtnB.hasAttribute("disabled")).toBe(true);

    // Verify fetch was made for Nov 20 on same service
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/services/svc-1/slots?date=2026-11-20"),
        expect.anything(),
      );
    });
  });

  it("reopening the same appointment after closing resets date to appointment scheduled date and clears selection", async () => {
    const apptA: CustomerAppointment = {
      ...mockAppointment,
      id: "appt-A",
      serviceId: "svc-1",
      scheduledAt: "2026-11-15T10:00:00.000Z",
    };

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-18",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlotNextDay],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-15",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot1],
        }),
      );

    // 1. Open dialog for Appointment A
    const { rerender } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={apptA}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    expect(dateInput.value).toBe("2026-11-15");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    // User browses to Nov 18
    fireEvent.change(dateInput, { target: { value: "2026-11-18" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /10:00 to 10:30/i })).toBeDefined();
    });

    // 2. User closes dialog
    rerender(
      <RescheduleAppointmentDialog
        isOpen={false}
        appointment={null}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // 3. User reopens dialog for Appointment A
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={apptA}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dateInputReopened = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    // Must reset to Nov 15 (appointment's scheduled date)
    expect(dateInputReopened.value).toBe("2026-11-15");

    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("date=2026-11-15"),
        expect.anything(),
      );
    });
  });

  it("when HTTP 409 conflict arrives, triggers slot refresh and clears selected slot", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [{ ...mockSlot1, remainingCapacity: 0, isAvailable: false }],
        }),
      );

    const { rerender } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        errorStatus={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Server responds with 409 conflict
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error="This appointment time slot is already booked."
        errorStatus={409}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Error alert is shown
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "This appointment time slot is already booked.",
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

  it("repeated 409 conflicts trigger refresh each time", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [mockSlot1],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          date: "2026-11-20",
          service: { id: "svc-1", name: "General Consultation" },
          slots: [{ ...mockSlot1, remainingCapacity: 0, isAvailable: false }],
        }),
      );

    const { rerender } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        errorStatus={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    // First conflict
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error="This appointment time slot is already booked."
        errorStatus={409}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    // Submitting resets error to null in parent
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={true}
        error={null}
        errorStatus={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Second conflict with identical message
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error="This appointment time slot is already booked."
        errorStatus={409}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Re-fetch must be triggered again
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });

  it("when HTTP 500 server error arrives, displays error alert but does NOT refresh slots or clear selected slot", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1],
      }),
    );

    const { rerender } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        errorStatus={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Server responds with 500 internal server error
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error="Unable to reschedule appointment at this time. Please try again."
        errorStatus={500}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Error alert is shown
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "Unable to reschedule appointment at this time. Please try again.",
    );

    // Slots must NOT be refreshed, and selected slot must NOT be cleared
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);
    expect(slotBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("when validation (HTTP 400) or network error arrives, displays error alert but does NOT refresh slots or clear selected slot", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1],
      }),
    );

    const { rerender } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        errorStatus={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });

    const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
    fireEvent.click(slotBtn);
    const confirmBtn = screen.getByRole("button", { name: /confirm reschedule/i });
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Validation error with 400
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error="Appointments cannot be rescheduled less than notice hours in advance"
        errorStatus={400}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Error alert is shown
    expect(screen.getByRole("alert").textContent).toBe(
      "Appointments cannot be rescheduled less than notice hours in advance",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // Network error without status
    rerender(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error="Unable to connect to the server. Please check your connection and try again."
        errorStatus={null}
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
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Loading available slots")).toBeDefined();

    deferred.resolve(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1],
      }),
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading available slots")).toBeNull();
      expect(screen.getByRole("button", { name: /09:00 to 09:30/i })).toBeDefined();
    });
  });

  it("disables inputs and buttons and shows loading spinner while isSubmitting is true", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1],
      }),
    );

    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={true}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    expect(dateInput.hasAttribute("disabled")).toBe(true);

    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    expect(cancelBtn.hasAttribute("disabled")).toBe(true);

    const submitBtn = screen.getByRole("button", { name: /rescheduling\.\.\./i });
    expect(submitBtn.hasAttribute("disabled")).toBe(true);

    await waitFor(() => {
      const slotBtn = screen.getByRole("button", { name: /09:00 to 09:30/i });
      expect(slotBtn.hasAttribute("disabled")).toBe(true);
    });
  });

  it("calls onClose when user clicks Cancel, clicks backdrop, or presses Escape", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1],
      }),
    );

    const handleClose = vi.fn();

    const { container } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={handleClose}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: /^cancel$/i });
    fireEvent.click(cancelBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);

    // Click backdrop
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(3);
  });

  it("does not call onClose via Escape or backdrop when isSubmitting is true", () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [],
      }),
    );

    const handleClose = vi.fn();

    const { container } = render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={mockAppointment}
        isSubmitting={true}
        error={null}
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

  it("respects custom organization timezone", async () => {
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

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        date: "2026-11-20",
        service: { id: "svc-1", name: "General Consultation" },
        slots: [mockSlot1],
      }),
    );

    render(
      <RescheduleAppointmentDialog
        isOpen={true}
        appointment={nyAppointment}
        isSubmitting={false}
        error={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Timezone: America\/New_York/)).toBeDefined();
    expect(screen.getByText(/Times displayed in America\/New_York/)).toBeDefined();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/public/organizations/org-ny/services/svc-1/slots"),
        expect.anything(),
      );
    });
  });
});
