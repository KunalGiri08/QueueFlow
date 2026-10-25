// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ScheduleIntervalDialog } from "./ScheduleIntervalDialog";
import type { ScheduleIntervalItem } from "./types";

const mockIntervals: ScheduleIntervalItem[] = [
  {
    id: "interval-1",
    organizationId: "org-1",
    dayOfWeek: 1, // Monday
    startTime: "09:00",
    endTime: "13:00",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("ScheduleIntervalDialog Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render when isOpen is false", () => {
    render(
      <ScheduleIntervalDialog
        isOpen={false}
        editingInterval={null}
        defaultDayOfWeek={1}
        existingIntervals={[]}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders Add Operating Hours title when creating new interval", () => {
    render(
      <ScheduleIntervalDialog
        isOpen={true}
        editingInterval={null}
        defaultDayOfWeek={2}
        existingIntervals={[]}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add Operating Hours" })).toBeDefined();
  });

  it("renders Edit Operating Hours title and pre-fills values when editing", () => {
    render(
      <ScheduleIntervalDialog
        isOpen={true}
        editingInterval={mockIntervals[0]}
        defaultDayOfWeek={1}
        existingIntervals={mockIntervals}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Edit Operating Hours" })).toBeDefined();
    expect((screen.getByLabelText(/opening time/i) as HTMLInputElement).value).toBe("09:00");
    expect((screen.getByLabelText(/closing time/i) as HTMLInputElement).value).toBe("13:00");
  });

  it("validates start time before end time client-side", async () => {
    const handleSave = vi.fn();
    render(
      <ScheduleIntervalDialog
        isOpen={true}
        editingInterval={null}
        defaultDayOfWeek={1}
        existingIntervals={[]}
        isSaving={false}
        onSave={handleSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/opening time/i), { target: { value: "15:00" } });
    fireEvent.change(screen.getByLabelText(/closing time/i), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: /save interval/i }));

    expect(await screen.findByText("Start time must be earlier than end time.")).toBeDefined();
    expect(handleSave).not.toHaveBeenCalled();
  });

  it("validates overlapping intervals client-side", async () => {
    const handleSave = vi.fn();
    render(
      <ScheduleIntervalDialog
        isOpen={true}
        editingInterval={null}
        defaultDayOfWeek={1}
        existingIntervals={mockIntervals}
        isSaving={false}
        onSave={handleSave}
        onClose={vi.fn()}
      />,
    );

    // Monday (1) has 09:00 - 13:00. Try 10:00 - 14:00
    fireEvent.change(screen.getByLabelText(/day of week/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/opening time/i), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/closing time/i), { target: { value: "14:00" } });
    fireEvent.click(screen.getByRole("button", { name: /save interval/i }));

    expect(await screen.findByText(/overlaps with existing active hours/i)).toBeDefined();
    expect(handleSave).not.toHaveBeenCalled();
  });

  it("submits valid interval and displays error if onSave rejects", async () => {
    const handleSave = vi.fn().mockRejectedValue(new Error("Conflict on server"));
    render(
      <ScheduleIntervalDialog
        isOpen={true}
        editingInterval={null}
        defaultDayOfWeek={1}
        existingIntervals={mockIntervals}
        isSaving={false}
        onSave={handleSave}
        onClose={vi.fn()}
      />,
    );

    // Wednesday (3)
    fireEvent.change(screen.getByLabelText(/day of week/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText(/opening time/i), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText(/closing time/i), { target: { value: "17:00" } });
    fireEvent.click(screen.getByRole("button", { name: /save interval/i }));

    expect(handleSave).toHaveBeenCalledWith({
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "17:00",
      isActive: true,
    });
    expect(await screen.findByText("Conflict on server")).toBeDefined();
  });

  it("calls onClose when Cancel button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <ScheduleIntervalDialog
        isOpen={true}
        editingInterval={null}
        defaultDayOfWeek={1}
        existingIntervals={[]}
        isSaving={false}
        onSave={vi.fn()}
        onClose={handleClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalled();
  });
});
