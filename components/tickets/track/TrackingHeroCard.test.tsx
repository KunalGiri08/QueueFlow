// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrackingHeroCard } from "./TrackingHeroCard";

describe("components/tickets/track/TrackingHeroCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders ticket number, status badge, status message, organization and service", () => {
    const { container } = render(
      <TrackingHeroCard
        ticketNumber={105}
        status="CALLED"
        statusMessage="Please proceed to Counter 2"
        organizationName="Metro Bank"
        serviceName="Teller Services"
        counter={{ name: "Counter 2" }}
      />,
    );

    expect(screen.getByText("#105")).toBeDefined();
    expect(screen.getByText(/ticket called/i)).toBeDefined();
    expect(screen.getByText("Please proceed to Counter 2")).toBeDefined();
    expect(screen.getByText(/Metro Bank • Teller Services/)).toBeDefined();
    expect(screen.getByText("Counter 2")).toBeDefined();

    // Check responsive classes
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("p-5");
    expect(card.className).toContain("sm:p-8");

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toContain("text-5xl");
    expect(heading.className).toContain("sm:text-6xl");
  });

  it("omits assigned counter banner when counter is null", () => {
    render(
      <TrackingHeroCard
        ticketNumber={105}
        status="WAITING"
        statusMessage="You are in queue"
        organizationName="Metro Bank"
        serviceName="Teller Services"
        counter={null}
      />,
    );

    expect(screen.queryByText(/assigned counter/i)).toBeNull();
  });
});
