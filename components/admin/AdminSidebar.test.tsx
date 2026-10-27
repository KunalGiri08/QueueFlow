// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AdminSidebar, ADMIN_SECTIONS, type AdminSectionId } from "./AdminSidebar";

describe("AdminSidebar Component", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all defined administrative sections in desktop tablist", () => {
    const handleSelect = vi.fn();
    render(
      <AdminSidebar activeSection="overview" onSelectSection={handleSelect} />,
    );

    const tablist = screen.getByRole("tablist", {
      name: /admin dashboard sections/i,
    });
    expect(tablist).toBeDefined();

    for (const section of ADMIN_SECTIONS) {
      const tab = screen.getByRole("tab", { name: new RegExp(section.label, "i") });
      expect(tab).toBeDefined();
    }
  });

  it("indicates active section with aria-selected=true on desktop tab", () => {
    const handleSelect = vi.fn();
    render(
      <AdminSidebar activeSection="counters" onSelectSection={handleSelect} />,
    );

    const countersTab = screen.getByRole("tab", { name: /counters/i });
    expect(countersTab.getAttribute("aria-selected")).toBe("true");

    const overviewTab = screen.getByRole("tab", { name: /overview/i });
    expect(overviewTab.getAttribute("aria-selected")).toBe("false");
  });

  it("calls onSelectSection with correct id when desktop tab is clicked", () => {
    const handleSelect = vi.fn();
    render(
      <AdminSidebar activeSection="overview" onSelectSection={handleSelect} />,
    );

    const staffTab = screen.getByRole("tab", { name: /staff & access/i });
    fireEvent.click(staffTab);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith("staff");
  });

  it("toggles collapsible mobile navigation menu", () => {
    const handleSelect = vi.fn();
    render(
      <AdminSidebar activeSection="overview" onSelectSection={handleSelect} />,
    );

    const toggleBtn = screen.getByRole("button", {
      name: /toggle navigation menu/i,
    });
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /close menu/i })).toBeNull();

    // Open mobile menu
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");

    // Close mobile menu
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("selects section and automatically closes mobile menu when mobile item is clicked", () => {
    const handleSelect = vi.fn();
    render(
      <AdminSidebar activeSection="overview" onSelectSection={handleSelect} />,
    );

    const toggleBtn = screen.getByRole("button", {
      name: /toggle navigation menu/i,
    });
    fireEvent.click(toggleBtn);

    // In mobile menu, find button for Operating Hours
    const mobileNav = document.getElementById("admin-mobile-nav");
    expect(mobileNav).not.toBeNull();

    const operatingHoursBtn = mobileNav?.querySelector("button:nth-child(4)");
    expect(operatingHoursBtn).toBeDefined();
    if (operatingHoursBtn) {
      fireEvent.click(operatingHoursBtn);
    }

    expect(handleSelect).toHaveBeenCalledWith("operating-hours");
    // Mobile menu should be closed after selection
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
  });
});
