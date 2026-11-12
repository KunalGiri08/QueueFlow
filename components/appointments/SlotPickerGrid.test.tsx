// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SlotPickerGrid } from "./SlotPickerGrid";
import type { AvailableSlot } from "@/hooks/useAvailableSlots";

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

const mockMultiCapacitySlot: AvailableSlot = {
  slotStart: "2026-11-15T14:00:00.000Z",
  slotEnd: "2026-11-15T14:30:00.000Z",
  localStartTime: "14:00",
  localEndTime: "14:30",
  bookedCount: 2,
  maxCapacity: 5,
  remainingCapacity: 3,
  isAvailable: true,
};

describe("SlotPickerGrid", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders date input with selectedDate and displays timezone information", () => {
    const handleDateChange = vi.fn();
    const handleSelectSlot = vi.fn();

    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={handleDateChange}
        slots={[mockSlot1]}
        onSelectSlot={handleSelectSlot}
        timezone="Asia/Kolkata"
        minDate="2026-11-15"
        maxDate="2026-11-30"
      />,
    );

    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    expect(dateInput.value).toBe("2026-11-15");
    expect(dateInput.min).toBe("2026-11-15");
    expect(dateInput.max).toBe("2026-11-30");

    expect(screen.getByText(/Timezone:/i)).toBeDefined();
    expect(screen.getByText("Asia/Kolkata")).toBeDefined();
    expect(screen.getByText(/Times displayed in Asia\/Kolkata/i)).toBeDefined();
  });

  it("triggers onDateChange when user selects a different date", () => {
    const handleDateChange = vi.fn();

    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={handleDateChange}
        slots={[mockSlot1]}
        onSelectSlot={vi.fn()}
      />,
    );

    const dateInput = screen.getByLabelText(/appointment date/i);
    fireEvent.change(dateInput, { target: { value: "2026-11-18" } });

    expect(handleDateChange).toHaveBeenCalledTimes(1);
    expect(handleDateChange).toHaveBeenCalledWith("2026-11-18");
  });

  it("renders loading skeleton when isLoading is true", () => {
    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[mockSlot1]}
        onSelectSlot={vi.fn()}
        isLoading={true}
      />,
    );

    const loader = screen.getByRole("status", { name: /loading available slots/i });
    expect(loader).toBeDefined();
    expect(loader.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("group", { name: /available appointment slots/i })).toBeNull();
  });

  it("renders friendly empty state when slots array is empty and isLoading is false", () => {
    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[]}
        onSelectSlot={vi.fn()}
        isLoading={false}
      />,
    );

    expect(screen.getByText("No available slots")).toBeDefined();
    expect(
      screen.getByText(/There are no appointment slots available on this date/i),
    ).toBeDefined();
  });

  it("renders custom empty message when provided", () => {
    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[]}
        onSelectSlot={vi.fn()}
        isLoading={false}
        emptyMessage="Facility is closed on Sundays."
      />,
    );

    expect(screen.getByText("Facility is closed on Sundays.")).toBeDefined();
  });

  it("renders available slots with formatted start and end times", () => {
    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[mockSlot1, mockSlot2]}
        onSelectSlot={vi.fn()}
      />,
    );

    expect(screen.getByText("09:00 - 09:30")).toBeDefined();
    expect(screen.getByText("09:30 - 10:00")).toBeDefined();
  });

  it("calls onSelectSlot when clicking an available slot", () => {
    const handleSelectSlot = vi.fn();

    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[mockSlot1, mockSlot2]}
        onSelectSlot={handleSelectSlot}
      />,
    );

    const availableBtn = screen.getByRole("button", {
      name: /09:00 to 09:30, available/i,
    });
    fireEvent.click(availableBtn);

    expect(handleSelectSlot).toHaveBeenCalledTimes(1);
    expect(handleSelectSlot).toHaveBeenCalledWith(mockSlot1);
  });

  it("prevents clicking and disables unavailable/full slots", () => {
    const handleSelectSlot = vi.fn();

    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[mockSlot1, mockSlot2]}
        onSelectSlot={handleSelectSlot}
      />,
    );

    const fullBtn = screen.getByRole("button", {
      name: /09:30 to 10:00, unavailable/i,
    });
    expect(fullBtn.hasAttribute("disabled")).toBe(true);
    expect(fullBtn.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(fullBtn);
    expect(handleSelectSlot).not.toHaveBeenCalled();
    expect(screen.getByText("Full")).toBeDefined();
  });

  it("applies active styling and aria-pressed='true' to selectedSlot", () => {
    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[mockSlot1, mockMultiCapacitySlot]}
        selectedSlot={mockSlot1}
        onSelectSlot={vi.fn()}
      />,
    );

    const selectedBtn = screen.getByRole("button", {
      name: /09:00 to 09:30, available/i,
    });
    expect(selectedBtn.getAttribute("aria-pressed")).toBe("true");
    expect(selectedBtn.className).toContain("bg-gray-900 text-white");

    const unselectedBtn = screen.getByRole("button", {
      name: /14:00 to 14:30/i,
    });
    expect(unselectedBtn.getAttribute("aria-pressed")).toBe("false");
    expect(unselectedBtn.className).toContain("bg-white text-gray-900");
  });

  it("displays remaining capacity for multi-capacity slots", () => {
    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[mockMultiCapacitySlot]}
        onSelectSlot={vi.fn()}
      />,
    );

    expect(screen.getByText("3 left")).toBeDefined();
    const btn = screen.getByRole("button", {
      name: /14:00 to 14:30, 3 of 5 spots left/i,
    });
    expect(btn).toBeDefined();
  });

  it("disables date input and all slots when disabled prop is true", () => {
    const handleSelectSlot = vi.fn();
    const handleDateChange = vi.fn();

    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={handleDateChange}
        slots={[mockSlot1, mockMultiCapacitySlot]}
        onSelectSlot={handleSelectSlot}
        disabled={true}
      />,
    );

    const dateInput = screen.getByLabelText<HTMLInputElement>(/appointment date/i);
    expect(dateInput.hasAttribute("disabled")).toBe(true);

    const slotBtn = screen.getByRole("button", {
      name: /09:00 to 09:30, available/i,
    });
    expect(slotBtn.hasAttribute("disabled")).toBe(true);

    fireEvent.click(slotBtn);
    expect(handleSelectSlot).not.toHaveBeenCalled();
  });

  it("has accessible structure with role='group' and descriptive aria labels", () => {
    render(
      <SlotPickerGrid
        selectedDate="2026-11-15"
        onDateChange={vi.fn()}
        slots={[mockSlot1, mockSlot2, mockMultiCapacitySlot]}
        onSelectSlot={vi.fn()}
      />,
    );

    const group = screen.getByRole("group", { name: "Available appointment slots" });
    expect(group).toBeDefined();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
  });
});

