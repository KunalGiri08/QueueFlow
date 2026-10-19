import { describe, it, expect } from "vitest";
import {
  formatDateTime,
  formatDate,
  formatCreationDate,
} from "./date";

describe("lib/formatters/date", () => {
  describe("formatDateTime", () => {
    it("formats a valid ISO timestamp in en-US format", () => {
      // 2026-10-18T14:30:00Z in UTC is "Oct 18, 2026, 2:30 PM"
      const formatted = formatDateTime("2026-10-18T14:30:00Z", {
        timeZone: "UTC",
      });
      expect(formatted).toBe("Oct 18, 2026, 2:30 PM");
    });

    it("returns original string when date string is invalid", () => {
      expect(formatDateTime("invalid-date-string")).toBe("invalid-date-string");
      expect(formatDateTime("2026-99-99T99:99:99Z")).toBe("2026-99-99T99:99:99Z");
    });

    it("returns empty string when input is null or undefined or empty", () => {
      expect(formatDateTime(null)).toBe("");
      expect(formatDateTime(undefined)).toBe("");
      expect(formatDateTime("")).toBe("");
    });

    it("supports a custom locale", () => {
      const formatted = formatDateTime("2026-10-18T14:30:00Z", {
        locale: "en-GB",
        timeZone: "UTC",
      });
      expect(formatted).toContain("18 Oct 2026");
    });
  });

  describe("formatDate", () => {
    it("formats a valid date string as year, month, day", () => {
      const formatted = formatDate("2026-10-18T14:30:00Z", {
        timeZone: "UTC",
      });
      expect(formatted).toBe("Oct 18, 2026");
    });

    it("returns fallback for invalid date strings", () => {
      expect(formatDate("not-a-date")).toBe("not-a-date");
      expect(formatDate("not-a-date", {}, "Unknown date")).toBe("Unknown date");
    });

    it("returns fallback for empty, null, or undefined inputs", () => {
      expect(formatDate(null)).toBe("");
      expect(formatDate(null, {}, "N/A")).toBe("N/A");
      expect(formatDate(undefined)).toBe("");
      expect(formatDate("")).toBe("");
    });
  });

  describe("formatCreationDate", () => {
    it("formats a valid date with 'Created ' prefix", () => {
      const formatted = formatCreationDate("2026-10-18T14:30:00Z", {
        timeZone: "UTC",
      });
      expect(formatted).toBe("Created Oct 18, 2026");
    });

    it("returns 'Created recently' for invalid dates", () => {
      expect(formatCreationDate("invalid-date-value")).toBe("Created recently");
      expect(formatCreationDate("")).toBe("Created recently");
    });

    it("returns 'Created recently' for null or undefined", () => {
      expect(formatCreationDate(null)).toBe("Created recently");
      expect(formatCreationDate(undefined)).toBe("Created recently");
    });
  });
});
