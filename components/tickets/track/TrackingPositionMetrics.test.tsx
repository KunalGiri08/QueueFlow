// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TrackingPositionMetrics } from "./TrackingPositionMetrics";

describe("TrackingPositionMetrics", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders estimated wait time when a number is provided", () => {
    render(
      <TrackingPositionMetrics
        peopleAhead={3}
        currentlyServing={39}
        estimatedWaitMinutes={15}
      />,
    );

    expect(screen.getByText("Estimated Wait")).toBeDefined();
    expect(screen.getByText("~15 min")).toBeDefined();
    expect(
      screen.getByText("Estimated time, not a guarantee"),
    ).toBeDefined();

    // People ahead & currently serving remain present
    expect(screen.getByText("People Ahead")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("Currently Serving")).toBeDefined();
    expect(screen.getByText("#39")).toBeDefined();
  });

  it("renders ~0 min when estimatedWaitMinutes is 0", () => {
    render(
      <TrackingPositionMetrics
        peopleAhead={0}
        currentlyServing={42}
        estimatedWaitMinutes={0}
      />,
    );

    expect(screen.getByText("Estimated Wait")).toBeDefined();
    expect(screen.getByText("~0 min")).toBeDefined();
    expect(
      screen.getByText("Estimated time, not a guarantee"),
    ).toBeDefined();
  });

  it("renders 'Unavailable' when estimatedWaitMinutes is null", () => {
    render(
      <TrackingPositionMetrics
        peopleAhead={1}
        currentlyServing={null}
        estimatedWaitMinutes={null}
      />,
    );

    expect(screen.getByText("Estimated Wait")).toBeDefined();
    expect(screen.getByText("Unavailable")).toBeDefined();
    expect(
      screen.getByText("Estimate currently unavailable"),
    ).toBeDefined();
  });

  it("renders 'Unavailable' when estimatedWaitMinutes is omitted (undefined)", () => {
    render(
      <TrackingPositionMetrics
        peopleAhead={2}
        currentlyServing={null}
      />,
    );

    expect(screen.getByText("Estimated Wait")).toBeDefined();
    expect(screen.getByText("Unavailable")).toBeDefined();
    expect(
      screen.getByText("Estimate currently unavailable"),
    ).toBeDefined();
  });
});
