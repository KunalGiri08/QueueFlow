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
