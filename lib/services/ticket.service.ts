import { Prisma } from "@/app/generated/prisma/client";
import { isValidIanaTimezone } from "@/lib/validations/schedule";
import { getLocalTimeDetails } from "@/lib/services/schedule.service";

export const INDIA_TIMEZONE = "Asia/Kolkata";

const indiaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: INDIA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the calendar date in the specified timezone (or Asia/Kolkata) in YYYY-MM-DD format.
 */
export function getCalendarDate(
  date: Date = new Date(),
  timezone: string = INDIA_TIMEZONE,
): string {
  const details = getLocalTimeDetails(date, timezone);
  if (details) {
    return details.date;
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidIanaTimezone(timezone) ? timezone : INDIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Returns the calendar date in Asia/Kolkata timezone in YYYY-MM-DD format.
 */
export function getIndiaCalendarDate(date: Date = new Date()): string {
  return indiaDateFormatter.format(date);
}

/**
 * Calculates the exact UTC start and end Date boundaries for the local calendar day
 * containing `instant` in the given IANA timezone.
 *
 * Any ticket with `createdAt >= start && createdAt < end` falls on that local calendar day.
 * Correctly accounts for DST transitions (23-hour and 25-hour days).
 */
export function getLocalCalendarDayBounds(
  instant: Date,
  timezone: string,
): { start: Date; end: Date; dateStr: string } | null {
  if (!isValidIanaTimezone(timezone)) {
    return null;
  }
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    return null;
  }

  const details = getLocalTimeDetails(instant, timezone);
  if (!details) {
    return null;
  }

  const targetDateStr = details.date;

  // Approximate UTC timestamp for year-month-day at 00:00:00 UTC
  const approxStartUtc = Date.UTC(
    details.year,
    details.month - 1,
    details.day,
    0,
    0,
    0,
  );

  const findMidnightUtc = (approxUtc: number, dateStr: string): Date => {
    let candidate = approxUtc;
    const local = getLocalTimeDetails(new Date(candidate), timezone);
    if (local) {
      const candidateDate = local.date;
      const localMinutes = local.hour * 60 + local.minute;

      if (candidateDate === dateStr) {
        candidate = candidate - localMinutes * 60 * 1000;
      } else if (candidateDate > dateStr) {
        candidate = candidate - (1440 + localMinutes) * 60 * 1000;
      } else {
        candidate = candidate + (1440 - localMinutes) * 60 * 1000;
      }
    }

    let t = candidate;
    while (getLocalTimeDetails(new Date(t), timezone)?.date === dateStr) {
      t -= 60000;
    }
    while (getLocalTimeDetails(new Date(t), timezone)?.date !== dateStr) {
      t += 1000;
    }
    return new Date(t);
  };

  const start = findMidnightUtc(approxStartUtc, targetDateStr);

  // Next day start is evaluated 28 hours after start to cross midnight cleanly regardless of DST
  const nextDayApprox = start.getTime() + 28 * 3600 * 1000;
  const nextDayDetails = getLocalTimeDetails(new Date(nextDayApprox), timezone);
  if (!nextDayDetails) {
    return null;
  }
  const end = findMidnightUtc(nextDayApprox, nextDayDetails.date);

  return {
    start,
    end,
    dateStr: targetDateStr,
  };
}

export interface LockedQueueRow {
  id: string;
  nextTicketNumber: number;
  lastResetDate: string | null;
  maxWaitingTickets: number | null;
  maxDailyTickets: number | null;
}

/**
 * Acquires an exclusive row-level lock on the Queue record in PostgreSQL.
 * Concurrent ticket creation requests for this queue will serialize here.
 *
 * @throws Error("Queue not found or inactive") if queue doesn't exist or isActive is false.
 */
export async function acquireQueueLock(
  tx: Prisma.TransactionClient,
  queueId: string,
): Promise<LockedQueueRow> {
  const rows = await tx.$queryRaw<LockedQueueRow[]>`
    SELECT "id", "nextTicketNumber", "lastResetDate", "maxWaitingTickets", "maxDailyTickets"
    FROM "Queue"
    WHERE "id" = ${queueId}
      AND "isActive" = true
    FOR UPDATE
  `;

  if (!rows || rows.length === 0) {
    throw new Error("Queue not found or inactive");
  }

  return rows[0];
}

export interface QueueCapacityCheckInput {
  tx: Prisma.TransactionClient;
  queueId: string;
  maxWaitingTickets?: number | null;
  maxDailyTickets?: number | null;
  timezone: string;
  instant?: Date;
}

export interface QueueCapacityEvaluationResult {
  allowed: boolean;
  code?:
    | "QUEUE_CAPACITY_REACHED"
    | "DAILY_TICKET_LIMIT_REACHED"
    | "INVALID_SCHEDULE_CONFIGURATION";
  error?: string;
  waitingCount?: number;
  dailyCount?: number;
}

/**
 * Evaluates queue capacity limits (waiting-ticket limit and daily-ticket limit)
 * within an active transaction while the Queue row lock is held.
 *
 * Sequence:
 * 1. Checks current WAITING-ticket count against maxWaitingTickets.
 * 2. Checks local calendar day ticket count against maxDailyTickets.
 */
export async function evaluateQueueCapacity(
  input: QueueCapacityCheckInput,
): Promise<QueueCapacityEvaluationResult> {
  const {
    tx,
    queueId,
    maxWaitingTickets,
    maxDailyTickets,
    timezone,
    instant = new Date(),
  } = input;

  // 1. Check waiting tickets limit if configured
  if (
    maxWaitingTickets !== null &&
    maxWaitingTickets !== undefined &&
    maxWaitingTickets > 0
  ) {
    const waitingCount = await tx.ticket.count({
      where: {
        queueId,
        status: "WAITING",
      },
    });

    if (waitingCount >= maxWaitingTickets) {
      return {
        allowed: false,
        code: "QUEUE_CAPACITY_REACHED",
        error: "Queue waiting capacity reached",
        waitingCount,
      };
    }
  }

  // 2. Check daily tickets limit if configured
  if (
    maxDailyTickets !== null &&
    maxDailyTickets !== undefined &&
    maxDailyTickets > 0
  ) {
    if (!isValidIanaTimezone(timezone)) {
      return {
        allowed: false,
        code: "INVALID_SCHEDULE_CONFIGURATION",
        error: "Organization schedule is temporarily misconfigured",
      };
    }

    const bounds = getLocalCalendarDayBounds(instant, timezone);
    if (!bounds) {
      return {
        allowed: false,
        code: "INVALID_SCHEDULE_CONFIGURATION",
        error: "Organization schedule is temporarily misconfigured",
      };
    }

    const dailyCount = await tx.ticket.count({
      where: {
        queueId,
        createdAt: {
          gte: bounds.start,
          lt: bounds.end,
        },
      },
    });

    if (dailyCount >= maxDailyTickets) {
      return {
        allowed: false,
        code: "DAILY_TICKET_LIMIT_REACHED",
        error: "Daily ticket limit reached",
        dailyCount,
      };
    }
  }

  return {
    allowed: true,
  };
}

/**
 * Atomically allocates the next ticket number for a queue with daily reset
 * based on the organization's calendar day.
 *
 * Updates nextTicketNumber and lastResetDate on the Queue record.
 * If the queue's lastResetDate differs from the current local calendar day,
 * the ticket sequence resets to 1 and nextTicketNumber is set to 2.
 * Otherwise, the sequence continues and nextTicketNumber increments.
 *
 * @param tx - Prisma TransactionClient executing within an active transaction.
 * @param queueId - The queue to reserve a ticket number for.
 * @param now - Optional Date to evaluate current time against, defaults to new Date().
 * @param timezone - Optional IANA timezone for calendar day calculation, defaults to Asia/Kolkata.
 * @returns The allocated ticket number (1-based integer).
 * @throws Error("Queue not found or inactive") if queue doesn't exist or isActive is false.
 */
export async function reserveNextTicketNumber(
  tx: Prisma.TransactionClient,
  queueId: string,
  now: Date = new Date(),
  timezone: string = INDIA_TIMEZONE,
): Promise<number> {
  const currentDate = getCalendarDate(now, timezone);

  const result = await tx.$queryRaw<{ number: number }[]>`
    UPDATE "Queue"
    SET
      "nextTicketNumber" = CASE
        WHEN "lastResetDate" IS NULL OR "lastResetDate" != ${currentDate} THEN 2
        ELSE "nextTicketNumber" + 1
      END,
      "lastResetDate" = ${currentDate}
    WHERE "id" = ${queueId}
      AND "isActive" = true
    RETURNING "nextTicketNumber" - 1 AS number;
  `;

  if (!result || result.length === 0) {
    throw new Error("Queue not found or inactive");
  }

  return result[0].number;
}

export interface ResolveStaleTicketsInput {
  tx: Prisma.TransactionClient;
  queueId: string;
  timezone: string;
  instant?: Date;
}

export interface ResolveStaleTicketsResult {
  cancelledCount: number;
  skippedCount: number;
}

/**
 * Atomically resolves active tickets from previous organization-local calendar days
 * for a specific queue within an active transaction.
 *
 * Tickets with createdAt strictly before the start of the current local calendar day:
 * - WAITING tickets are transitioned to CANCELLED with cancelledAt recorded.
 * - CALLED and SERVING tickets are transitioned to SKIPPED with skippedAt recorded.
 *
 * This frees queue capacity, releases the PostgreSQL partial unique index
 * for returning customers, and prevents stale tickets from being called.
 */
export async function resolveStaleQueueTickets(
  input: ResolveStaleTicketsInput,
): Promise<ResolveStaleTicketsResult> {
  const { tx, queueId, timezone, instant = new Date() } = input;
  const bounds = getLocalCalendarDayBounds(instant, timezone);
  if (!bounds) {
    return { cancelledCount: 0, skippedCount: 0 };
  }

  if (typeof tx.ticket?.updateMany !== "function") {
    return { cancelledCount: 0, skippedCount: 0 };
  }

  const waitingResult = await tx.ticket.updateMany({
    where: {
      queueId,
      status: "WAITING",
      createdAt: {
        lt: bounds.start,
      },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: instant,
    },
  });

  const activeResult = await tx.ticket.updateMany({
    where: {
      queueId,
      status: { in: ["CALLED", "SERVING"] },
      createdAt: {
        lt: bounds.start,
      },
    },
    data: {
      status: "SKIPPED",
      skippedAt: instant,
    },
  });

  return {
    cancelledCount: waitingResult.count,
    skippedCount: activeResult.count,
  };
}

export interface ResolveStaleStaffActiveTicketsInput {
  tx: Prisma.TransactionClient;
  staffId: string;
  organizationId: string;
  timezone: string;
  instant?: Date;
}

/**
 * Atomically resolves active tickets (CALLED or SERVING) from previous organization-local
 * calendar days for a specific staff member in an organization.
 *
 * Tickets with createdAt strictly before the start of the current local calendar day
 * are transitioned to SKIPPED with skippedAt recorded, unblocking the staff member.
 */
export async function resolveStaleStaffActiveTickets(
  input: ResolveStaleStaffActiveTicketsInput,
): Promise<{ skippedCount: number }> {
  const { tx, staffId, organizationId, timezone, instant = new Date() } = input;
  const bounds = getLocalCalendarDayBounds(instant, timezone);
  if (!bounds) {
    return { skippedCount: 0 };
  }

  if (typeof tx.ticket?.updateMany !== "function") {
    return { skippedCount: 0 };
  }

  const activeResult = await tx.ticket.updateMany({
    where: {
      servedById: staffId,
      status: { in: ["CALLED", "SERVING"] },
      createdAt: {
        lt: bounds.start,
      },
      queue: {
        service: {
          organizationId,
        },
      },
    },
    data: {
      status: "SKIPPED",
      skippedAt: instant,
    },
  });

  return {
    skippedCount: activeResult.count,
  };
}