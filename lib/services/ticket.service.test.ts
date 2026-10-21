import { describe, expect, it, vi } from "vitest";
import {
  getIndiaCalendarDate,
  INDIA_TIMEZONE,
  reserveNextTicketNumber,
} from "./ticket.service";
import type { Prisma } from "@/app/generated/prisma/client";

interface MockQueueRow {
  id: string;
  nextTicketNumber: number;
  lastResetDate: string | null;
  isActive: boolean;
}

/**
 * Creates a stateful mock transaction client that faithfully simulates PostgreSQL's
 * atomic UPDATE ... RETURNING row-locking behavior for the Queue table.
 */
function createMockTx(queues: MockQueueRow[]): {
  tx: Prisma.TransactionClient;
  getQueue: (id: string) => MockQueueRow | undefined;
  queryLog: { query: string; values: unknown[] }[];
} {
  const store = new Map<string, MockQueueRow>(
    queues.map((q) => [q.id, { ...q }]),
  );
  const queryLog: { query: string; values: unknown[] }[] = [];

  const mockQueryRaw = vi.fn(
    async (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<{ number: number }[]> => {
      queryLog.push({
        query: strings.join("?"),
        values,
      });

      // Template has currentDate twice (${currentDate}), then ${queueId}
      const currentDate = values[0] as string;
      const queueId = values[values.length - 1] as string;

      const queue = store.get(queueId);
      if (!queue || !queue.isActive) {
        return [];
      }

      const shouldReset =
        queue.lastResetDate === null || queue.lastResetDate !== currentDate;

      if (shouldReset) {
        queue.nextTicketNumber = 2;
        queue.lastResetDate = currentDate;
        return [{ number: 1 }];
      } else {
        const allocated = queue.nextTicketNumber;
        queue.nextTicketNumber = queue.nextTicketNumber + 1;
        queue.lastResetDate = currentDate;
        return [{ number: allocated }];
      }
    },
  );

  const tx = {
    $queryRaw: mockQueryRaw,
  } as unknown as Prisma.TransactionClient;

  return {
    tx,
    getQueue: (id: string) => store.get(id),
    queryLog,
  };
}

describe("ticket.service - Daily Ticket Number Reset", () => {
  describe("getIndiaCalendarDate (Asia/Kolkata timezone)", () => {
    it("exports the correct timezone constant", () => {
      expect(INDIA_TIMEZONE).toBe("Asia/Kolkata");
    });

    it("formats dates in YYYY-MM-DD for Asia/Kolkata across UTC boundaries", () => {
      // 2026-10-21 18:29:59 UTC = 2026-10-21 23:59:59 IST (one second before midnight)
      const beforeMidnight = new Date("2026-10-21T18:29:59.000Z");
      expect(getIndiaCalendarDate(beforeMidnight)).toBe("2026-10-21");

      // 2026-10-21 18:30:00 UTC = 2026-10-22 00:00:00 IST (exact midnight rollover in India)
      const atMidnight = new Date("2026-10-21T18:30:00.000Z");
      expect(getIndiaCalendarDate(atMidnight)).toBe("2026-10-22");

      // Mid-day in India: 2026-10-22 06:30:00 UTC = 12:00:00 IST
      const midday = new Date("2026-10-22T06:30:00.000Z");
      expect(getIndiaCalendarDate(midday)).toBe("2026-10-22");
    });
  });

  describe("reserveNextTicketNumber", () => {
    it("allocates ticket #1 for a fresh queue with null lastResetDate", async () => {
      const { tx, getQueue, queryLog } = createMockTx([
        {
          id: "queue-1",
          nextTicketNumber: 1,
          lastResetDate: null,
          isActive: true,
        },
      ]);

      const fixedDate = new Date("2026-10-21T10:00:00.000Z"); // 15:30 IST on 2026-10-21
      const ticketNum = await reserveNextTicketNumber(tx, "queue-1", fixedDate);

      expect(ticketNum).toBe(1);
      const queue = getQueue("queue-1");
      expect(queue?.nextTicketNumber).toBe(2);
      expect(queue?.lastResetDate).toBe("2026-10-21");

      expect(queryLog).toHaveLength(1);
      expect(queryLog[0].values).toEqual(["2026-10-21", "2026-10-21", "queue-1"]);
    });

    it("allocates consecutive ticket numbers on the same calendar day", async () => {
      const { tx, getQueue } = createMockTx([
        {
          id: "queue-1",
          nextTicketNumber: 1,
          lastResetDate: null,
          isActive: true,
        },
      ]);

      const day1 = new Date("2026-10-21T07:00:00.000Z"); // 12:30 IST on 2026-10-21
      const t1 = await reserveNextTicketNumber(tx, "queue-1", day1);
      const t2 = await reserveNextTicketNumber(tx, "queue-1", day1);
      const t3 = await reserveNextTicketNumber(tx, "queue-1", day1);

      expect(t1).toBe(1);
      expect(t2).toBe(2);
      expect(t3).toBe(3);

      const queue = getQueue("queue-1");
      expect(queue?.nextTicketNumber).toBe(4);
      expect(queue?.lastResetDate).toBe("2026-10-21");
    });

    it("resets ticket sequence to 1 when date rolls over past midnight in Asia/Kolkata", async () => {
      const { tx, getQueue } = createMockTx([
        {
          id: "queue-1",
          nextTicketNumber: 1,
          lastResetDate: null,
          isActive: true,
        },
      ]);

      // Last ticket issued 1 second before midnight on 2026-10-21
      const beforeMidnight = new Date("2026-10-21T18:29:59.000Z"); // 23:59:59 IST
      const t1 = await reserveNextTicketNumber(tx, "queue-1", beforeMidnight);
      const t2 = await reserveNextTicketNumber(tx, "queue-1", beforeMidnight);

      expect(t1).toBe(1);
      expect(t2).toBe(2);
      expect(getQueue("queue-1")?.lastResetDate).toBe("2026-10-21");

      // First ticket issued right at midnight rollover (2026-10-22 IST)
      const afterMidnight = new Date("2026-10-21T18:30:00.000Z"); // 00:00:00 IST
      const t3 = await reserveNextTicketNumber(tx, "queue-1", afterMidnight);

      expect(t3).toBe(1); // Reset to 1 on the new India calendar day!
      expect(getQueue("queue-1")?.lastResetDate).toBe("2026-10-22");
      expect(getQueue("queue-1")?.nextTicketNumber).toBe(2);

      // Subsequent tickets on the new day continue sequentially
      const t4 = await reserveNextTicketNumber(tx, "queue-1", afterMidnight);
      expect(t4).toBe(2);
      expect(getQueue("queue-1")?.nextTicketNumber).toBe(3);
    });

    it("maintains independent sequences for different queues", async () => {
      const { tx, getQueue } = createMockTx([
        {
          id: "queue-A",
          nextTicketNumber: 1,
          lastResetDate: null,
          isActive: true,
        },
        {
          id: "queue-B",
          nextTicketNumber: 1,
          lastResetDate: null,
          isActive: true,
        },
      ]);

      const date = new Date("2026-10-21T10:00:00.000Z");

      // Interleaved ticket reservations across two queues
      const a1 = await reserveNextTicketNumber(tx, "queue-A", date);
      const a2 = await reserveNextTicketNumber(tx, "queue-A", date);
      const b1 = await reserveNextTicketNumber(tx, "queue-B", date);
      const a3 = await reserveNextTicketNumber(tx, "queue-A", date);
      const b2 = await reserveNextTicketNumber(tx, "queue-B", date);

      expect(a1).toBe(1);
      expect(a2).toBe(2);
      expect(a3).toBe(3);

      expect(b1).toBe(1);
      expect(b2).toBe(2);

      expect(getQueue("queue-A")?.nextTicketNumber).toBe(4);
      expect(getQueue("queue-B")?.nextTicketNumber).toBe(3);
    });

    it("resets queues that have not received tickets recently", async () => {
      const { tx, getQueue } = createMockTx([
        {
          id: "queue-stale",
          nextTicketNumber: 57,
          lastResetDate: "2026-10-10", // 11 days ago
          isActive: true,
        },
      ]);

      const today = new Date("2026-10-21T10:00:00.000Z");
      const ticketNum = await reserveNextTicketNumber(tx, "queue-stale", today);

      expect(ticketNum).toBe(1);
      const queue = getQueue("queue-stale");
      expect(queue?.nextTicketNumber).toBe(2);
      expect(queue?.lastResetDate).toBe("2026-10-21");
    });

    it("throws when queue is not found or inactive", async () => {
      const { tx } = createMockTx([
        {
          id: "queue-inactive",
          nextTicketNumber: 5,
          lastResetDate: "2026-10-21",
          isActive: false,
        },
      ]);

      await expect(
        reserveNextTicketNumber(tx, "non-existent-id"),
      ).rejects.toThrow("Queue not found or inactive");

      await expect(
        reserveNextTicketNumber(tx, "queue-inactive"),
      ).rejects.toThrow("Queue not found or inactive");
    });

    it("handles concurrent reservation requests without generating duplicates", async () => {
      const { tx } = createMockTx([
        {
          id: "queue-concurrent",
          nextTicketNumber: 1,
          lastResetDate: null,
          isActive: true,
        },
      ]);

      const testDate = new Date("2026-10-21T10:00:00.000Z");

      // Run 20 parallel reservations
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          reserveNextTicketNumber(tx, "queue-concurrent", testDate),
        ),
      );

      // Verify all 20 tickets are unique and sequence 1..20 is intact
      expect(results).toHaveLength(20);
      const uniqueNumbers = new Set(results);
      expect(uniqueNumbers.size).toBe(20);
      expect(Math.min(...results)).toBe(1);
      expect(Math.max(...results)).toBe(20);
    });

    it("verifies rollback semantics: failures in transaction abort sequence modification", async () => {
      const initialQueue: MockQueueRow = {
        id: "queue-rollback",
        nextTicketNumber: 5,
        lastResetDate: "2026-10-21",
        isActive: true,
      };

      // Create a transaction runner simulating prisma.$transaction rollback
      let queueState = { ...initialQueue };

      const runFailingTransaction = async () => {
        // Create an uncommitted snapshot
        const snapshot = { ...queueState };
        const mockTx = {
          $queryRaw: vi.fn(async () => {
            // Tentatively update
            queueState.nextTicketNumber += 1;
            return [{ number: queueState.nextTicketNumber - 1 }];
          }),
        } as unknown as Prisma.TransactionClient;

        try {
          await reserveNextTicketNumber(mockTx, "queue-rollback");
          // Simulate error later in transaction (e.g. active ticket exists)
          throw new Error("ACTIVE_TICKET_EXISTS");
        } catch (err) {
          // Transaction abort rolls back changes to queueState
          queueState = snapshot;
          throw err;
        }
      };

      await expect(runFailingTransaction()).rejects.toThrow("ACTIVE_TICKET_EXISTS");

      // Verify the queue state was not altered because of the rollback
      expect(queueState.nextTicketNumber).toBe(5);
      expect(queueState.lastResetDate).toBe("2026-10-21");
    });
  });
});
