// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

afterEach(() => {
  cleanup();
});

describe("components/shared/StatusBadge", () => {
  describe("Visible status labeling", () => {
    it("renders the canonical human-readable label for WAITING status", () => {
      render(<StatusBadge status="WAITING" />);
      const badge = screen.getByText("Waiting in Line");
      expect(badge).toBeDefined();
    });

    it("renders the canonical label for SERVING status", () => {
      render(<StatusBadge status="SERVING" />);
      const badge = screen.getByText("Now Serving");
      expect(badge).toBeDefined();
    });

    it("renders the canonical label for COMPLETED status", () => {
      render(<StatusBadge status="COMPLETED" />);
      const badge = screen.getByText("Completed");
      expect(badge).toBeDefined();
    });

    it("renders the canonical label for SKIPPED status", () => {
      render(<StatusBadge status="SKIPPED" />);
      const badge = screen.getByText("Skipped");
      expect(badge).toBeDefined();
    });

    it("renders the canonical label for CANCELLED status", () => {
      render(<StatusBadge status="CANCELLED" />);
      const badge = screen.getByText("Cancelled");
      expect(badge).toBeDefined();
    });

    it("falls back to the raw status string when given an unknown status", () => {
      render(<StatusBadge status="IN_REVIEW" />);
      const badge = screen.getByText("IN_REVIEW");
      expect(badge).toBeDefined();
    });

    it("falls back to 'Unknown' when given an empty status string", () => {
      render(<StatusBadge status="" />);
      const badge = screen.getByText("Unknown");
      expect(badge).toBeDefined();
    });
  });

  describe("Audience-specific labeling", () => {
    it("renders 'Ticket Called' for CALLED status with default (customer) audience", () => {
      render(<StatusBadge status="CALLED" />);
      expect(screen.getByText("Ticket Called")).toBeDefined();
      expect(screen.queryByText("Called")).toBeNull();
    });

    it("renders 'Ticket Called' for CALLED status when customer audience is explicitly specified", () => {
      render(<StatusBadge status="CALLED" audience="customer" />);
      expect(screen.getByText("Ticket Called")).toBeDefined();
    });

    it("renders compact 'Called' label for CALLED status with staff audience", () => {
      render(<StatusBadge status="CALLED" audience="staff" />);
      expect(screen.getByText("Called")).toBeDefined();
      expect(screen.queryByText("Ticket Called")).toBeNull();
    });

    it("renders identical label for other statuses regardless of audience", () => {
      const { unmount } = render(<StatusBadge status="WAITING" audience="customer" />);
      expect(screen.getByText("Waiting in Line")).toBeDefined();
      unmount();

      render(<StatusBadge status="WAITING" audience="staff" />);
      expect(screen.getByText("Waiting in Line")).toBeDefined();
    });
  });

  describe("Size variants and class composition", () => {
    it("applies default compact sizing classes by default", () => {
      render(<StatusBadge status="WAITING" />);
      const badge = screen.getByText("Waiting in Line");
      expect(badge.className).toContain("px-2.5");
      expect(badge.className).toContain("py-0.5");
      expect(badge.className).toContain("text-xs");
    });

    it("applies larger sizing classes when size='lg' is specified", () => {
      render(<StatusBadge status="WAITING" size="lg" />);
      const badge = screen.getByText("Waiting in Line");
      expect(badge.className).toContain("px-3");
      expect(badge.className).toContain("py-1");
      expect(badge.className).toContain("text-xs");
    });

    it("merges custom className prop without overriding core badge styles", () => {
      render(
        <StatusBadge
          status="COMPLETED"
          className="custom-shadow tracking-wide"
        />,
      );
      const badge = screen.getByText("Completed");
      expect(badge.className).toContain("custom-shadow");
      expect(badge.className).toContain("tracking-wide");
      expect(badge.className).toContain("rounded-full");
      expect(badge.className).toContain("border");
    });
  });

  describe("Visual indicator dot accessibility", () => {
    it("renders a decorative indicator dot marked as aria-hidden", () => {
      const { container } = render(<StatusBadge status="SERVING" />);
      const dot = container.querySelector('span[aria-hidden="true"]');
      expect(dot).not.toBeNull();
      expect(dot?.className).toContain("rounded-full");
      expect(dot?.className).toContain("bg-green-600");
    });

    it("includes pulse animation classes for high-urgency CALLED status", () => {
      render(<StatusBadge status="CALLED" />);
      const badge = screen.getByText("Ticket Called");
      expect(badge.className).toContain("animate-pulse");
    });
  });
});
