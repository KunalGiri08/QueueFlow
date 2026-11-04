import type { QueueItem } from "./types";

export const QUEUE_VALIDATION_CONSTRAINTS = {
  MIN_WAITING_TICKETS: 1,
  MAX_WAITING_TICKETS: 10_000,
  MIN_DAILY_TICKETS: 1,
  MAX_DAILY_TICKETS: 100_000,
} as const;

export interface ValidationSuccess<T> {
  isValid: true;
  value: T;
}

export interface ValidationFailure {
  isValid: false;
  error: string;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface QueueFormValidationResult {
  isValid: boolean;
  error?: string;
  trimmedName: string;
  parsedMaxWaiting: number | null;
  parsedMaxDaily: number | null;
}

/**
 * Validates a queue name.
 * Name must be non-empty after trimming.
 */
export function validateQueueName(name: string): ValidationResult<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: "Queue name is required.",
    };
  }
  return {
    isValid: true,
    value: trimmed,
  };
}

/**
 * Validates the max waiting tickets capacity input.
 * Empty string represents unlimited admittance (null).
 * If non-empty, must be an integer between 1 and 10,000.
 */
export function validateMaxWaitingTickets(value: string): ValidationResult<number | null> {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { isValid: true, value: null };
  }

  const parsed = Number(trimmed);
  if (
    !Number.isInteger(parsed) ||
    parsed < QUEUE_VALIDATION_CONSTRAINTS.MIN_WAITING_TICKETS ||
    parsed > QUEUE_VALIDATION_CONSTRAINTS.MAX_WAITING_TICKETS
  ) {
    return {
      isValid: false,
      error: "Max waiting tickets must be an integer between 1 and 10,000.",
    };
  }

  return { isValid: true, value: parsed };
}

/**
 * Validates the max daily tickets capacity input.
 * Empty string represents unlimited admittance (null).
 * If non-empty, must be an integer between 1 and 100,000.
 */
export function validateMaxDailyTickets(value: string): ValidationResult<number | null> {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { isValid: true, value: null };
  }

  const parsed = Number(trimmed);
  if (
    !Number.isInteger(parsed) ||
    parsed < QUEUE_VALIDATION_CONSTRAINTS.MIN_DAILY_TICKETS ||
    parsed > QUEUE_VALIDATION_CONSTRAINTS.MAX_DAILY_TICKETS
  ) {
    return {
      isValid: false,
      error: "Max daily tickets must be an integer between 1 and 100,000.",
    };
  }

  return { isValid: true, value: parsed };
}

/**
 * Validates complete queue form inputs (name, max waiting, max daily) in sequential priority order.
 */
export function validateQueueFormInputs(
  name: string,
  maxWaiting: string,
  maxDaily: string,
): QueueFormValidationResult {
  const nameResult = validateQueueName(name);
  if (!nameResult.isValid) {
    return {
      isValid: false,
      error: nameResult.error,
      trimmedName: "",
      parsedMaxWaiting: null,
      parsedMaxDaily: null,
    };
  }

  const waitingResult = validateMaxWaitingTickets(maxWaiting);
  if (!waitingResult.isValid) {
    return {
      isValid: false,
      error: waitingResult.error,
      trimmedName: nameResult.value,
      parsedMaxWaiting: null,
      parsedMaxDaily: null,
    };
  }

  const dailyResult = validateMaxDailyTickets(maxDaily);
  if (!dailyResult.isValid) {
    return {
      isValid: false,
      error: dailyResult.error,
      trimmedName: nameResult.value,
      parsedMaxWaiting: waitingResult.value,
      parsedMaxDaily: null,
    };
  }

  return {
    isValid: true,
    trimmedName: nameResult.value,
    parsedMaxWaiting: waitingResult.value,
    parsedMaxDaily: dailyResult.value,
  };
}

/**
 * Sorts queues alphabetically by name using numeric-aware collation.
 */
export function sortQueuesByName(queues: QueueItem[]): QueueItem[] {
  return [...queues].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/**
 * Normalizes queue capacity limits in API responses so missing/non-numeric values are explicitly null.
 */
export function normalizeQueueItem(rawQueue: QueueItem): QueueItem {
  return {
    ...rawQueue,
    maxWaitingTickets:
      typeof rawQueue.maxWaitingTickets === "number"
        ? rawQueue.maxWaitingTickets
        : null,
    maxDailyTickets:
      typeof rawQueue.maxDailyTickets === "number"
        ? rawQueue.maxDailyTickets
        : null,
  };
}

/**
 * Extracts the most relevant user-facing error message from queue API error responses.
 * Prioritizes field-specific validation errors for name, maxWaitingTickets, and maxDailyTickets.
 */
export function parseQueueApiError(
  data: unknown,
  fallbackMessage = "Invalid queue parameters.",
): string {
  if (typeof data !== "object" || data === null) {
    return fallbackMessage;
  }

  const errorObj = data as {
    error?: unknown;
    details?: {
      fieldErrors?: {
        name?: unknown;
        maxWaitingTickets?: unknown;
        maxDailyTickets?: unknown;
      };
    };
  };

  const nameError = Array.isArray(errorObj.details?.fieldErrors?.name)
    ? errorObj.details?.fieldErrors?.name[0]
    : undefined;
  if (typeof nameError === "string" && nameError.length > 0) {
    return nameError;
  }

  const waitingError = Array.isArray(errorObj.details?.fieldErrors?.maxWaitingTickets)
    ? errorObj.details?.fieldErrors?.maxWaitingTickets[0]
    : undefined;
  if (typeof waitingError === "string" && waitingError.length > 0) {
    return waitingError;
  }

  const dailyError = Array.isArray(errorObj.details?.fieldErrors?.maxDailyTickets)
    ? errorObj.details?.fieldErrors?.maxDailyTickets[0]
    : undefined;
  if (typeof dailyError === "string" && dailyError.length > 0) {
    return dailyError;
  }

  if (typeof errorObj.error === "string" && errorObj.error.length > 0) {
    return errorObj.error;
  }

  return fallbackMessage;
}

