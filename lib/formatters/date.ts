/**
 * Shared date and time formatting utilities for QueueFlow.
 * Pure functions supporting browser and Node environments.
 */

export interface DateFormatOptions {
  locale?: string;
  timeZone?: string;
}

/**
 * Formats an ISO timestamp or date string into a user-friendly date and time.
 * Equivalent to existing formatTicketDate and formatTimestamp: "Oct 18, 2026, 11:15 PM"
 *
 * If the input is invalid or fails to parse, returns the original string (or empty string if empty).
 */
export function formatDateTime(
  isoString: string | null | undefined,
  options: DateFormatOptions = {},
): string {
  if (!isoString) return "";

  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }

    return new Intl.DateTimeFormat(options.locale || "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
  } catch {
    return isoString;
  }
}

/**
 * Formats a date string into a short localized date (e.g. "Oct 18, 2026").
 *
 * If the input is invalid or empty, returns the fallback string (default: original input or "").
 */
export function formatDate(
  dateString: string | null | undefined,
  options: DateFormatOptions = {},
  fallback = "",
): string {
  if (!dateString) return fallback;

  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
      return fallback || dateString;
    }

    return new Intl.DateTimeFormat(options.locale || "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);
  } catch {
    return fallback || dateString;
  }
}

/**
 * Formats an entity creation date (counters, services) for card footers.
 * Preserves existing formatCounterDate behavior:
 * - Valid date: "Created Oct 18, 2026"
 * - Invalid/empty date: "Created recently"
 */
export function formatCreationDate(
  dateString: string | null | undefined,
  options: DateFormatOptions = {},
): string {
  if (!dateString) return "Created recently";

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Created recently";
  }

  try {
    const formattedDate = new Intl.DateTimeFormat(options.locale || "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    }).format(date);

    return `Created ${formattedDate}`;
  } catch {
    return "Created recently";
  }
}

export interface ZonedTimeDetails {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dateStr: string;
  timeStr: string;
}

/**
 * Derives year, month, day, hour, and minute for a given instant in an IANA timezone
 * using native Intl APIs without external dependencies.
 */
export function getZonedTimeDetails(
  instant: Date,
  timeZone: string,
): ZonedTimeDetails | null {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(
      dtf.formatToParts(instant).map((p) => [p.type, p.value]),
    );
    const hourNum = parts.hour === "24" ? 0 : Number(parts.hour);
    const minuteNum = Number(parts.minute);
    const hourStr = hourNum.toString().padStart(2, "0");
    const minuteStr = minuteNum.toString().padStart(2, "0");
    const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
    const timeStr = `${hourStr}:${minuteStr}`;
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: hourNum,
      minute: minuteNum,
      dateStr,
      timeStr,
    };
  } catch {
    return null;
  }
}

/**
 * Formats a Date instant into an HTML datetime-local compatible string ("YYYY-MM-DDTHH:mm")
 * in the specified IANA timezone.
 */
export function toZonedDatetimeString(date: Date, timeZone: string): string {
  const details = getZonedTimeDetails(date, timeZone);
  if (!details) {
    const pad = (num: number) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${details.dateStr}T${details.timeStr}`;
}

/**
 * Converts a facility-local datetime-local string ("YYYY-MM-DDTHH:mm") in a specific
 * IANA timezone into a UTC Date instant.
 * Rejects nonexistent local times (e.g. DST spring-forward gap) and ambiguous local times
 * (e.g. DST fall-back overlap) by ensuring exactly one UTC instant maps to the requested local time.
 */
export function zonedDatetimeToUtc(
  datetimeLocalStr: string,
  timeZone: string,
): Date | null {
  if (!datetimeLocalStr || typeof datetimeLocalStr !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
    datetimeLocalStr.trim(),
  );
  if (!match) return null;
  const [, yStr, mStr, dStr, hrStr, minStr] = match;
  const targetYear = Number(yStr);
  const targetMonth = Number(mStr);
  const targetDay = Number(dStr);
  const targetHour = Number(hrStr);
  const targetMinute = Number(minStr);

  if (
    targetMonth < 1 ||
    targetMonth > 12 ||
    targetDay < 1 ||
    targetDay > 31 ||
    targetHour < 0 ||
    targetHour > 23 ||
    targetMinute < 0 ||
    targetMinute > 59
  ) {
    return null;
  }

  // Pre-validate that timeZone is a valid IANA timezone string
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return null;
  }

  const targetMs = Date.UTC(
    targetYear,
    targetMonth - 1,
    targetDay,
    targetHour,
    targetMinute,
  );

  // Sample offsets around targetMs across a 56-hour window to catch any transition
  const sampleOffsetsHours = [
    -28, -24, -18, -12, -6, -3, -1, 0, 1, 3, 6, 12, 18, 24, 28,
  ];
  const candidateOffsets = new Set<number>();

  for (const hourOffset of sampleOffsetsHours) {
    const sampleInstant = new Date(targetMs + hourOffset * 3600000);
    const loc = getZonedTimeDetails(sampleInstant, timeZone);
    if (loc) {
      const locMs = Date.UTC(
        loc.year,
        loc.month - 1,
        loc.day,
        loc.hour,
        loc.minute,
      );
      candidateOffsets.add(locMs - sampleInstant.getTime());
    }
  }

  // Also include offsets evaluated at candidate UTC instants
  for (const offset of Array.from(candidateOffsets)) {
    const candidateInstant = new Date(targetMs - offset);
    const loc = getZonedTimeDetails(candidateInstant, timeZone);
    if (loc) {
      const locMs = Date.UTC(
        loc.year,
        loc.month - 1,
        loc.day,
        loc.hour,
        loc.minute,
      );
      candidateOffsets.add(locMs - candidateInstant.getTime());
    }
  }

  // Find all distinct candidate UTC instants that map exactly to the target local wall-clock
  const matchingInstants = new Set<number>();

  for (const offset of candidateOffsets) {
    const candidateUtcMs = targetMs - offset;
    const loc = getZonedTimeDetails(new Date(candidateUtcMs), timeZone);
    if (
      loc &&
      loc.year === targetYear &&
      loc.month === targetMonth &&
      loc.day === targetDay &&
      loc.hour === targetHour &&
      loc.minute === targetMinute
    ) {
      matchingInstants.add(candidateUtcMs);
    }
  }

  // Must have exactly one unambiguous matching UTC instant.
  // 0 matches => nonexistent local time (spring-forward gap)
  // >1 matches => ambiguous local time (fall-back overlap)
  if (matchingInstants.size !== 1) {
    return null;
  }

  const [finalUtcMs] = Array.from(matchingInstants);
  const result = new Date(finalUtcMs);
  return Number.isNaN(result.getTime()) ? null : result;
}
