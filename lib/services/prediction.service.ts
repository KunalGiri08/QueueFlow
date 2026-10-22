import { getIndiaCalendarDate } from "@/lib/services/ticket.service";

/**
 * Default fallback service duration in minutes when insufficient historical data exists for a queue.
 * Used as a conservative, realistic baseline for customer service interactions without requiring
 * an extra schema migration on Service.
 */
export const DEFAULT_SERVICE_DURATION_MINUTES = 5;

/**
 * Default number of recent completed tickets to sample from the queue.
 * Keeps the estimate responsive to current staff throughput while mitigating single-outlier skew.
 */
export const DEFAULT_HISTORY_WINDOW_SIZE = 10;

/**
 * Minimum valid duration in minutes to prevent instantaneous completions (0s)
 * from producing a 0-minute estimate when a long queue is waiting.
 */
export const MIN_SERVICE_DURATION_MINUTES = 0.5;

export interface ActiveTicketInfo {
  status: "CALLED" | "SERVING";
  startedAt?: Date | null;
  calledAt?: Date | null;
}

export interface PurePredictionParams {
  ticketStatus: string;
  peopleAhead: number;
  averageServiceDurationMinutes: number;
  activeTicket?: ActiveTicketInfo | null;
  queueIsActive?: boolean;
  now?: Date;
}

