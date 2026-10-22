import {
  calculateAverageServiceDuration,
  calculateEstimatedWaitMinutes,
  DEFAULT_HISTORY_WINDOW_SIZE,
  DEFAULT_SERVICE_DURATION_MINUTES,
} from "@/lib/services/prediction.service";

export interface EvaluationRecordInput {
  ticketId: string;
  createdAt: Date | string | null;
  calledAt: Date | string | null;
  predictedMinutes: number | null;
}

export interface ValidEvaluationRecord {
  ticketId: string;
  createdAt: Date;
  calledAt: Date;
  predictedMinutes: number;
  actualWaitMinutes: number;
  absoluteErrorMinutes: number;
  errorMinutes: number; // predicted - actual
}

export interface PersistedTicketEvaluationRecord {
  id?: string;
  ticketId?: string;
  createdAt: Date | string | null;
  calledAt: Date | string | null;
  initialEstimatedWaitMinutes: number | null;
}

export interface ValidPersistedEvaluationRecord {
  ticketId?: string;
  createdAt: Date;
  calledAt: Date;
  initialEstimatedWaitMinutes: number;
  actualWaitMinutes: number;
  errorMinutes: number; // initialEstimatedWaitMinutes - actualWaitMinutes
  absoluteErrorMinutes: number;
}

export interface PersistedPredictionEvaluationResult {
  evaluatedRecords: ValidPersistedEvaluationRecord[];
  skippedRecordsCount: number;
  metrics: PredictionEvaluationMetrics;
}

