import { describe, it, expect } from "vitest";
import {
  validateQueueName,
  validateMaxWaitingTickets,
  validateMaxDailyTickets,
  validateQueueFormInputs,
  sortQueuesByName,
  normalizeQueueItem,
  parseQueueApiError,
  QUEUE_VALIDATION_CONSTRAINTS,
} from "./validation";
import type { QueueItem } from "./types";

describe("components/admin/queues/validation", () => {
  describe("validateQueueName", () => {
    it("returns valid trimmed name when given valid text", () => {
      const result = validateQueueName("  General Walk-in  ");
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.value).toBe("General Walk-in");
      }
    });

    it("rejects empty string with required error", () => {
      const result = validateQueueName("");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe("Queue name is required.");
      }
    });

    it("rejects whitespace-only string with required error", () => {
      const result = validateQueueName("    ");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe("Queue name is required.");
      }
    });
  });

  describe("validateMaxWaitingTickets", () => {
    it("returns null for empty or whitespace-only string (unlimited)", () => {
      expect(validateMaxWaitingTickets("")).toEqual({ isValid: true, value: null });
      expect(validateMaxWaitingTickets("   ")).toEqual({ isValid: true, value: null });
    });

    it("accepts valid integers within bounds [1, 10000]", () => {
      expect(validateMaxWaitingTickets("1")).toEqual({ isValid: true, value: 1 });
      expect(validateMaxWaitingTickets(" 50 ")).toEqual({ isValid: true, value: 50 });
      expect(validateMaxWaitingTickets("10000")).toEqual({
        isValid: true,
        value: QUEUE_VALIDATION_CONSTRAINTS.MAX_WAITING_TICKETS,
      });
    });

    it("rejects values less than 1", () => {
      const result = validateMaxWaitingTickets("0");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max waiting tickets must be an integer between 1 and 10,000.",
        );
      }
    });

    it("rejects negative numbers", () => {
      const result = validateMaxWaitingTickets("-5");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max waiting tickets must be an integer between 1 and 10,000.",
        );
      }
    });

    it("rejects values greater than 10,000", () => {
      const result = validateMaxWaitingTickets("10001");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max waiting tickets must be an integer between 1 and 10,000.",
        );
      }
    });

    it("rejects non-integer floating point numbers", () => {
      const result = validateMaxWaitingTickets("5.5");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max waiting tickets must be an integer between 1 and 10,000.",
        );
      }
    });

    it("rejects non-numeric strings", () => {
      const result = validateMaxWaitingTickets("abc");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max waiting tickets must be an integer between 1 and 10,000.",
        );
      }
    });
  });

  describe("validateMaxDailyTickets", () => {
    it("returns null for empty or whitespace-only string (unlimited)", () => {
      expect(validateMaxDailyTickets("")).toEqual({ isValid: true, value: null });
      expect(validateMaxDailyTickets("   ")).toEqual({ isValid: true, value: null });
    });

    it("accepts valid integers within bounds [1, 100000]", () => {
      expect(validateMaxDailyTickets("1")).toEqual({ isValid: true, value: 1 });
      expect(validateMaxDailyTickets(" 250 ")).toEqual({ isValid: true, value: 250 });
      expect(validateMaxDailyTickets("100000")).toEqual({
        isValid: true,
        value: QUEUE_VALIDATION_CONSTRAINTS.MAX_DAILY_TICKETS,
      });
    });

    it("rejects values less than 1", () => {
      const result = validateMaxDailyTickets("0");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max daily tickets must be an integer between 1 and 100,000.",
        );
      }
    });

    it("rejects negative numbers", () => {
      const result = validateMaxDailyTickets("-10");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max daily tickets must be an integer between 1 and 100,000.",
        );
      }
    });

    it("rejects values greater than 100,000", () => {
      const result = validateMaxDailyTickets("100001");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max daily tickets must be an integer between 1 and 100,000.",
        );
      }
    });

    it("rejects non-integer floating point numbers", () => {
      const result = validateMaxDailyTickets("12.34");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max daily tickets must be an integer between 1 and 100,000.",
        );
      }
    });

    it("rejects non-numeric strings", () => {
      const result = validateMaxDailyTickets("xyz");
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error).toBe(
          "Max daily tickets must be an integer between 1 and 100,000.",
        );
      }
    });
  });

  describe("validateQueueFormInputs", () => {
    it("validates successfully when name is provided and limits are empty", () => {
      const result = validateQueueFormInputs("Express Queue", "", "");
      expect(result).toEqual({
        isValid: true,
        trimmedName: "Express Queue",
        parsedMaxWaiting: null,
        parsedMaxDaily: null,
      });
    });

    it("validates successfully when name and both limits are valid integers", () => {
      const result = validateQueueFormInputs("Express Queue", "20", "150");
      expect(result).toEqual({
        isValid: true,
        trimmedName: "Express Queue",
        parsedMaxWaiting: 20,
        parsedMaxDaily: 150,
      });
    });

    it("stops and reports name error if name is empty", () => {
      const result = validateQueueFormInputs("  ", "20", "150");
      expect(result).toEqual({
        isValid: false,
        error: "Queue name is required.",
        trimmedName: "",
        parsedMaxWaiting: null,
        parsedMaxDaily: null,
      });
    });

    it("stops and reports maxWaitingTickets error if waiting limit is invalid", () => {
      const result = validateQueueFormInputs("Express Queue", "0", "150");
      expect(result).toEqual({
        isValid: false,
        error: "Max waiting tickets must be an integer between 1 and 10,000.",
        trimmedName: "Express Queue",
        parsedMaxWaiting: null,
        parsedMaxDaily: null,
      });
    });

    it("stops and reports maxDailyTickets error if daily limit is invalid", () => {
      const result = validateQueueFormInputs("Express Queue", "20", "100001");
      expect(result).toEqual({
        isValid: false,
        error: "Max daily tickets must be an integer between 1 and 100,000.",
        trimmedName: "Express Queue",
        parsedMaxWaiting: 20,
        parsedMaxDaily: null,
      });
    });
  });

  describe("sortQueuesByName", () => {
    it("sorts queues alphabetically with natural numeric collation", () => {
      const queues: QueueItem[] = [
        {
          id: "3",
          name: "Queue 10",
          serviceId: "s-1",
          nextTicketNumber: 1,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "1",
          name: "Queue 2",
          serviceId: "s-1",
          nextTicketNumber: 1,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "2",
          name: "Queue 1",
          serviceId: "s-1",
          nextTicketNumber: 1,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
      ];

      const sorted = sortQueuesByName(queues);
      expect(sorted.map((q) => q.name)).toEqual(["Queue 1", "Queue 2", "Queue 10"]);
    });

    it("is pure and does not mutate original array", () => {
      const original: QueueItem[] = [
        {
          id: "2",
          name: "B",
          serviceId: "s-1",
          nextTicketNumber: 1,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "1",
          name: "A",
          serviceId: "s-1",
          nextTicketNumber: 1,
          isActive: true,
          createdAt: "",
          updatedAt: "",
        },
      ];

      const sorted = sortQueuesByName(original);
      expect(sorted[0].name).toBe("A");
      expect(original[0].name).toBe("B");
    });
  });

  describe("normalizeQueueItem", () => {
    it("normalizes non-numeric or missing limits to null", () => {
      const raw: QueueItem = {
        id: "q-1",
        name: "Standard",
        serviceId: "s-1",
        nextTicketNumber: 1,
        isActive: true,
        createdAt: "2026-03-01",
        updatedAt: "2026-03-01",
        maxWaitingTickets: undefined,
        maxDailyTickets: undefined,
      };

      const normalized = normalizeQueueItem(raw);
      expect(normalized.maxWaitingTickets).toBeNull();
      expect(normalized.maxDailyTickets).toBeNull();
    });

    it("preserves valid numeric limits", () => {
      const raw: QueueItem = {
        id: "q-2",
        name: "VIP",
        serviceId: "s-1",
        nextTicketNumber: 5,
        isActive: true,
        createdAt: "2026-03-01",
        updatedAt: "2026-03-01",
        maxWaitingTickets: 15,
        maxDailyTickets: 100,
      };

      const normalized = normalizeQueueItem(raw);
      expect(normalized.maxWaitingTickets).toBe(15);
      expect(normalized.maxDailyTickets).toBe(100);
    });
  });

  describe("parseQueueApiError", () => {
    it("extracts name field error first", () => {
      const data = {
        details: {
          fieldErrors: {
            name: ["Queue name is required."],
            maxWaitingTickets: ["Waiting limit error"],
          },
        },
      };
      expect(parseQueueApiError(data)).toBe("Queue name is required.");
    });

    it("extracts maxWaitingTickets field error if name has no error", () => {
      const data = {
        details: {
          fieldErrors: {
            maxWaitingTickets: ["Max waiting tickets must be an integer between 1 and 10,000."],
            maxDailyTickets: ["Daily limit error"],
          },
        },
      };
      expect(parseQueueApiError(data)).toBe(
        "Max waiting tickets must be an integer between 1 and 10,000.",
      );
    });

    it("extracts maxDailyTickets field error if preceding fields have no error", () => {
      const data = {
        details: {
          fieldErrors: {
            maxDailyTickets: ["Max daily tickets must be an integer between 1 and 100,000."],
          },
        },
      };
      expect(parseQueueApiError(data)).toBe(
        "Max daily tickets must be an integer between 1 and 100,000.",
      );
    });

    it("falls back to generic error message from error property", () => {
      const data = {
        error: "Custom server failure message",
      };
      expect(parseQueueApiError(data)).toBe("Custom server failure message");
    });

    it("falls back to default fallback if payload is malformed or empty", () => {
      expect(parseQueueApiError(null)).toBe("Invalid queue parameters.");
      expect(parseQueueApiError({})).toBe("Invalid queue parameters.");
      expect(parseQueueApiError(undefined, "Custom fallback.")).toBe("Custom fallback.");
    });
  });
});

