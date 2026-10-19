import { describe, it, expect } from "vitest";
import {
  getTicketStatusBadgeConfig,
  isTicketActive,
  isTicketTerminal,
  ACTIVE_TICKET_STATUSES,
  TERMINAL_TICKET_STATUSES,
} from "./ticket";

describe("lib/formatters/ticket", () => {
  describe("getTicketStatusBadgeConfig", () => {
    it("returns correct configuration for WAITING status", () => {
      const config = getTicketStatusBadgeConfig("WAITING");
      expect(config.label).toBe("Waiting in Line");
      expect(config.badgeClasses).toBe(
        "bg-amber-50 text-amber-800 border-amber-200/80",
      );
      expect(config.dotClass).toBe("bg-amber-500");
      expect(config.message).toBe(
        "You are currently in line. Please keep this page open to watch your position.",
      );
    });

    it("returns 'Ticket Called' for CALLED status with default (customer) audience", () => {
      const config = getTicketStatusBadgeConfig("CALLED");
      expect(config.label).toBe("Ticket Called");
      expect(config.badgeClasses).toContain("animate-pulse");
      expect(config.badgeClasses).toBe(
        "bg-blue-50 text-blue-800 border-blue-200/80 animate-pulse",
      );
      expect(config.dotClass).toBe("bg-blue-600");
      expect(config.message).toBe(
        "Your ticket has been called! Please head to the counter.",
      );
    });

    it("returns compact 'Called' for CALLED status with staff audience", () => {
      const config = getTicketStatusBadgeConfig("CALLED", "staff");
      expect(config.label).toBe("Called");
      expect(config.badgeClasses).toBe(
        "bg-blue-50 text-blue-800 border-blue-200/80 animate-pulse",
      );
      expect(config.dotClass).toBe("bg-blue-600");
    });

    it("returns correct configuration for SERVING status", () => {
      const config = getTicketStatusBadgeConfig("SERVING");
      expect(config.label).toBe("Now Serving");
      expect(config.badgeClasses).toBe(
        "bg-green-50 text-green-800 border-green-200/80",
      );
      expect(config.dotClass).toBe("bg-green-600");
      expect(config.message).toBe("You are currently being served.");
    });

    it("returns correct configuration for COMPLETED status", () => {
      const config = getTicketStatusBadgeConfig("COMPLETED");
      expect(config.label).toBe("Completed");
      expect(config.badgeClasses).toBe(
        "bg-gray-100 text-gray-800 border-gray-200",
      );
      expect(config.dotClass).toBe("bg-gray-500");
      expect(config.message).toBe(
        "This service session has been completed. Thank you!",
      );
    });

    it("returns correct configuration for SKIPPED status", () => {
      const config = getTicketStatusBadgeConfig("SKIPPED");
      expect(config.label).toBe("Skipped");
      expect(config.badgeClasses).toBe(
        "bg-orange-50 text-orange-800 border-orange-200/80",
      );
      expect(config.dotClass).toBe("bg-orange-500");
      expect(config.message).toBe(
        "Your ticket was skipped. Please speak with staff if you need assistance.",
      );
    });

    it("returns correct configuration for CANCELLED status", () => {
      const config = getTicketStatusBadgeConfig("CANCELLED");
      expect(config.label).toBe("Cancelled");
      expect(config.badgeClasses).toBe(
        "bg-red-50 text-red-800 border-red-200/80",
      );
      expect(config.dotClass).toBe("bg-red-500");
      expect(config.message).toBe("This ticket has been cancelled.");
    });

    it("handles unknown status string with safe fallback", () => {
      const config = getTicketStatusBadgeConfig("TRANSFERRING");
      expect(config.label).toBe("TRANSFERRING");
      expect(config.badgeClasses).toBe(
        "bg-gray-100 text-gray-800 border-gray-200",
      );
      expect(config.dotClass).toBe("bg-gray-500");
      expect(config.message).toBe("Ticket status: TRANSFERRING");
    });

    it("handles empty status string with safe fallback", () => {
      const config = getTicketStatusBadgeConfig("");
      expect(config.label).toBe("Unknown");
      expect(config.badgeClasses).toBe(
        "bg-gray-100 text-gray-800 border-gray-200",
      );
      expect(config.message).toBe("Ticket status unavailable.");
    });
  });

  describe("lifecycle helpers", () => {
    it("isTicketActive correctly identifies active statuses", () => {
      expect(ACTIVE_TICKET_STATUSES).toEqual(["WAITING", "CALLED", "SERVING"]);
      expect(isTicketActive("WAITING")).toBe(true);
      expect(isTicketActive("CALLED")).toBe(true);
      expect(isTicketActive("SERVING")).toBe(true);

      expect(isTicketActive("COMPLETED")).toBe(false);
      expect(isTicketActive("SKIPPED")).toBe(false);
      expect(isTicketActive("CANCELLED")).toBe(false);
      expect(isTicketActive("OTHER")).toBe(false);
    });

    it("isTicketTerminal correctly identifies terminal statuses", () => {
      expect(TERMINAL_TICKET_STATUSES).toEqual([
        "COMPLETED",
        "SKIPPED",
        "CANCELLED",
      ]);
      expect(isTicketTerminal("COMPLETED")).toBe(true);
      expect(isTicketTerminal("SKIPPED")).toBe(true);
      expect(isTicketTerminal("CANCELLED")).toBe(true);

      expect(isTicketTerminal("WAITING")).toBe(false);
      expect(isTicketTerminal("CALLED")).toBe(false);
      expect(isTicketTerminal("SERVING")).toBe(false);
      expect(isTicketTerminal("UNKNOWN")).toBe(false);
    });
  });
});