export interface FetchPersistedEvaluationTicketsOptions {
  queueId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export type EvaluatablePredictionItem = {
  actualWaitMinutes: number;
  predictedMinutes?: number;
  initialEstimatedWaitMinutes?: number;
};

export interface PredictionEvaluationMetrics {
  sampleCount: number;
  mae: number | null; // Mean Absolute Error in minutes
  rmse: number | null; // Root Mean Squared Error in minutes
  meanBias: number | null; // Mean Error: > 0 indicates overestimation, < 0 underestimation
  maxAbsoluteError: number | null;
  withinTolerance5MinCount: number;
  withinTolerance5MinRate: number | null; // Proportion within 5 minutes of actual [0.0, 1.0]
}

export interface HistoricalTicketEvent {
  id: string;
  number: number;
  createdAt: Date;
  calledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Calculates actual waiting time in minutes: (calledAt - createdAt).
 *
 * Requirements:
 * - Both timestamps must be valid dates.
 * - calledAt must be >= createdAt.
 * - Note: This is waiting time (time in line until called). It is NOT service duration
 *   (which is completedAt - startedAt).
 */
export function calculateActualWaitMinutes(
  createdAt: Date | string | null,
  calledAt: Date | string | null,
): number | null {
  if (!createdAt || !calledAt) {
    return null;
  }

  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const called = calledAt instanceof Date ? calledAt : new Date(calledAt);

  if (
    isNaN(created.getTime()) ||
    isNaN(called.getTime()) ||
    called.getTime() < created.getTime()
  ) {
    return null;
  }

  return (called.getTime() - created.getTime()) / (1000 * 60);
}

/**
 * Filters and validates evaluation candidate records.
 * Records missing predicted minutes, legacy tickets with null calledAt, or invalid timestamps are excluded.
 */
export function filterValidEvaluationRecords(
  records: EvaluationRecordInput[],
): ValidEvaluationRecord[] {
  const valid: ValidEvaluationRecord[] = [];

  for (const record of records) {
    if (
      record.predictedMinutes === null ||
      record.predictedMinutes === undefined ||
      isNaN(record.predictedMinutes) ||
      record.predictedMinutes < 0
    ) {
      continue;
    }

    const actualWaitMinutes = calculateActualWaitMinutes(
      record.createdAt,
      record.calledAt,
    );

    if (actualWaitMinutes === null) {
      continue;
    }

    const created =
      record.createdAt instanceof Date
        ? record.createdAt
        : new Date(record.createdAt!);
    const called =
      record.calledAt instanceof Date
        ? record.calledAt
        : new Date(record.calledAt!);

    const errorMinutes = record.predictedMinutes - actualWaitMinutes;
    const absoluteErrorMinutes = Math.abs(errorMinutes);

    valid.push({
      ticketId: record.ticketId,
      createdAt: created,
      calledAt: called,
      predictedMinutes: record.predictedMinutes,
      actualWaitMinutes,
      errorMinutes,
      absoluteErrorMinutes,
    });
  }

  return valid;
}

/**
 * Filters and validates persisted ticket evaluation records.
 *
 * Excludes records where:
 * - initialEstimatedWaitMinutes is null, undefined, NaN, or negative (< 0).
 * - calledAt or createdAt is null, undefined, or an invalid date.
 * - calledAt precedes createdAt chronologically.
 *
 * Actual waiting time is calculated with full precision as:
 * (calledAt - createdAt) in milliseconds / 60_000 (minutes).
 * Individual wait values are NOT prematurely rounded to prevent skewing evaluation metrics.
 */
export function filterValidPersistedEvaluationRecords(
  records: PersistedTicketEvaluationRecord[],
): ValidPersistedEvaluationRecord[] {
  const valid: ValidPersistedEvaluationRecord[] = [];

  for (const record of records) {
    if (
      record.initialEstimatedWaitMinutes === null ||
      record.initialEstimatedWaitMinutes === undefined ||
      typeof record.initialEstimatedWaitMinutes !== "number" ||
      isNaN(record.initialEstimatedWaitMinutes) ||
      record.initialEstimatedWaitMinutes < 0
    ) {
      continue;
    }

    const actualWaitMinutes = calculateActualWaitMinutes(
      record.createdAt,
      record.calledAt,
    );

    if (actualWaitMinutes === null) {
      continue;
    }

    const created =
      record.createdAt instanceof Date
        ? record.createdAt
        : new Date(record.createdAt!);
    const called =
      record.calledAt instanceof Date
        ? record.calledAt
        : new Date(record.calledAt!);

    const errorMinutes = record.initialEstimatedWaitMinutes - actualWaitMinutes;
    const absoluteErrorMinutes = Math.abs(errorMinutes);

    valid.push({
      ticketId: record.ticketId ?? record.id,
      createdAt: created,
      calledAt: called,
      initialEstimatedWaitMinutes: record.initialEstimatedWaitMinutes,
      actualWaitMinutes,
      errorMinutes,
      absoluteErrorMinutes,
    });
  }

  return valid;
}

/**
 * Computes standard accuracy and error metrics (MAE, RMSE, Bias, Tolerance Rate)
 * from an array of prediction-actual pairs or validated evaluation records.
 */
export function evaluatePredictionAccuracy(
  records:
    | ValidEvaluationRecord[]
    | ValidPersistedEvaluationRecord[]
    | EvaluatablePredictionItem[],
): PredictionEvaluationMetrics {
  const n = records.length;

  if (n === 0) {
    return {
      sampleCount: 0,
      mae: null,
      rmse: null,
      meanBias: null,
      maxAbsoluteError: null,
      withinTolerance5MinCount: 0,
      withinTolerance5MinRate: null,
    };
  }

  let totalAbsError = 0;
  let totalSquaredError = 0;
  let totalError = 0;
  let maxAbsError = 0;
  let within5MinCount = 0;

  for (const item of records) {
    const predicted =
      "initialEstimatedWaitMinutes" in item &&
      item.initialEstimatedWaitMinutes !== undefined
        ? item.initialEstimatedWaitMinutes
        : "predictedMinutes" in item && item.predictedMinutes !== undefined
          ? item.predictedMinutes
          : 0;
    const error = predicted - item.actualWaitMinutes;
    const absError = Math.abs(error);

    totalAbsError += absError;
    totalSquaredError += error * error;
    totalError += error;

    if (absError > maxAbsError) {
      maxAbsError = absError;
    }

    if (absError <= 5.0) {
      within5MinCount += 1;
    }
  }

  const mae = totalAbsError / n;
  const rmse = Math.sqrt(totalSquaredError / n);
  const meanBias = totalError / n;
  const withinTolerance5MinRate = within5MinCount / n;

  return {
    sampleCount: n,
    mae: Number(mae.toFixed(2)),
    rmse: Number(rmse.toFixed(2)),
    meanBias: Number(meanBias.toFixed(2)),
    maxAbsoluteError: Number(maxAbsError.toFixed(2)),
    withinTolerance5MinCount: within5MinCount,
    withinTolerance5MinRate: Number(withinTolerance5MinRate.toFixed(4)),
  };
}

/**
 * Evaluates persisted ticket predictions against actual waiting times.
 *
 * Accepts an array of persisted ticket records (e.g. from the database), filters out
 * invalid/legacy/uncalled records, computes actual waiting times without premature rounding,
 * and calculates standard accuracy metrics (MAE, RMSE, Bias, Tolerance Rate).
 */
export function evaluatePersistedPredictions(
  records: PersistedTicketEvaluationRecord[],
): PersistedPredictionEvaluationResult {
  const evaluatedRecords = filterValidPersistedEvaluationRecords(records);
  const skippedRecordsCount = records.length - evaluatedRecords.length;
  const metrics = evaluatePredictionAccuracy(evaluatedRecords);

  return {
    evaluatedRecords,
    skippedRecordsCount,
    metrics,
  };
}

export interface ReplaySimulationResult {
  evaluatedRecords: ValidEvaluationRecord[];
  skippedRecordsCount: number;
  metrics: PredictionEvaluationMetrics;
}

/**
 * Replays an offline sequence of historical ticket events strictly without future-data leakage.
 *
 * Rules:
 * 1. At ticket creation time t_create:
 *    - Service history: only tickets completed STRICTLY BEFORE t_create (completedAt < t_create) are used.
 *    - Queue position: only tickets created before t_create and not yet called (calledAt > t_create or calledAt === null)
 *      are counted ahead.
 *    - Predictions are computed using the pure calculation function from Step 23C.
 * 2. At ticket called time t_called:
 *    - Actual wait time is measured as (t_called - t_create).
 * 3. Tickets without calledAt (e.g. cancelled while waiting or legacy tickets) cannot have a true
 *    waiting time to call, so they are safely skipped and reported.
 */
export function simulateQueueEvaluation(
  tickets: HistoricalTicketEvent[],
  windowSize: number = DEFAULT_HISTORY_WINDOW_SIZE,
): ReplaySimulationResult {
  const evaluatedRecords: ValidEvaluationRecord[] = [];
  let skippedRecordsCount = 0;

  // Sort tickets by createdAt ascending to ensure chronological event replay
  const sortedTickets = [...tickets].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  for (let i = 0; i < sortedTickets.length; i++) {
    const ticket = sortedTickets[i];

    // Cannot evaluate actual wait time if ticket was never called
    if (!ticket.calledAt) {
      skippedRecordsCount++;
      continue;
    }

    const tCreate = ticket.createdAt;

    // 1. Gather historical completions that occurred STRICTLY BEFORE tCreate (no future leakage)
    const priorCompletedTickets = sortedTickets
      .filter(
        (t) =>
          t.completedAt &&
          t.startedAt &&
          t.completedAt.getTime() < tCreate.getTime() &&
          t.completedAt.getTime() >= t.startedAt.getTime(),
      )
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())
      .slice(0, windowSize);

    const validPriorDurations = priorCompletedTickets.map(
      (t) => (t.completedAt!.getTime() - t.startedAt!.getTime()) / (1000 * 60),
    );

    const avgDuration = calculateAverageServiceDuration(
      validPriorDurations,
      DEFAULT_SERVICE_DURATION_MINUTES,
    );

    // 2. Count waiting tickets ahead at time tCreate
    // Tickets created before this ticket that were either not yet called at tCreate or called after tCreate
    const peopleAhead = sortedTickets.filter(
      (t) =>
        t.number < ticket.number &&
        t.createdAt.getTime() < tCreate.getTime() &&
        (t.calledAt === null || t.calledAt.getTime() > tCreate.getTime()),
    ).length;

    // 3. Check if there was an active ticket being served at time tCreate
    const activeServingTicket = sortedTickets.find(
      (t) =>
        t.id !== ticket.id &&
        t.startedAt &&
        t.startedAt.getTime() <= tCreate.getTime() &&
        (t.completedAt === null || t.completedAt.getTime() > tCreate.getTime()),
    );

    const predicted = calculateEstimatedWaitMinutes({
      ticketStatus: "WAITING",
      peopleAhead,
      averageServiceDurationMinutes: avgDuration,
      activeTicket: activeServingTicket
        ? {
            status: "SERVING",
            startedAt: activeServingTicket.startedAt,
          }
        : null,
      queueIsActive: true,
      now: tCreate,
    });

    if (predicted === null) {
      skippedRecordsCount++;
      continue;
    }

    const actualWaitMinutes = calculateActualWaitMinutes(
      ticket.createdAt,
      ticket.calledAt,
    );

    if (actualWaitMinutes === null) {
      skippedRecordsCount++;
      continue;
    }

    const errorMinutes = predicted - actualWaitMinutes;
    const absoluteErrorMinutes = Math.abs(errorMinutes);

    evaluatedRecords.push({
      ticketId: ticket.id,
      createdAt: ticket.createdAt,
      calledAt: ticket.calledAt,
      predictedMinutes: predicted,
      actualWaitMinutes,
      errorMinutes,
      absoluteErrorMinutes,
    });
  }

  const metrics = evaluatePredictionAccuracy(evaluatedRecords);

  return {
    evaluatedRecords,
    skippedRecordsCount,
    metrics,
  };
}

/**
 * Queries persisted candidate tickets for offline accuracy evaluation.
 * Kept strictly isolated from pure metric computation functions.
 * Only selects required timestamp and estimate fields — does not expose customer PII.
 */
export async function fetchPersistedEvaluationTickets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prismaClient?: any,
  options?: FetchPersistedEvaluationTicketsOptions,
): Promise<PersistedTicketEvaluationRecord[]> {
  const db = prismaClient ?? (await import("@/lib/prisma")).prisma;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    calledAt: { not: null },
    initialEstimatedWaitMinutes: { not: null },
  };

  if (options?.queueId) {
    where.queueId = options.queueId;
  }

  if (options?.startDate || options?.endDate) {
    where.createdAt = {};
    if (options.startDate) {
      where.createdAt.gte = options.startDate;
    }
    if (options.endDate) {
      where.createdAt.lte = options.endDate;
    }
  }

  return db.ticket.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      calledAt: true,
      initialEstimatedWaitMinutes: true,
    },
    orderBy: { createdAt: "desc" },
    take: options?.limit,
  });
}

