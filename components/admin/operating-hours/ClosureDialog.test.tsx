// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ClosureDialog } from "./ClosureDialog";
import type { ClosureItem } from "./types";

const mockClosure: ClosureItem = {
  id: "closure-1",
  organizationId: "org-1",
  startDate: "2026-12-25",
  endDate: "2026-12-25",
  reason: "Christmas Day",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ClosureDialog Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render when isOpen is false", () => {
    render(
      <ClosureDialog
        isOpen={false}
        editingClosure={null}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders Add Exceptional Closure title when creating new closure", () => {
    render(
      <ClosureDialog
        isOpen={true}
        editingClosure={null}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add Exceptional Closure" })).toBeDefined();
  });

  it("renders Edit Exceptional Closure title and pre-fills values when editing", () => {
    render(
      <ClosureDialog
        isOpen={true}
        editingClosure={mockClosure}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Edit Exceptional Closure" })).toBeDefined();
    expect((screen.getByLabelText(/start date/i) as HTMLInputElement).value).toBe("2026-12-25");
    expect((screen.getByLabelText(/end date/i) as HTMLInputElement).value).toBe("2026-12-25");
    expect((screen.getByLabelText(/reason/i) as HTMLInputElement).value).toBe("Christmas Day");
  });

  it("validates that end date is greater than or equal to start date", async () => {
    const handleSave = vi.fn();
    render(
      <ClosureDialog
        isOpen={true}
        editingClosure={null}
        isSaving={false}
        onSave={handleSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: "2026-12-25" } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: "2026-12-20" } });
    fireEvent.click(screen.getByRole("button", { name: /save closure/i }));

    expect(await screen.findByText("End date must be greater than or equal to start date.")).toBeDefined();
    expect(handleSave).not.toHaveBeenCalled();
  });

  it("submits valid closure data and displays error if onSave rejects", async () => {
    const handleSave = vi.fn().mockRejectedValue(new Error("Database error"));
    render(
      <ClosureDialog
        isOpen={true}
        editingClosure={null}
        isSaving={false}
        onSave={handleSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: "2026-11-26" } });
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: "2026-11-27" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Thanksgiving" } });
    fireEvent.click(screen.getByRole("button", { name: /save closure/i }));

    expect(handleSave).toHaveBeenCalledWith({
      startDate: "2026-11-26",
      endDate: "2026-11-27",
      reason: "Thanksgiving",
    });
    expect(await screen.findByText("Database error")).toBeDefined();
  });

  it("calls onClose when Cancel button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <ClosureDialog
        isOpen={true}
        editingClosure={null}
        isSaving={false}
        onSave={vi.fn()}
        onClose={handleClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(handleClose).toHaveBeenCalled();
  });

  it("does not discard unsaved user input when parent re-renders with a new object reference for the same closure", () => {
    const { rerender } = render(
      <ClosureDialog
        isOpen={true}
        editingClosure={{ ...mockClosure }}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Draft unsaved reason" } });
    expect((screen.getByLabelText(/reason/i) as HTMLInputElement).value).toBe("Draft unsaved reason");

    // Parent re-renders with a new object reference for the same closure (e.g. state change in parent)
    rerender(
      <ClosureDialog
        isOpen={true}
        editingClosure={{ ...mockClosure }}
        isSaving={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect((screen.getByLabelText(/reason/i) as HTMLInputElement).value).toBe("Draft unsaved reason");
  });

  it("resets form values when closed and reopened", () => {
    const { rerender } = render(
      <ClosureDialog
        isOpen={true}
        editingClosure={{ ...mockClosure }}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Draft unsaved reason" } });
    expect((screen.getByLabelText(/reason/i) as HTMLInputElement).value).toBe("Draft unsaved reason");

    // Close the dialog
    rerender(
      <ClosureDialog
        isOpen={false}
        editingClosure={{ ...mockClosure }}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Reopen the dialog
    rerender(
      <ClosureDialog
        isOpen={true}
        editingClosure={{ ...mockClosure }}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect((screen.getByLabelText(/reason/i) as HTMLInputElement).value).toBe("Christmas Day");
  });

  it("re-initializes values when switching edit records while open", () => {
    const otherClosure: ClosureItem = {
      ...mockClosure,
      id: "closure-2",
      reason: "New Year Holiday",
    };

    const { rerender } = render(
      <ClosureDialog
        isOpen={true}
        editingClosure={mockClosure}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect((screen.getByLabelText(/reason/i) as HTMLInputElement).value).toBe("Christmas Day");

    // Switch to editing other closure
    rerender(
      <ClosureDialog
        isOpen={true}
        editingClosure={otherClosure}
        isSaving={false}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect((screen.getByLabelText(/reason/i) as HTMLInputElement).value).toBe("New Year Holiday");
  });
});
