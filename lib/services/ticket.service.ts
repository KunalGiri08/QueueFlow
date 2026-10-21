import { Prisma } from "@/app/generated/prisma/client";

export const INDIA_TIMEZONE = "Asia/Kolkata";

const indiaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: INDIA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Returns the calendar date in Asia/Kolkata timezone in YYYY-MM-DD format.
 */
export function getIndiaCalendarDate(date: Date = new Date()): string {
  return indiaDateFormatter.format(date);
}

/**
 * Atomically allocates the next ticket number for a queue with daily reset
 * based on the Asia/Kolkata calendar day.
 *
 * Acquires an exclusive row-level lock on the Queue record via UPDATE.
 * If the queue's lastResetDate differs from the current India calendar day
 * (e.g. first ticket of the day, after midnight rollover, or queue inactive recently),
 * the ticket sequence resets to 1 and nextTicketNumber is set to 2.
 * Otherwise, the existing sequence continues and nextTicketNumber increments.
 *
 * @param tx - Prisma TransactionClient executing within an active transaction.
 * @param queueId - The queue to reserve a ticket number for.
 * @param now - Optional Date (or clock) to evaluate current time against, defaults to new Date().
 * @returns The allocated ticket number (1-based integer).
 * @throws Error("Queue not found or inactive") if queue doesn't exist or isActive is false.
 */
export async function reserveNextTicketNumber(
  tx: Prisma.TransactionClient,
  queueId: string,
  now: Date = new Date(),
): Promise<number> {
  const currentDate = getIndiaCalendarDate(now);

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

  if (result.length === 0) {
    throw new Error("Queue not found or inactive");
  }

  return result[0].number;
}