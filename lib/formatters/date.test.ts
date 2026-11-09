import { describe, it, expect } from "vitest";
import {
  formatDateTime,
  formatDate,
  formatCreationDate,
  toZonedDatetimeString,
  zonedDatetimeToUtc,
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

  describe("Timezone conversion utilities", () => {
    describe("toZonedDatetimeString", () => {
      it("formats a UTC instant into local datetime-local string for Asia/Kolkata (+05:30)", () => {
        // 04:30 UTC -> 10:00 IST
        const utcDate = new Date("2026-11-10T04:30:00.000Z");
        expect(toZonedDatetimeString(utcDate, "Asia/Kolkata")).toBe(
          "2026-11-10T10:00",
        );
      });

      it("formats a UTC instant into local datetime-local string for America/New_York (standard time -05:00)", () => {
        // 15:00 UTC -> 10:00 EST
        const utcDate = new Date("2026-11-10T15:00:00.000Z");
        expect(toZonedDatetimeString(utcDate, "America/New_York")).toBe(
          "2026-11-10T10:00",
        );
      });

      it("formats a UTC instant into local datetime-local string for America/New_York (daylight saving time -04:00)", () => {
        // 14:00 UTC -> 10:00 EDT
        const utcDate = new Date("2026-06-10T14:00:00.000Z");
        expect(toZonedDatetimeString(utcDate, "America/New_York")).toBe(
          "2026-06-10T10:00",
        );
      });
    });

    describe("zonedDatetimeToUtc", () => {
      it("converts Asia/Kolkata local datetime to correct UTC Date (+05:30 offset)", () => {
        const utcDate = zonedDatetimeToUtc("2026-11-10T10:00", "Asia/Kolkata");
        expect(utcDate).not.toBeNull();
        expect(utcDate?.toISOString()).toBe("2026-11-10T04:30:00.000Z");
      });

      it("converts America/New_York local datetime in standard winter time (UTC-5)", () => {
        const utcDate = zonedDatetimeToUtc("2026-11-10T10:00", "America/New_York");
        expect(utcDate).not.toBeNull();
        expect(utcDate?.toISOString()).toBe("2026-11-10T15:00:00.000Z");
      });

      it("converts America/New_York local datetime in daylight summer time (UTC-4)", () => {
        const utcDate = zonedDatetimeToUtc("2026-06-10T10:00", "America/New_York");
        expect(utcDate).not.toBeNull();
        expect(utcDate?.toISOString()).toBe("2026-06-10T14:00:00.000Z");
      });

      it("converts valid America/New_York time before DST transitions", () => {
        // Before spring-forward (clocks jump 02:00 -> 03:00 on 2026-03-08)
        // 01:30 is in EST (UTC-5): 01:30 + 5h = 06:30Z
        const beforeSpring = zonedDatetimeToUtc("2026-03-08T01:30", "America/New_York");
        expect(beforeSpring).not.toBeNull();
        expect(beforeSpring?.toISOString()).toBe("2026-03-08T06:30:00.000Z");

        // Before fall-back (clocks turn back 02:00 -> 01:00 on 2026-11-01)
        // 00:30 is in EDT (UTC-4): 00:30 + 4h = 04:30Z
        const beforeFall = zonedDatetimeToUtc("2026-11-01T00:30", "America/New_York");
        expect(beforeFall).not.toBeNull();
        expect(beforeFall?.toISOString()).toBe("2026-11-01T04:30:00.000Z");
      });

      it("converts valid America/New_York time after DST transitions", () => {
        // After spring-forward on 2026-03-08
        // 03:30 is in EDT (UTC-4): 03:30 + 4h = 07:30Z
        const afterSpring = zonedDatetimeToUtc("2026-03-08T03:30", "America/New_York");
        expect(afterSpring).not.toBeNull();
        expect(afterSpring?.toISOString()).toBe("2026-03-08T07:30:00.000Z");

        // After fall-back on 2026-11-01
        // 02:30 is in EST (UTC-5): 02:30 + 5h = 07:30Z
        const afterFall = zonedDatetimeToUtc("2026-11-01T02:30", "America/New_York");
        expect(afterFall).not.toBeNull();
        expect(afterFall?.toISOString()).toBe("2026-11-01T07:30:00.000Z");
      });

      it("rejects DST spring-forward nonexistent local gap with null", () => {
        // In America/New_York on 2026-03-08, clocks jump from 02:00 to 03:00.
        // 02:30 does not exist locally; must return null rather than shifting time.
        expect(zonedDatetimeToUtc("2026-03-08T02:30", "America/New_York")).toBeNull();
      });

      it("rejects DST autumn fall-back ambiguous local time with null", () => {
        // In America/New_York on 2026-11-01, clocks jump back from 02:00 to 01:00.
        // 01:30 occurs twice (EDT and EST); must return null rather than guessing.
        expect(zonedDatetimeToUtc("2026-11-01T01:30", "America/New_York")).toBeNull();
      });

      it("handles leap-year and invalid calendar dates correctly", () => {
        // 2024 is a leap year; Feb 29 is valid
        const leapValid = zonedDatetimeToUtc("2024-02-29T10:00", "Asia/Kolkata");
        expect(leapValid).not.toBeNull();
        expect(leapValid?.toISOString()).toBe("2024-02-29T04:30:00.000Z");

        // 2025 is not a leap year; Feb 29 must return null
        expect(zonedDatetimeToUtc("2025-02-29T10:00", "Asia/Kolkata")).toBeNull();

        // Feb 30 does not exist; must return null
        expect(zonedDatetimeToUtc("2024-02-30T10:00", "Asia/Kolkata")).toBeNull();
      });

      it("returns null for malformed or invalid datetime strings", () => {
        expect(zonedDatetimeToUtc("invalid", "Asia/Kolkata")).toBeNull();
        expect(zonedDatetimeToUtc("", "Asia/Kolkata")).toBeNull();
        expect(zonedDatetimeToUtc("2026-13-10T10:00", "Asia/Kolkata")).toBeNull();
        expect(zonedDatetimeToUtc("2026-11-10T25:00", "Asia/Kolkata")).toBeNull();
      });

      it("returns null for invalid timezone string", () => {
        expect(zonedDatetimeToUtc("2026-11-10T10:00", "invalid/tz")).toBeNull();
      });

      it("preserves exact round-trip conversion between local string and UTC Date", () => {
        const originalLocal = "2026-11-10T11:45";
        const tz = "Asia/Kolkata";
        const utc = zonedDatetimeToUtc(originalLocal, tz);
        expect(utc).not.toBeNull();
        const backToLocal = toZonedDatetimeString(utc!, tz);
        expect(backToLocal).toBe(originalLocal);
      });
    });
  });
});
