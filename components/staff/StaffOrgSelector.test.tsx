// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StaffOrgSelector, type OrganizationItem } from "./StaffOrgSelector";

afterEach(() => {
  cleanup();
});

const mockOrgs: OrganizationItem[] = [
  { id: "org-1", name: "Apex Healthcare", slug: "apex" },
  { id: "org-2", name: "Beacon Clinic", slug: "beacon" },
];

describe("StaffOrgSelector", () => {
  it("renders a dropdown with accessible label when multiple organizations exist", () => {
    const handleSelect = vi.fn();
    render(
      <StaffOrgSelector
        organizations={mockOrgs}
        selectedOrgId="org-1"
        onSelectOrg={handleSelect}
      />,
    );

    const select = screen.getByLabelText("Select Organization");
    expect(select).toBeDefined();
    expect(select.tagName.toLowerCase()).toBe("select");
  });

  it("renders all organization options with correct names and values", () => {
    const handleSelect = vi.fn();
    render(
      <StaffOrgSelector
        organizations={mockOrgs}
        selectedOrgId="org-1"
        onSelectOrg={handleSelect}
      />,
    );

    const select = screen.getByLabelText("Select Organization") as HTMLSelectElement;
    expect(select.options.length).toBe(2);
    expect(select.options[0].value).toBe("org-1");
    expect(select.options[0].text).toBe("Apex Healthcare");
    expect(select.options[1].value).toBe("org-2");
    expect(select.options[1].text).toBe("Beacon Clinic");
  });

  it("reflects the current selectedOrgId value in the dropdown", () => {
    const handleSelect = vi.fn();
    render(
      <StaffOrgSelector
        organizations={mockOrgs}
        selectedOrgId="org-2"
        onSelectOrg={handleSelect}
      />,
    );

    const select = screen.getByLabelText("Select Organization") as HTMLSelectElement;
    expect(select.value).toBe("org-2");
  });

  it("invokes onSelectOrg when the user selects a different organization", () => {
    const handleSelect = vi.fn();
    render(
      <StaffOrgSelector
        organizations={mockOrgs}
        selectedOrgId="org-1"
        onSelectOrg={handleSelect}
      />,
    );

    const select = screen.getByLabelText("Select Organization");
    fireEvent.change(select, { target: { value: "org-2" } });

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith("org-2");
  });

  it("renders a static badge instead of a dropdown when only one organization exists", () => {
    const handleSelect = vi.fn();
    render(
      <StaffOrgSelector
        organizations={[mockOrgs[0]]}
        selectedOrgId="org-1"
        onSelectOrg={handleSelect}
      />,
    );

    expect(screen.queryByLabelText("Select Organization")).toBeNull();
    const badge = screen.getByText("Apex Healthcare");
    expect(badge).toBeDefined();
    expect(badge.tagName.toLowerCase()).toBe("span");
  });

  it("handles null selectedOrgId gracefully for multiple organizations", () => {
    const handleSelect = vi.fn();
    render(
      <StaffOrgSelector
        organizations={mockOrgs}
        selectedOrgId={null}
        onSelectOrg={handleSelect}
      />,
    );

    const select = screen.getByLabelText("Select Organization") as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.tagName.toLowerCase()).toBe("select");
  });

  it("handles null selectedOrgId gracefully for a single organization", () => {
    const handleSelect = vi.fn();
    render(
      <StaffOrgSelector
        organizations={[mockOrgs[0]]}
        selectedOrgId={null}
        onSelectOrg={handleSelect}
      />,
    );

    expect(screen.queryByLabelText("Select Organization")).toBeNull();
    expect(screen.getByText("Apex Healthcare")).toBeDefined();
  });
});
