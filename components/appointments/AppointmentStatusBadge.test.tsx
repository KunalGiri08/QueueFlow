// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AppointmentStatusBadge,
  getAppointmentStatusBadgeConfig,
} from "./AppointmentStatusBadge";

describe("AppointmentStatusBadge", () => {
  it("renders Booked badge for BOOKED status", () => {
    render(<AppointmentStatusBadge status="BOOKED" />);
    expect(screen.getByText("Booked")).toBeDefined();
    const config = getAppointmentStatusBadgeConfig("BOOKED");
    expect(config.badgeClasses).toContain("bg-blue-50");
  });

  it("renders Completed badge for COMPLETED status", () => {
    render(<AppointmentStatusBadge status="COMPLETED" />);
    expect(screen.getByText("Completed")).toBeDefined();
    const config = getAppointmentStatusBadgeConfig("COMPLETED");
    expect(config.badgeClasses).toContain("bg-green-50");
  });

  it("renders Cancelled badge for CANCELLED status", () => {
    render(<AppointmentStatusBadge status="CANCELLED" />);
    expect(screen.getByText("Cancelled")).toBeDefined();
    const config = getAppointmentStatusBadgeConfig("CANCELLED");
    expect(config.badgeClasses).toContain("bg-red-50");
  });

  it("renders No Show badge for NO_SHOW status", () => {
    render(<AppointmentStatusBadge status="NO_SHOW" />);
    expect(screen.getByText("No Show")).toBeDefined();
    const config = getAppointmentStatusBadgeConfig("NO_SHOW");
    expect(config.badgeClasses).toContain("bg-amber-50");
  });

  it("renders fallback badge for unknown status", () => {
    render(<AppointmentStatusBadge status="CUSTOM_STATUS" />);
    expect(screen.getByText("CUSTOM_STATUS")).toBeDefined();
  });
});
