import { z } from "zod";

/**
 * Validates whether a given string is a recognized, valid IANA timezone identifier.
 * Requires standard Area/Location format (e.g. "Asia/Kolkata", "America/New_York")
 * or canonical "UTC".
 * Rejects legacy abbreviations ("EST", "PST"), fixed offsets ("UTC+5", "GMT-4"),
 * and non-existent zones.
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (typeof tz !== "string" || !tz.trim()) return false;
  const trimmed = tz.trim();

  // Standard IANA identifiers are structured as Area/Location (e.g. Asia/Kolkata) or "UTC"
  if (trimmed !== "UTC" && !trimmed.includes("/")) {
    return false;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Zod schema for validating standard IANA timezone strings (e.g. "Asia/Kolkata", "America/New_York").
 */
export const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .refine(isValidIanaTimezone, {
    message: "Invalid IANA timezone identifier",
  });

/**
 * Converts a 24-hour "HH:mm" time string into total minutes since midnight (0 - 1439).
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Converts total minutes since midnight into a 24-hour "HH:mm" time string.
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Validates 24-hour "HH:mm" time format (00:00 through 23:59).
 */
export const timeStringSchema = z
  .string()
  .trim()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
    message: "Time must be in 24-hour HH:mm format",
  });

/**
 * Day of week schema (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
 */
export const dayOfWeekSchema = z
  .number()
  .int({ message: "Day of week must be an integer" })
  .min(0, { message: "Day of week must be between 0 (Sunday) and 6 (Saturday)" })
  .max(6, { message: "Day of week must be between 0 (Sunday) and 6 (Saturday)" });

/**
 * Checks whether two half-open intervals [startA, endA) and [startB, endB) overlap.
 * Touching boundaries (e.g. [09:00, 13:00) and [13:00, 17:00)) do NOT overlap.
 */
export function doIntervalsOverlap(
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
): boolean {
  const startA = timeToMinutes(a.startTime);
  const endA = timeToMinutes(a.endTime);
  const startB = timeToMinutes(b.startTime);
  const endB = timeToMinutes(b.endTime);
  return Math.max(startA, startB) < Math.min(endA, endB);
}

export interface ScheduleIntervalItem {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

/**
 * Validates an array of schedule intervals to verify that active intervals on the
 * same day do not overlap.
 */
export function validateNoOverlappingIntervals(
  intervals: ScheduleIntervalItem[],
): {
  isValid: boolean;
  conflict?: {
    first: ScheduleIntervalItem;
    second: ScheduleIntervalItem;
  };
} {
  const activeIntervals = intervals.filter((i) => i.isActive !== false);

  for (let i = 0; i < activeIntervals.length; i++) {
    for (let j = i + 1; j < activeIntervals.length; j++) {
      const a = activeIntervals[i];
      const b = activeIntervals[j];

      if (a.dayOfWeek === b.dayOfWeek && doIntervalsOverlap(a, b)) {
        return {
          isValid: false,
          conflict: { first: a, second: b },
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Schema for creating an OrganizationScheduleInterval.
 */
export const createScheduleIntervalSchema = z
  .object({
    organizationId: z.string().trim().min(1, "Organization ID is required").optional(),
    dayOfWeek: dayOfWeekSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    (data) => timeToMinutes(data.startTime) < timeToMinutes(data.endTime),
    {
      message: "startTime must be earlier than endTime",
      path: ["endTime"],
    },
  );

export type CreateScheduleIntervalInput = z.infer<
  typeof createScheduleIntervalSchema
>;

/**
 * Schema for updating an OrganizationScheduleInterval.
 */
export const updateScheduleIntervalSchema = z
  .object({
    dayOfWeek: dayOfWeekSchema.optional(),
    startTime: timeStringSchema.optional(),
    endTime: timeStringSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return timeToMinutes(data.startTime) < timeToMinutes(data.endTime);
      }
      return true;
    },
    {
      message: "startTime must be earlier than endTime",
      path: ["endTime"],
    },
  );

export type UpdateScheduleIntervalInput = z.infer<
  typeof updateScheduleIntervalSchema
>;

/**
 * Verifies whether a "YYYY-MM-DD" string represents a real date on the calendar
 * (e.g. rejects impossible dates like "2026-02-30" or "2026-04-31").
 */
export function isValidCalendarDateString(dateStr: string): boolean {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(dateStr)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Schema for validating "YYYY-MM-DD" closure date strings.
 */
export const closureDateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, {
    message: "Date must be in YYYY-MM-DD format",
  })
  .refine(isValidCalendarDateString, {
    message: "Date does not exist on the calendar",
  });

/**
 * Schema for creating an OrganizationClosure.
 * Supports single-day (startDate === endDate) or multi-day range (endDate >= startDate).
 */
export const createClosureSchema = z
  .object({
    organizationId: z.string().trim().min(1, "Organization ID is required").optional(),
    startDate: closureDateStringSchema,
    endDate: closureDateStringSchema,
    reason: z
      .string()
      .trim()
      .max(255, "Reason must be 255 characters or fewer")
      .optional()
      .nullable(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "endDate must be greater than or equal to startDate",
    path: ["endDate"],
  });

export type CreateClosureInput = z.infer<typeof createClosureSchema>;

/**
 * Schema for updating an OrganizationClosure.
 */
export const updateClosureSchema = z
  .object({
    startDate: closureDateStringSchema.optional(),
    endDate: closureDateStringSchema.optional(),
    reason: z
      .string()
      .trim()
      .max(255, "Reason must be 255 characters or fewer")
      .optional()
      .nullable(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate >= data.startDate;
      }
      return true;
    },
    {
      message: "endDate must be greater than or equal to startDate",
      path: ["endDate"],
    },
  );

export type UpdateClosureInput = z.infer<typeof updateClosureSchema>;
