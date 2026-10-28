import { describe, expect, it } from "vitest";
import {
  evaluateOperatingHours,
  isOrganizationOpen,
  getLocalTimeDetails,
  isValidIntervalItem,
  isValidClosureItem,
  getContinuousOperatingBlocks,
  evaluateServiceAdmission,
  ClosureItem,
} from "./schedule.service";
import { ScheduleIntervalItem } from "@/lib/validations/schedule";

describe("Operating Hours Evaluation Engine (schedule.service)", () => {
  const defaultTimezone = "Asia/Kolkata"; // UTC+05:30

  // Standard Monday-Friday 09:00 - 17:00
  const standardWeekIntervals: ScheduleIntervalItem[] = [
    { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true }, // Mon
    { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", isActive: true }, // Tue
    { dayOfWeek: 3, startTime: "09:00", endTime: "17:00", isActive: true }, // Wed
    { dayOfWeek: 4, startTime: "09:00", endTime: "17:00", isActive: true }, // Thu
    { dayOfWeek: 5, startTime: "09:00", endTime: "17:00", isActive: true }, // Fri
  ];

  describe("Single Interval Evaluation & Boundaries", () => {
    // 2026-10-26 is a Monday
    // In Asia/Kolkata (UTC+5:30):
    // 09:00 IST = 03:30:00 UTC
    // 13:00 IST = 07:30:00 UTC
    // 17:00 IST = 11:30:00 UTC

    it("evaluates open inside an active interval", () => {
      const instant = new Date("2026-10-26T07:30:00.000Z"); // 13:00 IST on Monday
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe("OPEN");
      expect(result.localTime).toEqual({
        date: "2026-10-26",
        dayOfWeek: 1,
        time: "13:00",
        minutes: 780,
      });
      expect(result.activeInterval?.startTime).toBe("09:00");
      expect(result.activeInterval?.endTime).toBe("17:00");
    });

    it("evaluates open at the exact interval start (start-inclusive: 09:00)", () => {
      const instant = new Date("2026-10-26T03:30:00.000Z"); // 09:00 IST on Monday
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe("OPEN");
      expect(result.localTime?.time).toBe("09:00");
      expect(result.localTime?.minutes).toBe(540);
    });

    it("evaluates closed at 1 minute before interval start (08:59)", () => {
      const instant = new Date("2026-10-26T03:29:00.000Z"); // 08:59 IST on Monday
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        instant,
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("OUTSIDE_WORKING_HOURS");
      expect(result.localTime?.time).toBe("08:59");
    });

    it("evaluates open at 1 minute before interval end (16:59)", () => {
      const instant = new Date("2026-10-26T11:29:00.000Z"); // 16:59 IST on Monday
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe("OPEN");
      expect(result.localTime?.time).toBe("16:59");
    });

    it("evaluates closed at the exact interval end (end-exclusive: 17:00)", () => {
      const instant = new Date("2026-10-26T11:30:00.000Z"); // 17:00 IST on Monday
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        instant,
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("OUTSIDE_WORKING_HOURS");
      expect(result.localTime?.time).toBe("17:00");
    });

    it("evaluates closed after interval end (17:01)", () => {
      const instant = new Date("2026-10-26T11:31:00.000Z"); // 17:01 IST on Monday
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        instant,
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("OUTSIDE_WORKING_HOURS");
    });
  });

  describe("Multiple Intervals on Same Day", () => {
    // Split schedule: Morning 09:00 - 12:00, Afternoon 13:00 - 17:00 on Monday
    const splitIntervals: ScheduleIntervalItem[] = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
      { dayOfWeek: 1, startTime: "13:00", endTime: "17:00", isActive: true },
    ];

    it("evaluates open in morning interval (10:30)", () => {
      const instant = new Date("2026-10-26T05:00:00.000Z"); // 10:30 IST
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: splitIntervals,
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.activeInterval?.startTime).toBe("09:00");
      expect(result.activeInterval?.endTime).toBe("12:00");
    });

    it("evaluates closed between two split intervals (12:30 lunch break)", () => {
      const instant = new Date("2026-10-26T07:00:00.000Z"); // 12:30 IST
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: splitIntervals,
        instant,
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("OUTSIDE_WORKING_HOURS");
      expect(result.localTime?.time).toBe("12:30");
    });

    it("evaluates open in afternoon interval (14:15)", () => {
      const instant = new Date("2026-10-26T08:45:00.000Z"); // 14:15 IST
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: splitIntervals,
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.activeInterval?.startTime).toBe("13:00");
      expect(result.activeInterval?.endTime).toBe("17:00");
    });

    it("handles touching boundary intervals seamlessly (09:00-12:00 and 12:00-16:00)", () => {
      const touchingIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
        { dayOfWeek: 1, startTime: "12:00", endTime: "16:00", isActive: true },
      ];

      // At exact 12:00 boundary, first interval closes but second opens
      const instant = new Date("2026-10-26T06:30:00.000Z"); // 12:00 IST
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: touchingIntervals,
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe("OPEN");
      expect(result.activeInterval?.startTime).toBe("12:00");
      expect(result.activeInterval?.endTime).toBe("16:00");
    });
  });

  describe("Active/Inactive Intervals & Days Without Schedule", () => {
    it("returns NO_ACTIVE_SCHEDULE when intervals exist on this day but all are inactive", () => {
      const inactiveIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: false },
      ];

      const instant = new Date("2026-10-26T07:30:00.000Z"); // 13:00 IST on Monday
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: inactiveIntervals,
        instant,
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("NO_ACTIVE_SCHEDULE");
    });

    it("returns NO_ACTIVE_SCHEDULE on Sunday (dayOfWeek = 0) when no intervals are configured for Sunday", () => {
      // 2026-10-25 is a Sunday
      const instant = new Date("2026-10-25T06:30:00.000Z"); // 12:00 IST on Sunday
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals, // Mon-Fri only
        instant,
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("NO_ACTIVE_SCHEDULE");
      expect(result.localTime?.dayOfWeek).toBe(0);
    });

    it("evaluates open on Sunday (dayOfWeek = 0) when Sunday schedule is configured", () => {
      const sundayIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 0, startTime: "10:00", endTime: "14:00", isActive: true },
      ];

      // 2026-10-25 11:00 IST on Sunday
      const instant = new Date("2026-10-25T05:30:00.000Z");
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: sundayIntervals,
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.localTime?.dayOfWeek).toBe(0);
      expect(result.activeInterval?.dayOfWeek).toBe(0);
    });

    it("evaluates open on Saturday (dayOfWeek = 6) when Saturday schedule is configured", () => {
      const saturdayIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 6, startTime: "10:00", endTime: "14:00", isActive: true },
      ];

      // 2026-10-24 is a Saturday. 11:30 IST = 06:00 UTC
      const instant = new Date("2026-10-24T06:00:00.000Z");
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: saturdayIntervals,
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.localTime?.dayOfWeek).toBe(6);
      expect(result.activeInterval?.dayOfWeek).toBe(6);
    });
  });

  describe("Exceptional Closures & Overriding Opening Hours", () => {
    it("returns ORGANIZATION_CLOSED on a single-day closure (startDate === endDate)", () => {
      const closures: ClosureItem[] = [
        {
          startDate: "2026-10-26",
          endDate: "2026-10-26",
          reason: "Diwali Public Holiday",
        },
      ];

      // Monday 13:00 IST (during normal working hours)
      const instant = new Date("2026-10-26T07:30:00.000Z");
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        closures,
        instant,
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("ORGANIZATION_CLOSED");
      expect(result.activeClosure?.reason).toBe("Diwali Public Holiday");
      expect(result.message).toContain("Diwali Public Holiday");
    });

    it("handles multi-day closure including start endpoint, middle date, and end endpoint", () => {
      const closures: ClosureItem[] = [
        {
          startDate: "2026-12-24",
          endDate: "2026-12-26",
          reason: "Winter Break",
        },
      ];

      // Day before (2026-12-23 11:00 IST): should be open according to schedule
      // 2026-12-23 is Wednesday (dayOfWeek = 3)
      const beforeClosure = new Date("2026-12-23T05:30:00.000Z"); // 11:00 IST
      expect(
        evaluateOperatingHours({
          timezone: defaultTimezone,
          intervals: standardWeekIntervals,
          closures,
          instant: beforeClosure,
        }).isOpen,
      ).toBe(true);

      // Start date (2026-12-24 11:00 IST): closed
      const startDate = new Date("2026-12-24T05:30:00.000Z");
      const startResult = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        closures,
        instant: startDate,
      });
      expect(startResult.isOpen).toBe(false);
      expect(startResult.reason).toBe("ORGANIZATION_CLOSED");

      // Middle date (2026-12-25 11:00 IST): closed
      const middleDate = new Date("2026-12-25T05:30:00.000Z");
      const midResult = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        closures,
        instant: middleDate,
      });
      expect(midResult.isOpen).toBe(false);
      expect(midResult.reason).toBe("ORGANIZATION_CLOSED");

      // End date (2026-12-26 11:00 IST): closed
      const endDate = new Date("2026-12-26T05:30:00.000Z");
      const endResult = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        closures,
        instant: endDate,
      });
      expect(endResult.isOpen).toBe(false);
      expect(endResult.reason).toBe("ORGANIZATION_CLOSED");
    });

    it("verifies closure takes precedence over otherwise open hours", () => {
      const closures: ClosureItem[] = [
        {
          startDate: "2026-10-26",
          endDate: "2026-10-26",
          reason: "Emergency Maintenance",
        },
      ];

      const instant = new Date("2026-10-26T04:00:00.000Z"); // Monday 09:30 IST
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        closures,
        instant,
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("ORGANIZATION_CLOSED");
      expect(result.activeInterval).toBeUndefined();
      expect(result.activeClosure?.reason).toBe("Emergency Maintenance");
    });
  });

  describe("Timezone Correctness & Boundary Crossings", () => {
    it("evaluates correctly in America/New_York when UTC date is different from local calendar date", () => {
      const nyTimezone = "America/New_York";
      // In July 2026, New York is in EDT (UTC-4)
      // Instant: 2026-07-04T03:30:00.000Z (3:30 AM UTC on Saturday July 4)
      // In New York: Friday, July 3, 2026 at 23:30 (11:30 PM EDT)
      const instant = new Date("2026-07-04T03:30:00.000Z");

      const nyIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 5, startTime: "09:00", endTime: "17:00", isActive: true }, // Friday
      ];

      const result = evaluateOperatingHours({
        timezone: nyTimezone,
        intervals: nyIntervals,
        instant,
      });

      // It is Friday 23:30 in New York -> outside working hours
      expect(result.localTime?.date).toBe("2026-07-03");
      expect(result.localTime?.dayOfWeek).toBe(5);
      expect(result.localTime?.time).toBe("23:30");
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("OUTSIDE_WORKING_HOURS");
    });

    it("evaluates correctly when UTC is late previous day and local is early next day", () => {
      // In Asia/Tokyo (UTC+9):
      // Instant: 2026-10-25T20:00:00.000Z (Sunday 8:00 PM UTC)
      // In Tokyo: Monday, Oct 26, 2026 at 05:00 AM JST
      const instant = new Date("2026-10-25T20:00:00.000Z");
      const tokyoTimezone = "Asia/Tokyo";

      const tokyoIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true }, // Mon
      ];

      const result = evaluateOperatingHours({
        timezone: tokyoTimezone,
        intervals: tokyoIntervals,
        instant,
      });

      expect(result.localTime?.date).toBe("2026-10-26");
      expect(result.localTime?.dayOfWeek).toBe(1);
      expect(result.localTime?.time).toBe("05:00");
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("OUTSIDE_WORKING_HOURS");
    });

    it("correctly handles daylight-saving time transitions (Spring Forward in US Eastern)", () => {
      const nyTimezone = "America/New_York";
      // US DST 2026 begins Sunday, March 8:
      // 06:59:00Z = 01:59:00 EST (UTC-5)
      // 07:00:00Z = 03:00:00 EDT (UTC-4, skipping the 2 AM hour)

      const dtfBefore = getLocalTimeDetails(
        new Date("2026-03-08T06:59:00.000Z"),
        nyTimezone,
      );
      expect(dtfBefore?.time).toBe("01:59");
      expect(dtfBefore?.dayOfWeek).toBe(0);

      const dtfAfter = getLocalTimeDetails(
        new Date("2026-03-08T07:00:00.000Z"),
        nyTimezone,
      );
      expect(dtfAfter?.time).toBe("03:00");
      expect(dtfAfter?.dayOfWeek).toBe(0);
    });

    it("correctly handles daylight-saving time transitions (Fall Back in US Eastern)", () => {
      const nyTimezone = "America/New_York";
      // US DST 2026 ends Sunday, November 1:
      // 05:59:00Z = 01:59:00 EDT (UTC-4)
      // 06:00:00Z = 01:00:00 EST (UTC-5, falling back to 1 AM)

      const dtfBefore = getLocalTimeDetails(
        new Date("2026-11-01T05:59:00.000Z"),
        nyTimezone,
      );
      expect(dtfBefore?.time).toBe("01:59");

      const dtfAfter = getLocalTimeDetails(
        new Date("2026-11-01T06:00:00.000Z"),
        nyTimezone,
      );
      expect(dtfAfter?.time).toBe("01:00");
    });
  });

  describe("Error Handling & Malformed Input Safety", () => {
    it("safely rejects invalid IANA timezone identifiers without silent fallback to UTC", () => {
      const result = evaluateOperatingHours({
        timezone: "Invalid/Fake_Zone",
        intervals: standardWeekIntervals,
        instant: new Date(),
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("INVALID_TIMEZONE");
      expect(result.message).toContain("Invalid/Fake_Zone");
    });

    it.each(["EST", "PST", "UTC+5:30", "GMT-4", ""])(
      "rejects non-standard or legacy timezone '%s'",
      (tz) => {
        const result = evaluateOperatingHours({
          timezone: tz,
          intervals: standardWeekIntervals,
          instant: new Date(),
        });

        expect(result.isOpen).toBe(false);
        expect(result.reason).toBe("INVALID_TIMEZONE");
      },
    );

    it("safely handles invalid Date instance", () => {
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        instant: new Date("not-a-valid-date"),
      });

      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("OUTSIDE_WORKING_HOURS");
      expect(result.message).toContain("Invalid evaluation instant Date");
    });

    it("filters and ignores malformed schedule intervals rather than throwing", () => {
      const malformedIntervals: unknown[] = [
        { dayOfWeek: -1, startTime: "09:00", endTime: "17:00" }, // invalid day
        { dayOfWeek: 1, startTime: "17:00", endTime: "09:00" }, // inverted times
        { dayOfWeek: 1, startTime: "bad-time", endTime: "17:00" }, // bad format
        null, // null entry
        { dayOfWeek: 1, startTime: "10:00", endTime: "16:00", isActive: true }, // valid entry!
      ];

      // Monday 12:00 IST
      const instant = new Date("2026-10-26T06:30:00.000Z");
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: malformedIntervals as unknown as ScheduleIntervalItem[],
        instant,
      });

      expect(result.isOpen).toBe(true);
      expect(result.activeInterval?.startTime).toBe("10:00");
      expect(result.activeInterval?.endTime).toBe("16:00");
    });

    it("filters and ignores malformed closure items", () => {
      const malformedClosures: unknown[] = [
        { startDate: "2026-02-30", endDate: "2026-02-30" }, // impossible date
        { startDate: "2026-12-25", endDate: "2026-12-20" }, // end < start
        null,
      ];

      // Monday 12:00 IST
      const instant = new Date("2026-10-26T06:30:00.000Z");
      const result = evaluateOperatingHours({
        timezone: defaultTimezone,
        intervals: standardWeekIntervals,
        closures: malformedClosures as unknown as ClosureItem[],
        instant,
      });

      // Malformed closures are ignored; valid schedule evaluates open
      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe("OPEN");
    });
  });

  describe("API Flexibility & Convenience Helpers", () => {
    it("supports positional parameters as well as options object", () => {
      const instant = new Date("2026-10-26T07:30:00.000Z"); // Mon 13:00 IST
      const result = evaluateOperatingHours(
        defaultTimezone,
        standardWeekIntervals,
        [],
        instant,
      );

      expect(result.isOpen).toBe(true);
      expect(result.reason).toBe("OPEN");
    });

    it("isOrganizationOpen returns boolean true/false", () => {
      const openInstant = new Date("2026-10-26T07:30:00.000Z"); // Mon 13:00 IST
      const closedInstant = new Date("2026-10-26T14:30:00.000Z"); // Mon 20:00 IST

      expect(
        isOrganizationOpen(
          defaultTimezone,
          standardWeekIntervals,
          [],
          openInstant,
        ),
      ).toBe(true);

      expect(
        isOrganizationOpen(
          defaultTimezone,
          standardWeekIntervals,
          [],
          closedInstant,
        ),
      ).toBe(false);
    });

    it("validates intervals and closures helper functions directly", () => {
      expect(
        isValidIntervalItem({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        }),
      ).toBe(true);
      expect(
        isValidIntervalItem({
          dayOfWeek: 7,
          startTime: "09:00",
          endTime: "17:00",
        }),
      ).toBe(false);
      expect(
        isValidIntervalItem({
          dayOfWeek: 1,
          startTime: "18:00",
          endTime: "17:00",
        }),
      ).toBe(false);

      expect(
        isValidClosureItem({
          startDate: "2026-12-25",
          endDate: "2026-12-25",
        }),
      ).toBe(true);
      expect(
        isValidClosureItem({
          startDate: "2026-02-30",
          endDate: "2026-02-30",
        }),
      ).toBe(false);
      expect(
        isValidClosureItem({
          startDate: "2026-12-26",
          endDate: "2026-12-25",
        }),
      ).toBe(false);
    });
  });

  describe("getContinuousOperatingBlocks", () => {
    it("returns empty array when no intervals are present for day", () => {
      expect(getContinuousOperatingBlocks([], 1)).toEqual([]);
    });

    it("returns single block for a single active interval", () => {
      const intervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true },
      ];
      expect(getContinuousOperatingBlocks(intervals, 1)).toEqual([
        {
          dayOfWeek: 1,
          startMinutes: 540,
          endMinutes: 1020,
          startTime: "09:00",
          endTime: "17:00",
        },
      ]);
    });

    it("merges consecutive active intervals that touch exactly (09:00-12:00 and 12:00-17:00)", () => {
      const intervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
        { dayOfWeek: 1, startTime: "12:00", endTime: "17:00", isActive: true },
      ];
      expect(getContinuousOperatingBlocks(intervals, 1)).toEqual([
        {
          dayOfWeek: 1,
          startMinutes: 540,
          endMinutes: 1020,
          startTime: "09:00",
          endTime: "17:00",
        },
      ]);
    });

    it("merges three consecutive touching intervals", () => {
      const intervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 2, startTime: "08:00", endTime: "10:00", isActive: true },
        { dayOfWeek: 2, startTime: "10:00", endTime: "13:00", isActive: true },
        { dayOfWeek: 2, startTime: "13:00", endTime: "18:00", isActive: true },
      ];
      expect(getContinuousOperatingBlocks(intervals, 2)).toEqual([
        {
          dayOfWeek: 2,
          startMinutes: 480,
          endMinutes: 1080,
          startTime: "08:00",
          endTime: "18:00",
        },
      ]);
    });

    it("keeps separate blocks when there is a genuine gap (09:00-12:00 and 13:00-17:00)", () => {
      const intervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
        { dayOfWeek: 1, startTime: "13:00", endTime: "17:00", isActive: true },
      ];
      expect(getContinuousOperatingBlocks(intervals, 1)).toEqual([
        {
          dayOfWeek: 1,
          startMinutes: 540,
          endMinutes: 720,
          startTime: "09:00",
          endTime: "12:00",
        },
        {
          dayOfWeek: 1,
          startMinutes: 780,
          endMinutes: 1020,
          startTime: "13:00",
          endTime: "17:00",
        },
      ]);
    });

    it("excludes inactive intervals from continuous blocks", () => {
      const intervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
        { dayOfWeek: 1, startTime: "12:00", endTime: "13:00", isActive: false },
        { dayOfWeek: 1, startTime: "13:00", endTime: "17:00", isActive: true },
      ];
      expect(getContinuousOperatingBlocks(intervals, 1)).toEqual([
        {
          dayOfWeek: 1,
          startMinutes: 540,
          endMinutes: 720,
          startTime: "09:00",
          endTime: "12:00",
        },
        {
          dayOfWeek: 1,
          startMinutes: 780,
          endMinutes: 1020,
          startTime: "13:00",
          endTime: "17:00",
        },
      ]);
    });

    it("defensively merges overlapping intervals", () => {
      const intervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:30", isActive: true },
        { dayOfWeek: 1, startTime: "12:00", endTime: "17:00", isActive: true },
      ];
      expect(getContinuousOperatingBlocks(intervals, 1)).toEqual([
        {
          dayOfWeek: 1,
          startMinutes: 540,
          endMinutes: 1020,
          startTime: "09:00",
          endTime: "17:00",
        },
      ]);
    });
  });

  describe("evaluateServiceAdmission", () => {
    const mondayIntervals: ScheduleIntervalItem[] = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true },
    ];

    it("admits customer when cutoff is null", () => {
      // Monday 16:55 IST (11:25 UTC)
      const instant = new Date("2026-10-26T11:25:00.000Z");
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: mondayIntervals,
        admissionCutoffMinutes: null,
        instant,
      });

      expect(result.isAdmitted).toBe(true);
      expect(result.reason).toBe("ADMITTED");
      expect(result.cutoffMinutes).toBe(0);
    });

    it("admits customer when cutoff is 0", () => {
      // Monday 16:59 IST (11:29 UTC)
      const instant = new Date("2026-10-26T11:29:00.000Z");
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: mondayIntervals,
        admissionCutoffMinutes: 0,
        instant,
      });

      expect(result.isAdmitted).toBe(true);
      expect(result.reason).toBe("ADMITTED");
      expect(result.cutoffMinutes).toBe(0);
    });

    it("admits customer just before the positive cutoff (e.g. 16:29 for 16:30 cutoff)", () => {
      // Monday 16:29 IST (10:59 UTC)
      const instant = new Date("2026-10-26T10:59:00.000Z");
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: mondayIntervals,
        admissionCutoffMinutes: 30, // cutoff at 16:30
        instant,
      });

      expect(result.isAdmitted).toBe(true);
      expect(result.reason).toBe("ADMITTED");
      expect(result.effectiveCutoffTime).toBe("16:30");
      expect(result.blockEndTime).toBe("17:00");
    });

    it("rejects admission at the exact cutoff boundary (16:30:00 for 16:30 cutoff)", () => {
      // Monday 16:30 IST (11:00 UTC)
      const instant = new Date("2026-10-26T11:00:00.000Z");
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: mondayIntervals,
        admissionCutoffMinutes: 30,
        instant,
      });

      expect(result.isAdmitted).toBe(false);
      expect(result.reason).toBe("ADMISSION_CUTOFF_REACHED");
      expect(result.code).toBe("ADMISSION_CUTOFF_REACHED");
      expect(result.effectiveCutoffTime).toBe("16:30");
      expect(result.blockEndTime).toBe("17:00");
      expect(result.message).toContain("Admission cutoff reached for this service");
    });

    it("rejects admission just after the cutoff (16:31 for 16:30 cutoff)", () => {
      // Monday 16:31 IST (11:01 UTC)
      const instant = new Date("2026-10-26T11:01:00.000Z");
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: mondayIntervals,
        admissionCutoffMinutes: 30,
        instant,
      });

      expect(result.isAdmitted).toBe(false);
      expect(result.reason).toBe("ADMISSION_CUTOFF_REACHED");
    });

    it("rejects admission throughout interval when cutoff equals interval duration", () => {
      const shortInterval: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "09:30", isActive: true },
      ];
      // Monday 09:00 IST (03:30 UTC)
      const instant = new Date("2026-10-26T03:30:00.000Z");
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: shortInterval,
        admissionCutoffMinutes: 30, // 30 min duration, 30 min cutoff -> cutoff at 09:00
        instant,
      });

      expect(result.isAdmitted).toBe(false);
      expect(result.reason).toBe("ADMISSION_CUTOFF_REACHED");
    });

    it("rejects admission throughout interval when cutoff is longer than interval duration", () => {
      const shortInterval: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "09:30", isActive: true },
      ];
      // Monday 09:05 IST (03:35 UTC)
      const instant = new Date("2026-10-26T03:35:00.000Z");
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: shortInterval,
        admissionCutoffMinutes: 45,
        instant,
      });

      expect(result.isAdmitted).toBe(false);
      expect(result.reason).toBe("ADMISSION_CUTOFF_REACHED");
    });

    it("handles consecutive touching intervals as one continuous block (09:00-12:00, 12:00-17:00, cutoff 30m)", () => {
      const touchingIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
        { dayOfWeek: 1, startTime: "12:00", endTime: "17:00", isActive: true },
      ];

      // Monday 11:45 IST (06:15 UTC): Should be admitted because continuous block ends at 17:00 (cutoff 16:30)
      const instant1 = new Date("2026-10-26T06:15:00.000Z");
      const result1 = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: touchingIntervals,
        admissionCutoffMinutes: 30,
        instant: instant1,
      });
      expect(result1.isAdmitted).toBe(true);
      expect(result1.effectiveCutoffTime).toBe("16:30");
      expect(result1.blockEndTime).toBe("17:00");

      // Monday 16:30 IST (11:00 UTC): Cutoff reached for the 17:00 block end
      const instant2 = new Date("2026-10-26T11:00:00.000Z");
      const result2 = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: touchingIntervals,
        admissionCutoffMinutes: 30,
        instant: instant2,
      });
      expect(result2.isAdmitted).toBe(false);
      expect(result2.reason).toBe("ADMISSION_CUTOFF_REACHED");
    });

    it("applies cutoff to each separate operating block when there is a real break (09:00-12:00, 13:00-17:00)", () => {
      const splitIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", isActive: true },
        { dayOfWeek: 1, startTime: "13:00", endTime: "17:00", isActive: true },
      ];

      // Morning block cutoff is 11:30
      // 11:29 IST: Admitted
      const instantMorningBefore = new Date("2026-10-26T05:59:00.000Z");
      const resultMorningBefore = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: splitIntervals,
        admissionCutoffMinutes: 30,
        instant: instantMorningBefore,
      });
      expect(resultMorningBefore.isAdmitted).toBe(true);
      expect(resultMorningBefore.effectiveCutoffTime).toBe("11:30");

      // 11:30 IST: Morning cutoff reached
      const instantMorningAt = new Date("2026-10-26T06:00:00.000Z");
      const resultMorningAt = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: splitIntervals,
        admissionCutoffMinutes: 30,
        instant: instantMorningAt,
      });
      expect(resultMorningAt.isAdmitted).toBe(false);
      expect(resultMorningAt.reason).toBe("ADMISSION_CUTOFF_REACHED");
      expect(resultMorningAt.effectiveCutoffTime).toBe("11:30");
      expect(resultMorningAt.blockEndTime).toBe("12:00");

      // 13:00 IST: Afternoon block opens, admitted
      const instantAfternoonOpen = new Date("2026-10-26T07:30:00.000Z");
      const resultAfternoonOpen = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: splitIntervals,
        admissionCutoffMinutes: 30,
        instant: instantAfternoonOpen,
      });
      expect(resultAfternoonOpen.isAdmitted).toBe(true);
      expect(resultAfternoonOpen.effectiveCutoffTime).toBe("16:30");
      expect(resultAfternoonOpen.blockEndTime).toBe("17:00");
    });

    it("preserves exceptional closure precedence over cutoff", () => {
      const closure: ClosureItem = {
        startDate: "2026-10-26",
        endDate: "2026-10-26",
        reason: "Diwali Holiday",
      };
      // Monday 10:00 IST during normal hours
      const instant = new Date("2026-10-26T04:30:00.000Z");
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: mondayIntervals,
        closures: [closure],
        admissionCutoffMinutes: 30,
        instant,
      });

      expect(result.isAdmitted).toBe(false);
      expect(result.reason).toBe("ORGANIZATION_CLOSED");
      expect(result.message).toContain("Diwali Holiday");
    });

    it("evaluates cutoff using non-Asia/Kolkata timezone (America/New_York)", () => {
      const nyTimezone = "America/New_York";
      // Monday 09:00 - 17:00 EDT (UTC-4)
      // 16:30 EDT = 20:30 UTC
      // 16:29 EDT = 20:29 UTC
      const nyIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isActive: true },
      ];

      const beforeCutoff = new Date("2026-10-26T20:29:00.000Z"); // 16:29 NY time
      const resultBefore = evaluateServiceAdmission({
        timezone: nyTimezone,
        intervals: nyIntervals,
        admissionCutoffMinutes: 30,
        instant: beforeCutoff,
      });
      expect(resultBefore.isAdmitted).toBe(true);

      const atCutoff = new Date("2026-10-26T20:30:00.000Z"); // 16:30 NY time
      const resultAt = evaluateServiceAdmission({
        timezone: nyTimezone,
        intervals: nyIntervals,
        admissionCutoffMinutes: 30,
        instant: atCutoff,
      });
      expect(resultAt.isAdmitted).toBe(false);
      expect(resultAt.reason).toBe("ADMISSION_CUTOFF_REACHED");
    });

    it("rejects admission safely when timezone is invalid", () => {
      const result = evaluateServiceAdmission({
        timezone: "Invalid/Fake_Timezone",
        intervals: mondayIntervals,
        admissionCutoffMinutes: 30,
      });

      expect(result.isAdmitted).toBe(false);
      expect(result.code).toBe("INVALID_SCHEDULE_CONFIGURATION");
      expect(result.reason).toBe("INVALID_TIMEZONE");
    });

    it("rejects admission safely when schedule interval is corrupted", () => {
      const corruptIntervals: ScheduleIntervalItem[] = [
        { dayOfWeek: 1, startTime: "99:99", endTime: "17:00", isActive: true },
      ];
      const result = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: corruptIntervals,
        admissionCutoffMinutes: 30,
      });

      expect(result.isAdmitted).toBe(false);
      expect(result.code).toBe("INVALID_SCHEDULE_CONFIGURATION");
      expect(result.reason).toBe("INVALID_SCHEDULE_DATA");
    });

    it("rejects admission safely when admissionCutoffMinutes is invalid (negative or > 480)", () => {
      const resultNegative = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: mondayIntervals,
        admissionCutoffMinutes: -10,
      });
      expect(resultNegative.isAdmitted).toBe(false);
      expect(resultNegative.code).toBe("INVALID_SCHEDULE_CONFIGURATION");

      const resultOver = evaluateServiceAdmission({
        timezone: defaultTimezone,
        intervals: mondayIntervals,
        admissionCutoffMinutes: 500,
      });
      expect(resultOver.isAdmitted).toBe(false);
      expect(resultOver.code).toBe("INVALID_SCHEDULE_CONFIGURATION");
    });
  });
});