export interface CompletedTicketRecord {
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Returns the start of day (00:00:00 IST) for the Asia/Kolkata timezone as a UTC Date.
 */
export function getIndiaDayStart(date: Date = new Date()): Date {
  const dateStr = getIndiaCalendarDate(date);
  return new Date(`${dateStr}T00:00:00+05:30`);
}

/**
 * Filters and computes valid service durations (in minutes) from completed ticket lifecycle timestamps.
 *
 * Rules:
 * - Both startedAt and completedAt must be non-null valid Date objects.
 * - completedAt must be >= startedAt.
 * - Legacy tickets with null lifecycle timestamps and invalid ranges are safely filtered out.
 */
export function extractValidDurationsMinutes(
  tickets: CompletedTicketRecord[],
): number[] {
  return tickets
    .filter(
      (t): t is { startedAt: Date; completedAt: Date } =>
        t.startedAt instanceof Date &&
        t.completedAt instanceof Date &&
        !isNaN(t.startedAt.getTime()) &&
        !isNaN(t.completedAt.getTime()) &&
        t.completedAt.getTime() >= t.startedAt.getTime(),
    )
    .map(
      (t) => (t.completedAt.getTime() - t.startedAt.getTime()) / (1000 * 60),
    );
}

/**
 * Calculates the average service duration in minutes from an array of valid durations.
 * Falls back to fallbackMinutes (defaulting to DEFAULT_SERVICE_DURATION_MINUTES) when
 * insufficient history exists or all values are invalid.
 */
export function calculateAverageServiceDuration(
  durationsMinutes: number[],
  fallbackMinutes: number = DEFAULT_SERVICE_DURATION_MINUTES,
): number {
  const valid = durationsMinutes.filter(
    (d) => typeof d === "number" && !isNaN(d) && d >= 0,
  );

  if (valid.length === 0) {
    return fallbackMinutes;
  }

  const sum = valid.reduce((acc, curr) => acc + curr, 0);
  const avg = sum / valid.length;

  return Math.max(MIN_SERVICE_DURATION_MINUTES, avg);
}

/**
 * Pure arithmetic function to calculate estimated waiting time in integer minutes.
 *
 * Assumptions and Modeling:
 * 1. Queue Status: If the queue is inactive (queueIsActive === false), returns null.
 * 2. Ticket Status:
 *    - Terminal states (COMPLETED, SKIPPED, CANCELLED): returns null.
 *    - Active states (CALLED, SERVING): returns 0 (it is already their turn).
 *    - WAITING:
 *      - Accounts for remaining service duration of the currently SERVING or CALLED ticket in the queue.
 *      - Accounts for all waiting tickets ahead (peopleAhead * averageServiceDurationMinutes).
 *      - Parallel Capacity: In QueueFlow, counters belong to an organization and are not statically
 *        bound to a specific queue. Because reliable queue-specific parallel capacity cannot be
 *        guaranteed, we use a conservative single-server model.
 *      - Clamps peopleAhead to >= 0 and rounds the final estimate to the nearest integer minute.
 */
export function calculateEstimatedWaitMinutes({
  ticketStatus,
  peopleAhead,
  averageServiceDurationMinutes,
  activeTicket,
  queueIsActive = true,
  now = new Date(),
}: PurePredictionParams): number | null {
  if (!queueIsActive) {
    return null;
  }

  const normalizedStatus = ticketStatus.toUpperCase();

  // Terminal states have no waiting time
  if (
    normalizedStatus === "COMPLETED" ||
    normalizedStatus === "SKIPPED" ||
    normalizedStatus === "CANCELLED"
  ) {
    return null;
  }

  // If ticket is already called or currently being served, customer wait is 0
  if (normalizedStatus === "CALLED" || normalizedStatus === "SERVING") {
    return 0;
  }

  // Only WAITING tickets require a wait-time estimate
  if (normalizedStatus !== "WAITING") {
    return null;
  }

  const clampedPeopleAhead = Math.max(0, Math.floor(peopleAhead));
  const avgDuration = Math.max(
    MIN_SERVICE_DURATION_MINUTES,
    averageServiceDurationMinutes > 0
      ? averageServiceDurationMinutes
      : DEFAULT_SERVICE_DURATION_MINUTES,
  );

  // Estimate remaining service time for the active ticket currently occupying the counter
  let remainingCurrentTicketMinutes = 0;

  if (activeTicket) {
    if (activeTicket.status === "SERVING") {
      const startedAt = activeTicket.startedAt
        ? new Date(activeTicket.startedAt)
        : null;

      if (startedAt && !isNaN(startedAt.getTime())) {
        const elapsedMinutes = Math.max(
          0,
          (now.getTime() - startedAt.getTime()) / (1000 * 60),
        );
        remainingCurrentTicketMinutes = Math.max(
          0,
          avgDuration - elapsedMinutes,
        );
      } else {
        // Fallback when startedAt is null (e.g. legacy ticket): assume full average duration remains
        remainingCurrentTicketMinutes = avgDuration;
      }
    } else if (activeTicket.status === "CALLED") {
      // Ticket has been called but service hasn't started; assume full average duration remains
      remainingCurrentTicketMinutes = avgDuration;
    }
  }

  // If no one is ahead and no active ticket at the counter, wait is 0
  if (clampedPeopleAhead === 0 && !activeTicket) {
    return 0;
  }

  const totalWaitMinutes =
    remainingCurrentTicketMinutes + clampedPeopleAhead * avgDuration;

  return Math.max(0, Math.round(totalWaitMinutes));
}

export interface EstimateTicketWaitTimeOptions {
  queueId: string;
  ticketStatus: string;
  peopleAhead: number;
  queueIsActive?: boolean;
  activeTicket?: ActiveTicketInfo | null;
  now?: Date;
  windowSize?: number;
}

/**
 * Orchestrates database retrieval and calls the pure prediction calculation.
 *
 * Optimization:
 * For terminal tickets (COMPLETED, SKIPPED, CANCELLED) or inactive queues, returns null
 * immediately without running DB queries.
 * For CALLED or SERVING tickets, returns 0 immediately.
 * For WAITING tickets, queries recent completed tickets from the current India calendar day,
 * falling back to recent queue history or DEFAULT_SERVICE_DURATION_MINUTES if insufficient data exists.
 */
export async function estimateTicketWaitTime(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient?: any,
  options?: EstimateTicketWaitTimeOptions,
): Promise<number | null> {
  if (!options) {
    return null;
  }

  const {
    queueId,
    ticketStatus,
    peopleAhead,
    queueIsActive = true,
    activeTicket,
    now = new Date(),
    windowSize = DEFAULT_HISTORY_WINDOW_SIZE,
  } = options;

  if (!queueIsActive) {
    return null;
  }

  const normalizedStatus = ticketStatus.toUpperCase();

  if (
    normalizedStatus === "COMPLETED" ||
    normalizedStatus === "SKIPPED" ||
    normalizedStatus === "CANCELLED"
  ) {
    return null;
  }

  if (normalizedStatus === "CALLED" || normalizedStatus === "SERVING") {
    return 0;
  }

  if (normalizedStatus !== "WAITING") {
    return null;
  }

  const db = prismaClient ?? (await import("@/lib/prisma")).prisma;
  const indiaDayStart = getIndiaDayStart(now);

  // 1. Query recent completed tickets from the same queue for the current India day
  let completedTickets: CompletedTicketRecord[] = await db.ticket.findMany({
    where: {
      queueId,
      status: "COMPLETED",
      startedAt: { not: null },
      completedAt: {
        not: null,
        gte: indiaDayStart,
      },
    },
    orderBy: {
      completedAt: "desc",
    },
    take: windowSize,
    select: {
      startedAt: true,
      completedAt: true,
    },
  });

  let validDurations = extractValidDurationsMinutes(completedTickets);

  // 2. If insufficient data for today, query most recent completed tickets from the queue regardless of day
  if (validDurations.length === 0) {
    completedTickets = await db.ticket.findMany({
      where: {
        queueId,
        status: "COMPLETED",
        startedAt: { not: null },
        completedAt: { not: null },
      },
      orderBy: {
        completedAt: "desc",
      },
      take: windowSize,
      select: {
        startedAt: true,
        completedAt: true,
      },
    });

    validDurations = extractValidDurationsMinutes(completedTickets);
  }

  // 3. Calculate average duration with fallback
  const averageServiceDurationMinutes = calculateAverageServiceDuration(
    validDurations,
    DEFAULT_SERVICE_DURATION_MINUTES,
  );

  // 4. Calculate pure prediction
  return calculateEstimatedWaitMinutes({
    ticketStatus,
    peopleAhead,
    averageServiceDurationMinutes,
    activeTicket,
    queueIsActive,
    now,
  });
}
