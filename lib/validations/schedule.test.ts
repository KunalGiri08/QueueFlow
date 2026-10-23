import { describe, it, expect } from "vitest";
import {
  ianaTimezoneSchema,
  isValidIanaTimezone,
  timeToMinutes,
  minutesToTime,
  timeStringSchema,
  dayOfWeekSchema,
  doIntervalsOverlap,
  validateNoOverlappingIntervals,
  createScheduleIntervalSchema,
  updateScheduleIntervalSchema,
  isValidCalendarDateString,
  closureDateStringSchema,
  createClosureSchema,
  updateClosureSchema,
} from "./schedule";

describe("IANA Timezone Validation", () => {
  it.each([
    "Asia/Kolkata",
    "America/New_York",
    "Europe/London",
    "UTC",
    "Asia/Tokyo",
    "Australia/Sydney",
    "America/Los_Angeles",
  ])("accepts valid IANA timezone identifier (%s)", (tz) => {
    expect(isValidIanaTimezone(tz)).toBe(true);
    const parsed = ianaTimezoneSchema.safeParse(tz);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe(tz);
    }
  });

  it.each([
    "Invalid/Timezone",
    "UTC+5:30",
    "GMT-4",
    "PST",
    "EST",
    "",
    "   ",
    "RandomZone/Here",
    "12345",
  ])("rejects invalid or non-standard timezone identifier (%s)", (tz) => {
    expect(isValidIanaTimezone(tz)).toBe(false);
    const parsed = ianaTimezoneSchema.safeParse(tz);
    expect(parsed.success).toBe(false);
  });
});

describe("Time String Validation & Conversion", () => {
  it("converts 24-hour HH:mm to minutes and back", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("12:00")).toBe(720);
    expect(timeToMinutes("17:45")).toBe(1065);
    expect(timeToMinutes("23:59")).toBe(1439);

    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(1065)).toBe("17:45");
    expect(minutesToTime(1439)).toBe("23:59");
  });

  it.each(["00:00", "08:30", "09:00", "13:15", "17:00", "23:59"])(
    "accepts valid 24-hour time string (%s)",
    (time) => {
      expect(timeStringSchema.safeParse(time).success).toBe(true);
    },
  );

  it.each([
    "24:00",
    "09:60",
    "9:00",
    "12:5",
    "25:00",
    "-01:00",
    "noon",
    "12:00 PM",
    "",
  ])("rejects invalid time string (%s)", (time) => {
    expect(timeStringSchema.safeParse(time).success).toBe(false);
  });
});

describe("Day of Week Validation", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])("accepts valid day of week integer (%i)", (day) => {
    expect(dayOfWeekSchema.safeParse(day).success).toBe(true);
  });

  it.each([-1, 7, 10, 1.5, "0", "Monday", null, undefined])(
    "rejects invalid day of week (%s)",
    (day) => {
      expect(dayOfWeekSchema.safeParse(day).success).toBe(false);
    },
  );
});

describe("Schedule Interval Overlap Detection", () => {
  it("detects non-overlapping intervals (split shifts / lunch breaks)", () => {
    const morning = { startTime: "09:00", endTime: "13:00" };
    const afternoon = { startTime: "14:00", endTime: "18:00" };
    expect(doIntervalsOverlap(morning, afternoon)).toBe(false);
  });

  it("permits touching boundary intervals without conflict", () => {
    const shift1 = { startTime: "08:00", endTime: "12:00" };
    const shift2 = { startTime: "12:00", endTime: "16:00" };
    expect(doIntervalsOverlap(shift1, shift2)).toBe(false);
  });

  it("detects overlapping intervals", () => {
    const a = { startTime: "09:00", endTime: "14:00" };
    const b = { startTime: "13:00", endTime: "17:00" };
    expect(doIntervalsOverlap(a, b)).toBe(true);

    const nestedA = { startTime: "08:00", endTime: "18:00" };
    const nestedB = { startTime: "10:00", endTime: "12:00" };
    expect(doIntervalsOverlap(nestedA, nestedB)).toBe(true);
  });

  it("validates a batch of intervals and identifies conflicts on the same day", () => {
    const validIntervals = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00", isActive: true },
      { dayOfWeek: 1, startTime: "14:00", endTime: "18:00", isActive: true },
      { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", isActive: true },
    ];
    expect(validateNoOverlappingIntervals(validIntervals).isValid).toBe(true);

    const conflictingIntervals = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00", isActive: true },
      { dayOfWeek: 1, startTime: "12:30", endTime: "17:00", isActive: true },
    ];
    const validation = validateNoOverlappingIntervals(conflictingIntervals);
    expect(validation.isValid).toBe(false);
    expect(validation.conflict).toBeDefined();

    // Inactive intervals do not trigger conflicts
    const withInactive = [
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00", isActive: true },
      { dayOfWeek: 1, startTime: "12:30", endTime: "17:00", isActive: false },
    ];
    expect(validateNoOverlappingIntervals(withInactive).isValid).toBe(true);
  });
});

