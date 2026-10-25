// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TurnNotificationBanner } from "./TurnNotificationBanner";

describe("TurnNotificationBanner Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with ticket number and assigned counter name", () => {
    const handleDismiss = vi.fn();
    render(
      <TurnNotificationBanner
        ticketNumber={42}
        counter={{ name: "Counter 3" }}
        onDismiss={handleDismiss}
      />,
    );

    expect(screen.getByText("Ticket #42")).toBeDefined();
    expect(screen.getByText("Called")).toBeDefined();
    expect(
      screen.getByText("Your turn! Please proceed to Counter 3."),
    ).toBeDefined();
    expect(screen.getByText("Counter 3")).toBeDefined();
  });

  it("renders fallback message when counter is null", () => {
    const handleDismiss = vi.fn();
    render(
      <TurnNotificationBanner
        ticketNumber={99}
        counter={null}
        onDismiss={handleDismiss}
      />,
    );

    expect(screen.getByText("Ticket #99")).toBeDefined();
    expect(
      screen.getByText("Your turn! Please proceed to the service counter."),
    ).toBeDefined();
    expect(
      screen.getByText("Please proceed to the service counter."),
    ).toBeDefined();
  });

  it("renders fallback message when counter is undefined", () => {
    const handleDismiss = vi.fn();
    render(
      <TurnNotificationBanner
        ticketNumber={7}
        onDismiss={handleDismiss}
      />,
    );

    expect(screen.getByText("Ticket #7")).toBeDefined();
    expect(
      screen.getByText("Your turn! Please proceed to the service counter."),
    ).toBeDefined();
  });

  it("has accessible alert semantics", () => {
    render(
      <TurnNotificationBanner
        ticketNumber={10}
        counter={{ name: "Window 1" }}
        onDismiss={vi.fn()}
      />,
    );

    const alertElement = screen.getByRole("alert");
    expect(alertElement).toBeDefined();
    expect(alertElement.getAttribute("aria-live")).toBe("assertive");
    expect(alertElement.getAttribute("aria-atomic")).toBe("true");
  });

  it("invokes onDismiss callback when the dismiss button is clicked", () => {
    const handleDismiss = vi.fn();
    render(
      <TurnNotificationBanner
        ticketNumber={15}
        counter={{ name: "Desk B" }}
        onDismiss={handleDismiss}
      />,
    );

    const dismissButton = screen.getByRole("button", { name: /^dismiss$/i });
    fireEvent.click(dismissButton);
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});
