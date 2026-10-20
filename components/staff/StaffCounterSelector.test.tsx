// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  StaffCounterSelector,
  type AssignedCounterItem,
} from "./StaffCounterSelector";

afterEach(() => {
  cleanup();
});

const mockAssignedCounters: AssignedCounterItem[] = [
  {
    id: "assign-1",
    staffId: "staff-1",
    counter: {
      id: "counter-1",
      name: "Desk 1",
      isActive: true,
      organizationId: "org-1",
    },
  },
  {
    id: "assign-2",
    staffId: "staff-1",
    counter: {
      id: "counter-2",
      name: "Desk 2",
      isActive: true,
      organizationId: "org-1",
    },
  },
  {
    id: "assign-3",
    staffId: "staff-1",
    counter: {
      id: "counter-3",
      name: "Desk 3",
      isActive: false,
      organizationId: "org-1",
    },
  },
];

describe("StaffCounterSelector", () => {
  it("renders 'No Counters Assigned' empty state with organization name and no selector when list is empty", () => {
    const handleSelect = vi.fn();
    render(
      <StaffCounterSelector
        assignedCounters={[]}
        selectedCounterId={null}
        onSelectCounter={handleSelect}
        counterWarning={null}
        organizationName="Apex Healthcare"
      />,
    );

    expect(screen.getByText("No Counters Assigned")).toBeDefined();
    expect(screen.getByText("Apex Healthcare")).toBeDefined();
    expect(screen.queryByLabelText("Assigned Desk / Counter")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders 'All Assigned Counters Inactive' empty state and no selector when all assigned counters are inactive", () => {
    const handleSelect = vi.fn();
    const inactiveCountersOnly = [mockAssignedCounters[2]];
    render(
      <StaffCounterSelector
        assignedCounters={inactiveCountersOnly}
        selectedCounterId={null}
        onSelectCounter={handleSelect}
        counterWarning={null}
        organizationName="Apex Healthcare"
      />,
    );

    expect(screen.getByText("All Assigned Counters Inactive")).toBeDefined();
    expect(
      screen.getByText(
        /All counters assigned to your account in this organization are currently inactive/i,
      ),
    ).toBeDefined();
    expect(screen.queryByLabelText("Assigned Desk / Counter")).toBeNull();
  });

  it("renders an accessible selector label and correctly formats active and inactive options", () => {
    const handleSelect = vi.fn();
    render(
      <StaffCounterSelector
        assignedCounters={mockAssignedCounters}
        selectedCounterId="counter-1"
        onSelectCounter={handleSelect}
        counterWarning={null}
        organizationName="Apex Healthcare"
      />,
    );

    const select = screen.getByLabelText(
      "Assigned Desk / Counter",
    ) as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.tagName.toLowerCase()).toBe("select");

    expect(select.options.length).toBe(3);
    expect(select.options[0].value).toBe("counter-1");
    expect(select.options[0].text).toBe("Desk 1 (Active)");
    expect(select.options[1].value).toBe("counter-2");
    expect(select.options[1].text).toBe("Desk 2 (Active)");
    expect(select.options[2].value).toBe("counter-3");
    expect(select.options[2].text).toBe("Desk 3 (Inactive)");
  });

  it("disables inactive options while keeping active options enabled", () => {
    const handleSelect = vi.fn();
    render(
      <StaffCounterSelector
        assignedCounters={mockAssignedCounters}
        selectedCounterId="counter-1"
        onSelectCounter={handleSelect}
        counterWarning={null}
        organizationName="Apex Healthcare"
      />,
    );

    const select = screen.getByLabelText(
      "Assigned Desk / Counter",
    ) as HTMLSelectElement;
    expect(select.options[0].disabled).toBe(false);
    expect(select.options[1].disabled).toBe(false);
    expect(select.options[2].disabled).toBe(true);
  });

  it("binds the controlled selectedCounterId value to the select dropdown", () => {
    const handleSelect = vi.fn();
    render(
      <StaffCounterSelector
        assignedCounters={mockAssignedCounters}
        selectedCounterId="counter-2"
        onSelectCounter={handleSelect}
        counterWarning={null}
        organizationName="Apex Healthcare"
      />,
    );

    const select = screen.getByLabelText(
      "Assigned Desk / Counter",
    ) as HTMLSelectElement;
    expect(select.value).toBe("counter-2");
  });

  it("invokes onSelectCounter with the counter ID when the user selects an option", () => {
    const handleSelect = vi.fn();
    render(
      <StaffCounterSelector
        assignedCounters={mockAssignedCounters}
        selectedCounterId="counter-1"
        onSelectCounter={handleSelect}
        counterWarning={null}
        organizationName="Apex Healthcare"
      />,
    );

    const select = screen.getByLabelText("Assigned Desk / Counter");
    fireEvent.change(select, { target: { value: "counter-2" } });

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith("counter-2");
  });

  it("renders a warning banner with role='alert' when counterWarning is provided", () => {
    const handleSelect = vi.fn();
    const warningMessage =
      "Active ticket is tied to Counter 'Desk 99', which is no longer assigned.";
    render(
      <StaffCounterSelector
        assignedCounters={mockAssignedCounters}
        selectedCounterId="counter-1"
        onSelectCounter={handleSelect}
        counterWarning={warningMessage}
        organizationName="Apex Healthcare"
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain(warningMessage);
  });

  it("does not render an alert when counterWarning is null", () => {
    const handleSelect = vi.fn();
    render(
      <StaffCounterSelector
        assignedCounters={mockAssignedCounters}
        selectedCounterId="counter-1"
        onSelectCounter={handleSelect}
        counterWarning={null}
        organizationName="Apex Healthcare"
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
