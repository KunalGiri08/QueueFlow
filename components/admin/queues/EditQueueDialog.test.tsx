// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { EditQueueDialog } from "./EditQueueDialog";
import type { QueueItem } from "./types";

const mockQueue: QueueItem = {
  id: "q-1",
  name: "Priority Desk",
  serviceId: "s-1",
  nextTicketNumber: 10,
  isActive: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
  maxWaitingTickets: 25,
  maxDailyTickets: 200,
};

const mockUnlimitedQueue: QueueItem = {
  id: "q-2",
  name: "Standard Line",
  serviceId: "s-1",
  nextTicketNumber: 5,
  isActive: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
  maxWaitingTickets: null,
  maxDailyTickets: null,
};

describe("components/admin/queues/EditQueueDialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("Rendering and Accessibility", () => {
    it("renders nothing when isOpen is false", () => {
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={false}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("renders nothing when queue is null even if isOpen is true", () => {
      render(
        <EditQueueDialog
          queue={null}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("renders dialog with correct accessible attributes and pre-populated initial values", () => {
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe("edit-queue-dialog-title");

      const nameInput = screen.getByLabelText(/queue name/i) as HTMLInputElement;
      const waitingInput = screen.getByLabelText(/max waiting limit/i) as HTMLInputElement;
      const dailyInput = screen.getByLabelText(/max daily limit/i) as HTMLInputElement;

      expect(nameInput.value).toBe("Priority Desk");
      expect(waitingInput.value).toBe("25");
      expect(dailyInput.value).toBe("200");
    });

    it("renders empty string for capacity limits when queue has null/unlimited limits", () => {
      render(
        <EditQueueDialog
          queue={mockUnlimitedQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      const waitingInput = screen.getByLabelText(/max waiting limit/i) as HTMLInputElement;
      const dailyInput = screen.getByLabelText(/max daily limit/i) as HTMLInputElement;

      expect(waitingInput.value).toBe("");
      expect(dailyInput.value).toBe("");
    });
  });

  describe("Dismissal and Close Behaviors", () => {
    it("calls onClose when Cancel button is clicked", () => {
      const onClose = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Close icon button is clicked", () => {
      const onClose = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /close edit queue dialog/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when backdrop is clicked", () => {
      const onClose = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      );

      const backdrop = screen.getByRole("dialog").parentElement!;
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when clicking inside the dialog card", () => {
      const onClose = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("dialog"));
      expect(onClose).not.toHaveBeenCalled();
    });

    it("calls onClose when Escape key is pressed", () => {
      const onClose = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close on Escape key or backdrop click while isSaving is true", () => {
      const onClose = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={true}
          error={null}
          onClose={onClose}
          onSave={vi.fn()}
        />,
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();

      const backdrop = screen.getByRole("dialog").parentElement!;
      fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Validation and Submission", () => {
    it("submits updated payload with trimmed name and parsed integer limits", () => {
      const onSave = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={onSave}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i);
      const waitingInput = screen.getByLabelText(/max waiting limit/i);
      const dailyInput = screen.getByLabelText(/max daily limit/i);

      fireEvent.change(nameInput, { target: { value: "  Fast Track  " } });
      fireEvent.change(waitingInput, { target: { value: "30" } });
      fireEvent.change(dailyInput, { target: { value: "300" } });

      fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

      expect(onSave).toHaveBeenCalledWith({
        name: "Fast Track",
        maxWaitingTickets: 30,
        maxDailyTickets: 300,
      });
    });

    it("submits null for capacity limits when inputs are cleared (unlimited)", () => {
      const onSave = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={onSave}
        />,
      );

      const waitingInput = screen.getByLabelText(/max waiting limit/i);
      const dailyInput = screen.getByLabelText(/max daily limit/i);

      fireEvent.change(waitingInput, { target: { value: "" } });
      fireEvent.change(dailyInput, { target: { value: "   " } });

      fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

      expect(onSave).toHaveBeenCalledWith({
        name: "Priority Desk",
        maxWaitingTickets: null,
        maxDailyTickets: null,
      });
    });

    it("displays error and blocks onSave when queue name is empty or whitespace", () => {
      const onSave = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={onSave}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i);
      fireEvent.change(nameInput, { target: { value: "   " } });

      // In HTML form, empty name disables save button
      const saveBtn = screen.getByRole("button", { name: /save changes/i }) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(true);

      // Even if form submit event is forced:
      fireEvent.submit(nameInput.closest("form")!);
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain("Queue name is required.");
    });

    it("validates boundary condition for maxWaitingTickets (> 10,000)", () => {
      const onSave = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={onSave}
        />,
      );

      const waitingInput = screen.getByLabelText(/max waiting limit/i);
      fireEvent.change(waitingInput, { target: { value: "10001" } });

      fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain(
        "Max waiting tickets must be an integer between 1 and 10,000.",
      );
    });

    it("validates boundary condition for maxDailyTickets (> 100,000)", () => {
      const onSave = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error={null}
          onClose={vi.fn()}
          onSave={onSave}
        />,
      );

      const dailyInput = screen.getByLabelText(/max daily limit/i);
      fireEvent.change(dailyInput, { target: { value: "100001" } });

      fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain(
        "Max daily tickets must be an integer between 1 and 100,000.",
      );
    });

    it("displays external API error when passed via error prop", () => {
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error="A queue with this name already exists for this service."
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      expect(screen.getByRole("alert").textContent).toContain(
        "A queue with this name already exists for this service.",
      );
    });

    it("clears error on input change", () => {
      const onClearError = vi.fn();
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={false}
          error="A queue with this name already exists for this service."
          onClose={vi.fn()}
          onSave={vi.fn()}
          onClearError={onClearError}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i);
      fireEvent.change(nameInput, { target: { value: "New Name" } });

      expect(onClearError).toHaveBeenCalledTimes(1);
    });
  });

  describe("Loading and Disabled States", () => {
    it("disables inputs, buttons, and displays spinner while isSaving is true", () => {
      render(
        <EditQueueDialog
          queue={mockQueue}
          isOpen={true}
          isSaving={true}
          error={null}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i) as HTMLInputElement;
      const waitingInput = screen.getByLabelText(/max waiting limit/i) as HTMLInputElement;
      const dailyInput = screen.getByLabelText(/max daily limit/i) as HTMLInputElement;
      const saveBtn = screen.getByRole("button", { name: /saving\.\.\./i }) as HTMLButtonElement;
      const cancelBtn = screen.getByRole("button", { name: /cancel/i }) as HTMLButtonElement;
      const closeBtn = screen.getByRole("button", { name: /close edit queue dialog/i }) as HTMLButtonElement;

      expect(nameInput.disabled).toBe(true);
      expect(waitingInput.disabled).toBe(true);
      expect(dailyInput.disabled).toBe(true);
      expect(saveBtn.disabled).toBe(true);
      expect(cancelBtn.disabled).toBe(true);
      expect(closeBtn.disabled).toBe(true);
      expect(screen.getByText(/saving\.\.\./i)).toBeDefined();
    });
  });
});

