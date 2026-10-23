import {
  isValidIanaTimezone,
  timeToMinutes,
  isValidCalendarDateString,
  ScheduleIntervalItem,
} from "@/lib/validations/schedule";

export interface ClosureItem {
  id?: string;
  organizationId?: string;
  startDate: string; // "YYYY-MM-DD" local calendar date
  endDate: string; // "YYYY-MM-DD" local calendar date
  reason?: string | null;
}

export type OperatingHoursReasonCode =
  | "OPEN"
  | "ORGANIZATION_CLOSED"
  | "NO_ACTIVE_SCHEDULE"
  | "OUTSIDE_WORKING_HOURS"
  | "INVALID_TIMEZONE";

export interface LocalTimeDetails {
  date: string; // "YYYY-MM-DD" local calendar date
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  time: string; // "HH:mm" 24-hour local time
  minutes: number; // Total minutes since midnight (0 - 1439)
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface OperatingHoursEvaluationResult {
  isOpen: boolean;
  reason: OperatingHoursReasonCode;
  localTime?: {
    date: string;
    dayOfWeek: number;
    time: string;
    minutes: number;
  };
  activeInterval?: ScheduleIntervalItem;
  activeClosure?: ClosureItem;
  message: string;
}

export interface EvaluateOperatingHoursInput {
  timezone: string;
  intervals?: ScheduleIntervalItem[];
  closures?: ClosureItem[];
  instant?: Date;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * Validates whether a ScheduleIntervalItem has valid structure, bounds, and ordering.
 * Malformed intervals (e.g. invalid dayOfWeek, invalid time format, or startTime >= endTime)
 * are rejected to protect against corrupted database records.
 */
export function isValidIntervalItem(
  interval: ScheduleIntervalItem | null | undefined,
): interval is ScheduleIntervalItem {
  if (!interval || typeof interval !== "object") return false;
  if (
    typeof interval.dayOfWeek !== "number" ||
    !Number.isInteger(interval.dayOfWeek) ||
    interval.dayOfWeek < 0 ||
    interval.dayOfWeek > 6
  ) {
    return false;
  }
  if (!interval.startTime || !interval.endTime) return false;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.startTime)) return false;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(interval.endTime)) return false;
  if (timeToMinutes(interval.startTime) >= timeToMinutes(interval.endTime)) {
    return false;
  }
  return true;
}

/**
 * Validates whether a ClosureItem has valid calendar date strings and ordering.
 * Malformed closures (e.g. impossible dates or endDate < startDate) are rejected.
 */
export function isValidClosureItem(
  closure: ClosureItem | null | undefined,
): closure is ClosureItem {
  if (!closure || typeof closure !== "object") return false;
  if (!closure.startDate || !closure.endDate) return false;
  if (!isValidCalendarDateString(closure.startDate)) return false;
  if (!isValidCalendarDateString(closure.endDate)) return false;
  if (closure.endDate < closure.startDate) return false;
  return true;
}

/**
 * Derives the local calendar date, day of week (Sunday=0), and 24-hour time
 * for a given instant in the specified IANA timezone using native Intl APIs.
 *
 * @param instant - An explicit Date representing the instant to evaluate.
 * @param timezone - A valid IANA timezone string.
 * @returns LocalTimeDetails or null if timezone or instant is invalid.
 */
export function getLocalTimeDetails(
  instant: Date,
  timezone: string,
): LocalTimeDetails | null {
  if (!isValidIanaTimezone(timezone)) {
    return null;
  }

  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    return null;
  }

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(instant).map((p) => [p.type, p.value]),
  );

  const dayOfWeek = WEEKDAY_MAP[parts.weekday];
  if (dayOfWeek === undefined) {
    return null;
  }

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  // Normalize hour 24 if returned by some environments for midnight
  const hourNum = parts.hour === "24" ? 0 : Number(parts.hour);
  const minuteNum = Number(parts.minute);

  const hourStr = hourNum.toString().padStart(2, "0");
  const minuteStr = minuteNum.toString().padStart(2, "0");
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const timeStr = `${hourStr}:${minuteStr}`;
  const minutes = hourNum * 60 + minuteNum;

  return {
    date: dateStr,
    dayOfWeek,
    time: timeStr,
    minutes,
    year,
    month,
    day,
    hour: hourNum,
    minute: minuteNum,
  };
}

/**
 * Deterministically evaluates whether an organization is open at a given instant.
 *
 * Rules:
 * 1. Checks and respects the organization's IANA timezone; rejects invalid timezones safely.
 * 2. An exceptional closure matching the local calendar date (inclusive of startDate and endDate)
 *    takes precedence over any weekly opening hours.
 * 3. Schedule intervals are evaluated against the local dayOfWeek (0 = Sunday ... 6 = Saturday).
 * 4. Only active intervals (isActive !== false) can open an organization.
 * 5. Intervals are start-inclusive and end-exclusive (e.g. 09:00-12:00 is open at 09:00, closed at 12:00).
 * 6. Multiple intervals on a single day (including touching boundaries like 09:00-12:00 and 12:00-16:00)
 *    are fully supported.
 * 7. Days without active intervals return NO_ACTIVE_SCHEDULE.
 * 8. Outside operating hours returns OUTSIDE_WORKING_HOURS.
 * 9. Malformed intervals or closures are safely ignored.
 *
 * This function is pure and does not query the database.
 */
