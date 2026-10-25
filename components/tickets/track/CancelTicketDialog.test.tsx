// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CancelTicketDialog } from "./CancelTicketDialog";

describe("CancelTicketDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const defaultProps = {
    isOpen: true,
    ticketNumber: 42,
    serviceName: "General Consultation",
    isCancelling: false,
    error: null,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };

  it("does not render when isOpen is false", () => {
    render(<CancelTicketDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders accessible dialog with ticket details and description", () => {
    render(<CancelTicketDialog {...defaultProps} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    expect(screen.getByText("Cancel Ticket #42")).toBeDefined();
    expect(
      screen.getByText(/Are you sure you want to cancel your place in line\?/),
    ).toBeDefined();
    expect(
      screen.getAllByText("General Consultation").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("calls onClose when Keep My Place is clicked", () => {
    const onClose = vi.fn();
    render(<CancelTicketDialog {...defaultProps} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Keep My Place" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when Yes, Cancel Ticket is clicked", () => {
    const onConfirm = vi.fn();
    render(<CancelTicketDialog {...defaultProps} onConfirm={onConfirm} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Yes, Cancel Ticket" }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key press when not cancelling", () => {
    const onClose = vi.fn();
    render(<CancelTicketDialog {...defaultProps} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape key press when isCancelling is true", () => {
    const onClose = vi.fn();
    render(
      <CancelTicketDialog
        {...defaultProps}
        isCancelling={true}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("displays error alert when error is provided", () => {
    render(
      <CancelTicketDialog
        {...defaultProps}
        error="Unable to cancel ticket at this time. Please try again."
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(
      screen.getByText(
        "Unable to cancel ticket at this time. Please try again.",
      ),
    ).toBeDefined();
  });

  it("disables both buttons and shows spinner text when isCancelling is true", () => {
    render(<CancelTicketDialog {...defaultProps} isCancelling={true} />);

    const keepButton = screen.getByRole("button", { name: "Keep My Place" });
    const cancelButton = screen.getByRole("button", {
      name: "Cancelling...",
    });

    expect(keepButton.hasAttribute("disabled")).toBe(true);
    expect(cancelButton.hasAttribute("disabled")).toBe(true);
  });
});
