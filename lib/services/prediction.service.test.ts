import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SERVICE_DURATION_MINUTES,
  MIN_SERVICE_DURATION_MINUTES,
  calculateAverageServiceDuration,
  calculateEstimatedWaitMinutes,
  estimateTicketWaitTime,
  extractValidDurationsMinutes,
  getIndiaDayStart,
} from "./prediction.service";

describe("lib/services/prediction.service", () => {
  describe("getIndiaDayStart", () => {
    it("returns 00:00:00 IST represented as a UTC date", () => {
      // 2026-10-22 at 12:00 UTC is 17:30 IST on Oct 22
      const date = new Date("2026-10-22T12:00:00Z");
      const dayStart = getIndiaDayStart(date);

      // Start of 2026-10-22 IST is 2026-10-21T18:30:00.000Z
      expect(dayStart.toISOString()).toBe("2026-10-21T18:30:00.000Z");
    });
  });

  describe("extractValidDurationsMinutes", () => {
    it("extracts valid durations when completedAt >= startedAt", () => {
      const started = new Date("2026-10-22T10:00:00Z");
      const completed = new Date("2026-10-22T10:07:30Z"); // 7.5 minutes

      const durations = extractValidDurationsMinutes([
        { startedAt: started, completedAt: completed },
      ]);

      expect(durations).toEqual([7.5]);
    });

    it("filters out legacy tickets with null startedAt or completedAt", () => {
      const durations = extractValidDurationsMinutes([
        { startedAt: null, completedAt: new Date("2026-10-22T10:05:00Z") },
        { startedAt: new Date("2026-10-22T10:00:00Z"), completedAt: null },
        { startedAt: null, completedAt: null },
      ]);

      expect(durations).toEqual([]);
    });

    it("filters out records where completedAt is before startedAt", () => {
      const started = new Date("2026-10-22T10:10:00Z");
      const completed = new Date("2026-10-22T10:05:00Z");

      const durations = extractValidDurationsMinutes([
        { startedAt: started, completedAt: completed },
      ]);

      expect(durations).toEqual([]);
    });

    it("filters out invalid dates", () => {
      const durations = extractValidDurationsMinutes([
        {
          startedAt: new Date("invalid"),
          completedAt: new Date("2026-10-22T10:00:00Z"),
        },
      ]);

      expect(durations).toEqual([]);
    });
  });

  describe("calculateAverageServiceDuration", () => {
    it("computes the arithmetic mean of valid durations", () => {
      expect(calculateAverageServiceDuration([4, 6, 8])).toBe(6);
    });

    it("falls back to DEFAULT_SERVICE_DURATION_MINUTES when array is empty", () => {
      expect(calculateAverageServiceDuration([])).toBe(
        DEFAULT_SERVICE_DURATION_MINUTES,
      );
    });

    it("falls back to custom fallback if provided", () => {
      expect(calculateAverageServiceDuration([], 7)).toBe(7);
    });

    it("clamps minimum average to MIN_SERVICE_DURATION_MINUTES when durations are 0", () => {
      expect(calculateAverageServiceDuration([0, 0])).toBe(
        MIN_SERVICE_DURATION_MINUTES,
      );
    });

    it("ignores negative or NaN entries", () => {
      expect(calculateAverageServiceDuration([-10, NaN, 10])).toBe(10);
    });
  });

  describe("calculateEstimatedWaitMinutes (Pure Calculation)", () => {
    const baseNow = new Date("2026-10-22T10:15:00Z");

    it("returns null when queueIsActive is false", () => {
      expect(
        calculateEstimatedWaitMinutes({
          ticketStatus: "WAITING",
          peopleAhead: 2,
          averageServiceDurationMinutes: 5,
          queueIsActive: false,
          now: baseNow,
        }),
      ).toBeNull();
    });

    it("returns null for terminal statuses (COMPLETED, SKIPPED, CANCELLED)", () => {
      for (const status of ["COMPLETED", "SKIPPED", "CANCELLED"]) {
        expect(
          calculateEstimatedWaitMinutes({
            ticketStatus: status,
            peopleAhead: 0,
            averageServiceDurationMinutes: 5,
            now: baseNow,
          }),
        ).toBeNull();
      }
    });

    it("returns 0 for active tickets (CALLED, SERVING)", () => {
      expect(
        calculateEstimatedWaitMinutes({
          ticketStatus: "CALLED",
          peopleAhead: 0,
          averageServiceDurationMinutes: 5,
          now: baseNow,
        }),
      ).toBe(0);

      expect(
        calculateEstimatedWaitMinutes({
          ticketStatus: "SERVING",
          peopleAhead: 0,
          averageServiceDurationMinutes: 5,
          now: baseNow,
        }),
      ).toBe(0);
    });

    it("returns 0 for a WAITING ticket with 0 people ahead and no active ticket at counter", () => {
      expect(
        calculateEstimatedWaitMinutes({
          ticketStatus: "WAITING",
          peopleAhead: 0,
          averageServiceDurationMinutes: 5,
          activeTicket: null,
          now: baseNow,
        }),
      ).toBe(0);
    });

    it("estimates remaining time when 0 people ahead but a ticket is SERVING", () => {
      // Started 2 minutes ago with 5-minute average -> 3 minutes remaining
      const startedAt = new Date("2026-10-22T10:13:00Z");

      const wait = calculateEstimatedWaitMinutes({
        ticketStatus: "WAITING",
        peopleAhead: 0,
        averageServiceDurationMinutes: 5,
        activeTicket: {
          status: "SERVING",
          startedAt,
        },
        now: baseNow,
      });

      expect(wait).toBe(3);
    });

    it("handles serving ticket that has exceeded average duration without negative estimate", () => {
      // Started 8 minutes ago with 5-minute average -> remaining clamped to 0
      const startedAt = new Date("2026-10-22T10:07:00Z");

      const wait = calculateEstimatedWaitMinutes({
        ticketStatus: "WAITING",
        peopleAhead: 0,
        averageServiceDurationMinutes: 5,
        activeTicket: {
          status: "SERVING",
          startedAt,
        },
        now: baseNow,
      });

      expect(wait).toBe(0);
    });

    it("estimates full average duration for active CALLED ticket that hasn't started serving", () => {
      const wait = calculateEstimatedWaitMinutes({
        ticketStatus: "WAITING",
        peopleAhead: 0,
        averageServiceDurationMinutes: 6,
        activeTicket: {
          status: "CALLED",
        },
        now: baseNow,
      });

      expect(wait).toBe(6);
    });

    it("computes wait time for waiting tickets with no active ticket at counter", () => {
      // 3 people ahead * 5 min = 15 min
      const wait = calculateEstimatedWaitMinutes({
        ticketStatus: "WAITING",
        peopleAhead: 3,
        averageServiceDurationMinutes: 5,
        activeTicket: null,
        now: baseNow,
      });

      expect(wait).toBe(15);
    });

    it("combines remaining serving time and people ahead", () => {
      // Current serving started 1 min ago (remaining: 5 - 1 = 4 min)
      // 2 people ahead * 5 min = 10 min
      // Total = 14 min
      const startedAt = new Date("2026-10-22T10:14:00Z");

      const wait = calculateEstimatedWaitMinutes({
        ticketStatus: "WAITING",
        peopleAhead: 2,
        averageServiceDurationMinutes: 5,
        activeTicket: {
          status: "SERVING",
          startedAt,
        },
        now: baseNow,
      });

      expect(wait).toBe(14);
    });

    it("rounds float wait times correctly", () => {
      // 1 person ahead * 3.4 min = 3.4 -> rounds to 3 min
      expect(
        calculateEstimatedWaitMinutes({
          ticketStatus: "WAITING",
          peopleAhead: 1,
          averageServiceDurationMinutes: 3.4,
          now: baseNow,
        }),
      ).toBe(3);

      // 1 person ahead * 3.6 min = 3.6 -> rounds to 4 min
      expect(
        calculateEstimatedWaitMinutes({
          ticketStatus: "WAITING",
          peopleAhead: 1,
          averageServiceDurationMinutes: 3.6,
          now: baseNow,
        }),
      ).toBe(4);
    });

    it("safely clamps negative peopleAhead to 0", () => {
      const wait = calculateEstimatedWaitMinutes({
        ticketStatus: "WAITING",
        peopleAhead: -3,
        averageServiceDurationMinutes: 5,
        now: baseNow,
      });

      expect(wait).toBe(0);
    });
  });

  describe("estimateTicketWaitTime (Database Orchestration)", () => {
    it("returns null for inactive queue without querying the database", async () => {
      const mockFindMany = vi.fn();
      const mockPrisma = { ticket: { findMany: mockFindMany } };

      const result = await estimateTicketWaitTime(mockPrisma, {
        queueId: "queue-1",
        ticketStatus: "WAITING",
        peopleAhead: 2,
        queueIsActive: false,
      });

      expect(result).toBeNull();
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it("returns null for terminal tickets without querying the database", async () => {
      const mockFindMany = vi.fn();
      const mockPrisma = { ticket: { findMany: mockFindMany } };

      const result = await estimateTicketWaitTime(mockPrisma, {
        queueId: "queue-1",
        ticketStatus: "COMPLETED",
        peopleAhead: 0,
      });

      expect(result).toBeNull();
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it("returns 0 for CALLED or SERVING tickets without querying the database", async () => {
      const mockFindMany = vi.fn();
      const mockPrisma = { ticket: { findMany: mockFindMany } };

      const result = await estimateTicketWaitTime(mockPrisma, {
        queueId: "queue-1",
        ticketStatus: "CALLED",
        peopleAhead: 0,
      });

      expect(result).toBe(0);
      expect(mockFindMany).not.toHaveBeenCalled();
    });

    it("queries today's completed tickets and computes duration average", async () => {
      const now = new Date("2026-10-22T12:00:00Z");
      const mockFindMany = vi.fn().mockResolvedValue([
        {
          startedAt: new Date("2026-10-22T10:00:00Z"),
          completedAt: new Date("2026-10-22T10:08:00Z"), // 8 min
        },
        {
          startedAt: new Date("2026-10-22T10:10:00Z"),
          completedAt: new Date("2026-10-22T10:16:00Z"), // 6 min
        },
      ]);
      const mockPrisma = { ticket: { findMany: mockFindMany } };

      const result = await estimateTicketWaitTime(mockPrisma, {
        queueId: "queue-1",
        ticketStatus: "WAITING",
        peopleAhead: 2,
        now,
      });

      // Average duration = (8 + 6) / 2 = 7 min
      // 2 people ahead * 7 min = 14 min
      expect(result).toBe(14);
      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });

    it("falls back to recent completed tickets across days when today has no history", async () => {
      const now = new Date("2026-10-22T04:00:00Z"); // Early morning
      const mockFindMany = vi
        .fn()
        // First call: today's tickets -> empty
        .mockResolvedValueOnce([])
        // Second call: recent tickets -> 1 ticket with 10 min duration
        .mockResolvedValueOnce([
          {
            startedAt: new Date("2026-10-21T14:00:00Z"),
            completedAt: new Date("2026-10-21T14:10:00Z"), // 10 min
          },
        ]);
      const mockPrisma = { ticket: { findMany: mockFindMany } };

      const result = await estimateTicketWaitTime(mockPrisma, {
        queueId: "queue-1",
        ticketStatus: "WAITING",
        peopleAhead: 1,
        now,
      });

      expect(result).toBe(10);
      expect(mockFindMany).toHaveBeenCalledTimes(2);
    });

    it("falls back to DEFAULT_SERVICE_DURATION_MINUTES when queue has no completed tickets", async () => {
      const mockFindMany = vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const mockPrisma = { ticket: { findMany: mockFindMany } };

      const result = await estimateTicketWaitTime(mockPrisma, {
        queueId: "queue-new",
        ticketStatus: "WAITING",
        peopleAhead: 2,
      });

      // Fallback is 5 min * 2 = 10 min
      expect(result).toBe(10);
    });
  });
});