describe("Schedule Interval Schemas", () => {
  it("accepts valid create interval input", () => {
    const result = createScheduleIntervalSchema.safeParse({
      organizationId: "org-1",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "17:00",
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when startTime is greater than or equal to endTime", () => {
    const greater = createScheduleIntervalSchema.safeParse({
      dayOfWeek: 1,
      startTime: "17:00",
      endTime: "09:00",
    });
    expect(greater.success).toBe(false);

    const equal = createScheduleIntervalSchema.safeParse({
      dayOfWeek: 1,
      startTime: "12:00",
      endTime: "12:00",
    });
    expect(equal.success).toBe(false);
  });

  it("validates update interval input", () => {
    expect(
      updateScheduleIntervalSchema.safeParse({
        startTime: "10:00",
        endTime: "18:00",
      }).success,
    ).toBe(true);

    expect(
      updateScheduleIntervalSchema.safeParse({
        startTime: "18:00",
        endTime: "10:00",
      }).success,
    ).toBe(false);
  });
});

describe("Closure Date & Schema Validation", () => {
  it("verifies real calendar dates and rejects impossible dates", () => {
    expect(isValidCalendarDateString("2026-10-23")).toBe(true);
    expect(isValidCalendarDateString("2026-12-31")).toBe(true);
    expect(isValidCalendarDateString("2026-02-28")).toBe(true);
    expect(isValidCalendarDateString("2024-02-29")).toBe(true); // leap year

    // Impossible dates
    expect(isValidCalendarDateString("2026-02-29")).toBe(false); // non-leap year Feb 29
    expect(isValidCalendarDateString("2026-02-30")).toBe(false);
    expect(isValidCalendarDateString("2026-04-31")).toBe(false); // April has 30 days
    expect(isValidCalendarDateString("2026-13-01")).toBe(false); // invalid month
    expect(isValidCalendarDateString("invalid")).toBe(false);
  });

  it("accepts valid single-day closure (startDate === endDate)", () => {
    const result = createClosureSchema.safeParse({
      organizationId: "org-1",
      startDate: "2026-12-25",
      endDate: "2026-12-25",
      reason: "Christmas Day",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid multi-day date range (endDate > startDate)", () => {
    const result = createClosureSchema.safeParse({
      startDate: "2026-12-24",
      endDate: "2026-12-26",
      reason: "Winter Holiday Break",
    });
    expect(result.success).toBe(true);
  });

  it("rejects closure when endDate is earlier than startDate", () => {
    const result = createClosureSchema.safeParse({
      startDate: "2026-12-26",
      endDate: "2026-12-24",
    });
    expect(result.success).toBe(false);
  });

  it("validates update closure input", () => {
    expect(
      updateClosureSchema.safeParse({
        startDate: "2026-11-01",
        endDate: "2026-11-05",
      }).success,
    ).toBe(true);

    expect(
      updateClosureSchema.safeParse({
        startDate: "2026-11-05",
        endDate: "2026-11-01",
      }).success,
    ).toBe(false);
  });
});
