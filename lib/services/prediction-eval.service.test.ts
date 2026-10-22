import { describe, expect, it, vi } from "vitest";
import {
  calculateActualWaitMinutes,
  evaluatePredictionAccuracy,
  evaluatePersistedPredictions,
  fetchPersistedEvaluationTickets,
  filterValidEvaluationRecords,
  filterValidPersistedEvaluationRecords,
  simulateQueueEvaluation,
} from "./prediction-eval.service";

describe("lib/services/prediction-eval.service", () => {
  describe("calculateActualWaitMinutes", () => {
    it("computes elapsed minutes between createdAt and calledAt", () => {
      const created = new Date("2026-10-22T10:00:00Z");
      const called = new Date("2026-10-22T10:15:30Z"); // 15.5 minutes

      expect(calculateActualWaitMinutes(created, called)).toBe(15.5);
    });

    it("accepts ISO string dates", () => {
      const created = "2026-10-22T10:00:00.000Z";
      const called = "2026-10-22T10:10:00.000Z";

      expect(calculateActualWaitMinutes(created, called)).toBe(10);
    });

    it("returns null when calledAt is null (e.g. legacy tickets or cancelled while waiting)", () => {
      const created = new Date("2026-10-22T10:00:00Z");

      expect(calculateActualWaitMinutes(created, null)).toBeNull();
      expect(calculateActualWaitMinutes(null, created)).toBeNull();
    });

    it("returns null when calledAt is before createdAt", () => {
      const created = new Date("2026-10-22T10:15:00Z");
      const called = new Date("2026-10-22T10:00:00Z");

      expect(calculateActualWaitMinutes(created, called)).toBeNull();
    });

    it("returns null for invalid dates", () => {
      expect(
        calculateActualWaitMinutes(new Date("invalid"), new Date("2026-10-22")),
      ).toBeNull();
    });
  });

  describe("filterValidEvaluationRecords", () => {
    it("extracts valid pairs and computes error and absolute error", () => {
      const records = [
        {
          ticketId: "t-1",
          createdAt: new Date("2026-10-22T10:00:00Z"),
          calledAt: new Date("2026-10-22T10:12:00Z"), // actual 12 min
          predictedMinutes: 15, // error: +3, abs: 3
        },
        {
          ticketId: "t-2",
          createdAt: new Date("2026-10-22T10:00:00Z"),
          calledAt: null, // legacy or cancelled
          predictedMinutes: 10,
        },
        {
          ticketId: "t-3",
          createdAt: new Date("2026-10-22T10:00:00Z"),
          calledAt: new Date("2026-10-22T10:08:00Z"),
          predictedMinutes: null, // no prediction available
        },
        {
          ticketId: "t-4",
          createdAt: new Date("2026-10-22T10:00:00Z"),
          calledAt: new Date("2026-10-22T10:20:00Z"), // actual 20 min
          predictedMinutes: 14, // error: -6, abs: 6
        },
      ];

      const valid = filterValidEvaluationRecords(records);

      expect(valid).toHaveLength(2);
      expect(valid[0].ticketId).toBe("t-1");
      expect(valid[0].actualWaitMinutes).toBe(12);
      expect(valid[0].errorMinutes).toBe(3);
      expect(valid[0].absoluteErrorMinutes).toBe(3);

      expect(valid[1].ticketId).toBe("t-4");
      expect(valid[1].actualWaitMinutes).toBe(20);
      expect(valid[1].errorMinutes).toBe(-6);
      expect(valid[1].absoluteErrorMinutes).toBe(6);
    });
  });

  describe("evaluatePredictionAccuracy", () => {
    it("returns empty metrics when evaluation set is empty", () => {
      const metrics = evaluatePredictionAccuracy([]);

      expect(metrics).toEqual({
        sampleCount: 0,
        mae: null,
        rmse: null,
        meanBias: null,
        maxAbsoluteError: null,
        withinTolerance5MinCount: 0,
        withinTolerance5MinRate: null,
      });
    });

    it("correctly computes MAE, RMSE, MeanBias, maxAbsoluteError, and tolerance rate", () => {
      // 3 items:
      // Item 1: predicted 10, actual 10 -> error: 0, abs: 0 (<= 5 min)
      // Item 2: predicted 15, actual 11 -> error: +4, abs: 4 (<= 5 min)
      // Item 3: predicted 8, actual 16 -> error: -8, abs: 8 (> 5 min)
      const data = [
        { predictedMinutes: 10, actualWaitMinutes: 10 },
        { predictedMinutes: 15, actualWaitMinutes: 11 },
        { predictedMinutes: 8, actualWaitMinutes: 16 },
      ];

      const metrics = evaluatePredictionAccuracy(data);

      expect(metrics.sampleCount).toBe(3);

      // MAE = (0 + 4 + 8) / 3 = 12 / 3 = 4.0
      expect(metrics.mae).toBe(4.0);

      // RMSE = sqrt((0^2 + 4^2 + (-8)^2) / 3) = sqrt((0 + 16 + 64) / 3) = sqrt(80/3) = sqrt(26.6667) = 5.16
      expect(metrics.rmse).toBe(5.16);

      // MeanBias = (0 + 4 - 8) / 3 = -4 / 3 = -1.33 (underestimated on average by 1.33 min)
      expect(metrics.meanBias).toBe(-1.33);

      // Max absolute error = 8
      expect(metrics.maxAbsoluteError).toBe(8.0);

      // Within 5 minutes: Item 1 (0) and Item 2 (4) -> 2 out of 3 = 0.6667
      expect(metrics.withinTolerance5MinCount).toBe(2);
      expect(metrics.withinTolerance5MinRate).toBe(0.6667);
    });
  });

  describe("simulateQueueEvaluation (Offline Replay Without Future Leakage)", () => {
    it("replays queue events chronologically and uses only prior completions for service duration", () => {
      const base = new Date("2026-10-22T09:00:00Z");

      // Ticket 1: arrives 09:00, called 09:00 (no one ahead), started 09:00, completed 09:06 (6 min)
      // Ticket 2: arrives 09:02, called 09:06, started 09:06, completed 09:12 (6 min)
      // Ticket 3: arrives 09:05, called 09:12, started 09:12, completed 09:18 (6 min)
      // Ticket 4: arrives 09:10, cancelled before being called (calledAt = null)
      const tickets = [
        {
          id: "t-1",
          number: 1,
          createdAt: new Date(base.getTime()),
          calledAt: new Date(base.getTime()),
          startedAt: new Date(base.getTime()),
          completedAt: new Date(base.getTime() + 6 * 60 * 1000), // 09:06
        },
        {
          id: "t-2",
          number: 2,
          createdAt: new Date(base.getTime() + 2 * 60 * 1000), // 09:02
          calledAt: new Date(base.getTime() + 6 * 60 * 1000), // 09:06 (waited 4 min)
          startedAt: new Date(base.getTime() + 6 * 60 * 1000),
          completedAt: new Date(base.getTime() + 12 * 60 * 1000), // 09:12
        },
        {
          id: "t-3",
          number: 3,
          createdAt: new Date(base.getTime() + 5 * 60 * 1000), // 09:05
          calledAt: new Date(base.getTime() + 12 * 60 * 1000), // 09:12 (waited 7 min)
          startedAt: new Date(base.getTime() + 12 * 60 * 1000),
          completedAt: new Date(base.getTime() + 18 * 60 * 1000),
        },
        {
          id: "t-4",
          number: 4,
          createdAt: new Date(base.getTime() + 10 * 60 * 1000), // 09:10
          calledAt: null, // cancelled
          startedAt: null,
          completedAt: null,
        },
      ];

      const result = simulateQueueEvaluation(tickets);

      // t-4 was cancelled, so 3 tickets were evaluated, 1 skipped
      expect(result.skippedRecordsCount).toBe(1);
      expect(result.evaluatedRecords).toHaveLength(3);

      // For t-1: arrived at 09:00, called immediately at 09:00 -> actual 0 min, predicted 0 min
      expect(result.evaluatedRecords[0].ticketId).toBe("t-1");
      expect(result.evaluatedRecords[0].actualWaitMinutes).toBe(0);
      expect(result.evaluatedRecords[0].predictedMinutes).toBe(0);

      // For t-2: arrived at 09:02. At 09:02, no ticket has completed yet (t-1 completes at 09:06).
      // So t-2 strictly uses fallback 5 min (NO future leakage of t-1's 6 min duration!).
      // At 09:02, t-1 started at 09:00 (elapsed: 2 min, remaining: 5 - 2 = 3 min).
      // t-2 predicted wait: 3 min. Actual wait: 4 min. Absolute error: 1 min.
      expect(result.evaluatedRecords[1].ticketId).toBe("t-2");
      expect(result.evaluatedRecords[1].predictedMinutes).toBe(3);
      expect(result.evaluatedRecords[1].actualWaitMinutes).toBe(4);
      expect(result.evaluatedRecords[1].absoluteErrorMinutes).toBe(1);

      // Metrics exist and are computed accurately
      expect(result.metrics.sampleCount).toBe(3);
      expect(result.metrics.mae).toBeDefined();
      expect(result.metrics.rmse).toBeDefined();
    });
  });

  describe("filterValidPersistedEvaluationRecords", () => {
    it("extracts valid persisted records, calculates floating-point actual waiting minutes without rounding, and calculates error", () => {
      const records = [
        {
          id: "t-1",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:12:30.000Z"), // exactly 12.5 minutes
          initialEstimatedWaitMinutes: 15,
        },
      ];

      const valid = filterValidPersistedEvaluationRecords(records);

      expect(valid).toHaveLength(1);
      expect(valid[0].ticketId).toBe("t-1");
      expect(valid[0].initialEstimatedWaitMinutes).toBe(15);
      expect(valid[0].actualWaitMinutes).toBe(12.5);
      expect(valid[0].errorMinutes).toBe(2.5); // 15 - 12.5 = 2.5
      expect(valid[0].absoluteErrorMinutes).toBe(2.5);
    });

    it("excludes records with null or undefined initialEstimatedWaitMinutes (legacy tickets)", () => {
      const records = [
        {
          id: "t-legacy-1",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: null,
        },
        {
          id: "t-legacy-2",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: undefined as unknown as null,
        },
      ];

      expect(filterValidPersistedEvaluationRecords(records)).toHaveLength(0);
    });

    it("excludes records with null or undefined calledAt (uncalled or legacy tickets)", () => {
      const records = [
        {
          id: "t-uncalled-1",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: null,
          initialEstimatedWaitMinutes: 10,
        },
        {
          id: "t-uncalled-2",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: undefined as unknown as null,
          initialEstimatedWaitMinutes: 10,
        },
      ];

      expect(filterValidPersistedEvaluationRecords(records)).toHaveLength(0);
    });

    it("excludes records with null or undefined createdAt", () => {
      const records = [
        {
          id: "t-no-create",
          createdAt: null,
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: 5,
        },
      ];

      expect(filterValidPersistedEvaluationRecords(records)).toHaveLength(0);
    });

    it("excludes records with negative initialEstimatedWaitMinutes", () => {
      const records = [
        {
          id: "t-neg",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: -5,
        },
      ];

      expect(filterValidPersistedEvaluationRecords(records)).toHaveLength(0);
    });

    it("excludes records with NaN or non-number initialEstimatedWaitMinutes", () => {
      const records = [
        {
          id: "t-nan",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: NaN,
        },
        {
          id: "t-str",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: "five" as unknown as number,
        },
      ];

      expect(filterValidPersistedEvaluationRecords(records)).toHaveLength(0);
    });

    it("excludes records with invalid date strings or NaN timestamps", () => {
      const records = [
        {
          id: "t-bad-date",
          createdAt: new Date("invalid-date"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: 5,
        },
      ];

      expect(filterValidPersistedEvaluationRecords(records)).toHaveLength(0);
    });

    it("excludes records where calledAt precedes createdAt", () => {
      const records = [
        {
          id: "t-inverted",
          createdAt: new Date("2026-10-22T10:10:00.000Z"),
          calledAt: new Date("2026-10-22T10:00:00.000Z"),
          initialEstimatedWaitMinutes: 5,
        },
      ];

      expect(filterValidPersistedEvaluationRecords(records)).toHaveLength(0);
    });

    it("falls back to record.id when record.ticketId is omitted, and prefers ticketId when provided", () => {
      const records = [
        {
          id: "fallback-id-1",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: 5,
        },
        {
          ticketId: "explicit-ticket-id-2",
          id: "fallback-id-2",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: 5,
        },
      ];

      const valid = filterValidPersistedEvaluationRecords(records);
      expect(valid[0].ticketId).toBe("fallback-id-1");
      expect(valid[1].ticketId).toBe("explicit-ticket-id-2");
    });
  });

  describe("evaluatePersistedPredictions", () => {
    it("returns empty metrics and 0 skipped when input array is empty", () => {
      const result = evaluatePersistedPredictions([]);

      expect(result.evaluatedRecords).toEqual([]);
      expect(result.skippedRecordsCount).toBe(0);
      expect(result.metrics).toEqual({
        sampleCount: 0,
        mae: null,
        rmse: null,
        meanBias: null,
        maxAbsoluteError: null,
        withinTolerance5MinCount: 0,
        withinTolerance5MinRate: null,
      });
    });

    it("returns empty metrics and counts skipped records when all records are invalid/legacy", () => {
      const records = [
        {
          id: "leg-1",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: null,
          initialEstimatedWaitMinutes: null,
        },
        {
          id: "leg-2",
          createdAt: new Date("2026-10-22T10:00:00.000Z"),
          calledAt: new Date("2026-10-22T10:05:00.000Z"),
          initialEstimatedWaitMinutes: -2,
        },
      ];

      const result = evaluatePersistedPredictions(records);

      expect(result.evaluatedRecords).toHaveLength(0);
      expect(result.skippedRecordsCount).toBe(2);
      expect(result.metrics.sampleCount).toBe(0);
      expect(result.metrics.mae).toBeNull();
    });

    it("correctly evaluates a mixed dataset of valid and legacy/invalid tickets", () => {
      const base = new Date("2026-10-22T10:00:00.000Z").getTime();

      const records = [
        // Valid 1: predicted 10, actual 10.5 (called after 10m 30s) -> error: -0.5, abs: 0.5 (within 5m)
        {
          id: "t-1",
          createdAt: new Date(base),
          calledAt: new Date(base + 10.5 * 60 * 1000),
          initialEstimatedWaitMinutes: 10,
        },
        // Valid 2: predicted 15, actual 12.0 (called after 12m) -> error: +3.0, abs: 3.0 (within 5m)
        {
          id: "t-2",
          createdAt: new Date(base),
          calledAt: new Date(base + 12.0 * 60 * 1000),
          initialEstimatedWaitMinutes: 15,
        },
        // Valid 3: predicted 5, actual 15.0 (called after 15m) -> error: -10.0, abs: 10.0 (> 5m)
        {
          id: "t-3",
          createdAt: new Date(base),
          calledAt: new Date(base + 15.0 * 60 * 1000),
          initialEstimatedWaitMinutes: 5,
        },
        // Invalid 1: legacy ticket without initial estimate
        {
          id: "t-leg",
          createdAt: new Date(base),
          calledAt: new Date(base + 10 * 60 * 1000),
          initialEstimatedWaitMinutes: null,
        },
        // Invalid 2: cancelled ticket without calledAt
        {
          id: "t-cancel",
          createdAt: new Date(base),
          calledAt: null,
          initialEstimatedWaitMinutes: 8,
        },
      ];

      const result = evaluatePersistedPredictions(records);

      expect(result.evaluatedRecords).toHaveLength(3);
      expect(result.skippedRecordsCount).toBe(2);

      // Sample count = 3
      expect(result.metrics.sampleCount).toBe(3);

      // MAE = (0.5 + 3.0 + 10.0) / 3 = 13.5 / 3 = 4.5
      expect(result.metrics.mae).toBe(4.5);

      // RMSE = sqrt((0.25 + 9.0 + 100.0) / 3) = sqrt(109.25 / 3) = sqrt(36.4167) = 6.03
      expect(result.metrics.rmse).toBe(6.03);

      // Mean Bias = (-0.5 + 3.0 - 10.0) / 3 = -7.5 / 3 = -2.5
      expect(result.metrics.meanBias).toBe(-2.5);

      // Max Absolute Error = 10.0
      expect(result.metrics.maxAbsoluteError).toBe(10.0);

      // Within 5 minutes: t-1 (0.5) and t-2 (3.0) -> 2 out of 3 = 0.6667
      expect(result.metrics.withinTolerance5MinCount).toBe(2);
      expect(result.metrics.withinTolerance5MinRate).toBe(0.6667);
    });

    it("preserves sub-minute precision in actual waiting times to avoid premature rounding distortion", () => {
      const base = new Date("2026-10-22T10:00:00.000Z").getTime();

      // Waited 4 minutes and 45 seconds = 4.75 minutes
      // If prematurely rounded to 5, error would be 5 - 5 = 0.
      // With true precision, error is 5 - 4.75 = 0.25.
      const records = [
        {
          id: "t-subminute",
          createdAt: new Date(base),
          calledAt: new Date(base + 4.75 * 60 * 1000),
          initialEstimatedWaitMinutes: 5,
        },
      ];

      const result = evaluatePersistedPredictions(records);

      expect(result.evaluatedRecords[0].actualWaitMinutes).toBe(4.75);
      expect(result.evaluatedRecords[0].errorMinutes).toBe(0.25);
      expect(result.metrics.mae).toBe(0.25);
    });
  });

  describe("fetchPersistedEvaluationTickets", () => {
    it("queries tickets with non-null calledAt and initialEstimatedWaitMinutes", async () => {
      const mockFindMany = vi.fn().mockResolvedValue([
        {
          id: "t-1",
          createdAt: new Date("2026-10-22T10:00:00Z"),
          calledAt: new Date("2026-10-22T10:10:00Z"),
          initialEstimatedWaitMinutes: 10,
        },
      ]);
      const mockPrisma = {
        ticket: {
          findMany: mockFindMany,
        },
      };

      const result = await fetchPersistedEvaluationTickets(mockPrisma);

      expect(result).toHaveLength(1);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          calledAt: { not: null },
          initialEstimatedWaitMinutes: { not: null },
        },
        select: {
          id: true,
          createdAt: true,
          calledAt: true,
          initialEstimatedWaitMinutes: true,
        },
        orderBy: { createdAt: "desc" },
        take: undefined,
      });
    });

    it("passes queueId and date filters when provided", async () => {
      const mockFindMany = vi.fn().mockResolvedValue([]);
      const mockPrisma = {
        ticket: {
          findMany: mockFindMany,
        },
      };

      const startDate = new Date("2026-10-20T00:00:00Z");
      const endDate = new Date("2026-10-22T23:59:59Z");

      await fetchPersistedEvaluationTickets(mockPrisma, {
        queueId: "queue-123",
        startDate,
        endDate,
        limit: 50,
      });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          calledAt: { not: null },
          initialEstimatedWaitMinutes: { not: null },
          queueId: "queue-123",
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          id: true,
          createdAt: true,
          calledAt: true,
          initialEstimatedWaitMinutes: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });
  });
});