export function evaluateOperatingHours(
  input: EvaluateOperatingHoursInput,
): OperatingHoursEvaluationResult;
export function evaluateOperatingHours(
  timezone: string,
  intervals?: ScheduleIntervalItem[],
  closures?: ClosureItem[],
  instant?: Date,
): OperatingHoursEvaluationResult;
export function evaluateOperatingHours(
  first: string | EvaluateOperatingHoursInput,
  second: ScheduleIntervalItem[] = [],
  third: ClosureItem[] = [],
  fourth: Date = new Date(),
): OperatingHoursEvaluationResult {
  let timezone: string;
  let intervals: ScheduleIntervalItem[];
  let closures: ClosureItem[];
  let instant: Date;

  if (typeof first === "object" && first !== null) {
    timezone = first.timezone;
    intervals = first.intervals ?? [];
    closures = first.closures ?? [];
    instant = first.instant ?? new Date();
  } else {
    timezone = first;
    intervals = second;
    closures = third;
    instant = fourth;
  }

  // 1. Validate timezone
  if (!isValidIanaTimezone(timezone)) {
    return {
      isOpen: false,
      reason: "INVALID_TIMEZONE",
      message: `Invalid IANA timezone identifier: "${timezone}"`,
    };
  }

  // 2. Validate instant Date
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    return {
      isOpen: false,
      reason: "OUTSIDE_WORKING_HOURS",
      message: "Invalid evaluation instant Date",
    };
  }

  // 3. Derive local time details in organization's timezone
  const localDetails = getLocalTimeDetails(instant, timezone);
  if (!localDetails) {
    return {
      isOpen: false,
      reason: "INVALID_TIMEZONE",
      message: `Failed to evaluate local time for timezone: "${timezone}"`,
    };
  }

  const localTime = {
    date: localDetails.date,
    dayOfWeek: localDetails.dayOfWeek,
    time: localDetails.time,
    minutes: localDetails.minutes,
  };

  // 4. Check exceptional closures (closures take precedence over weekly schedule)
  const validClosures = closures.filter(isValidClosureItem);
  const matchingClosure = validClosures.find((closure) => {
    return (
      localTime.date >= closure.startDate && localTime.date <= closure.endDate
    );
  });

  if (matchingClosure) {
    return {
      isOpen: false,
      reason: "ORGANIZATION_CLOSED",
      localTime,
      activeClosure: matchingClosure,
      message: matchingClosure.reason
        ? `Organization is closed: ${matchingClosure.reason}`
        : `Organization is closed for scheduled closure (${matchingClosure.startDate} to ${matchingClosure.endDate})`,
    };
  }

  // 5. Evaluate weekly schedule intervals for the local day of week
  const validIntervals = intervals.filter(isValidIntervalItem);
  const activeIntervalsToday = validIntervals.filter(
    (interval) =>
      interval.isActive !== false && interval.dayOfWeek === localTime.dayOfWeek,
  );

  if (activeIntervalsToday.length === 0) {
    return {
      isOpen: false,
      reason: "NO_ACTIVE_SCHEDULE",
      localTime,
      message: `No active schedule intervals configured for ${DAY_NAMES[localTime.dayOfWeek]}`,
    };
  }

  // 6. Check if current local time falls into any active interval (start-inclusive, end-exclusive)
  const matchingInterval = activeIntervalsToday.find((interval) => {
    const startMinutes = timeToMinutes(interval.startTime);
    const endMinutes = timeToMinutes(interval.endTime);
    return localTime.minutes >= startMinutes && localTime.minutes < endMinutes;
  });

  if (matchingInterval) {
    return {
      isOpen: true,
      reason: "OPEN",
      localTime,
      activeInterval: matchingInterval,
      message: `Organization is open (scheduled ${matchingInterval.startTime} - ${matchingInterval.endTime})`,
    };
  }

  // 7. Otherwise, outside working hours on a day that has active intervals
  return {
    isOpen: false,
    reason: "OUTSIDE_WORKING_HOURS",
    localTime,
    message: "Current time is outside organization working hours",
  };
}

/**
 * Convenience helper returning boolean open status.
 */
export function isOrganizationOpen(
  timezone: string,
  intervals: ScheduleIntervalItem[] = [],
  closures: ClosureItem[] = [],
  instant: Date = new Date(),
): boolean {
  return evaluateOperatingHours(timezone, intervals, closures, instant).isOpen;
}
