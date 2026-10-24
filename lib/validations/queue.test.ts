import { describe, expect, it } from "vitest";
import { createQueueSchema, updateQueueSchema } from "./queue";

describe("Queue Validations (lib/validations/queue.ts)", () => {
  describe("createQueueSchema", () => {
    it("accepts valid queue without capacity limits (defaults to undefined)", () => {
      const result = createQueueSchema.safeParse({ name: "General Queue" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("General Queue");
        expect(result.data.maxWaitingTickets).toBeUndefined();
        expect(result.data.maxDailyTickets).toBeUndefined();
      }
    });

    it("accepts null for capacity limits", () => {
      const result = createQueueSchema.safeParse({
        name: "General Queue",
        maxWaitingTickets: null,
        maxDailyTickets: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxWaitingTickets).toBeNull();
        expect(result.data.maxDailyTickets).toBeNull();
      }
    });

    it("accepts valid positive integers within range", () => {
      const result = createQueueSchema.safeParse({
        name: "General Queue",
        maxWaitingTickets: 50,
        maxDailyTickets: 200,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxWaitingTickets).toBe(50);
        expect(result.data.maxDailyTickets).toBe(200);
      }
    });

    it("accepts maximum allowed values (10,000 waiting, 100,000 daily)", () => {
      const result = createQueueSchema.safeParse({
        name: "General Queue",
        maxWaitingTickets: 10000,
        maxDailyTickets: 100000,
      });
      expect(result.success).toBe(true);
    });

    it("rejects 0 as capacity limit (limits must be at least 1 positive integer)", () => {
      const resultWaiting = createQueueSchema.safeParse({
        name: "General Queue",
        maxWaitingTickets: 0,
      });
      expect(resultWaiting.success).toBe(false);
      if (!resultWaiting.success) {
        expect(resultWaiting.error.flatten().fieldErrors.maxWaitingTickets).toContain(
          "Max waiting tickets must be at least 1",
        );
      }

      const resultDaily = createQueueSchema.safeParse({
        name: "General Queue",
        maxDailyTickets: 0,
      });
      expect(resultDaily.success).toBe(false);
      if (!resultDaily.success) {
        expect(resultDaily.error.flatten().fieldErrors.maxDailyTickets).toContain(
          "Max daily tickets must be at least 1",
        );
      }
    });

    it("rejects negative capacity limits", () => {
      const result = createQueueSchema.safeParse({
        name: "General Queue",
        maxWaitingTickets: -1,
        maxDailyTickets: -10,
      });
      expect(result.success).toBe(false);
    });

    it("rejects decimal numbers", () => {
      const result = createQueueSchema.safeParse({
        name: "General Queue",
        maxWaitingTickets: 10.5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.maxWaitingTickets).toContain(
          "Max waiting tickets must be an integer",
        );
      }
    });

    it("rejects values exceeding maximums (> 10,000 waiting, > 100,000 daily)", () => {
      const resultWaiting = createQueueSchema.safeParse({
        name: "General Queue",
        maxWaitingTickets: 10001,
      });
      expect(resultWaiting.success).toBe(false);

      const resultDaily = createQueueSchema.safeParse({
        name: "General Queue",
        maxDailyTickets: 100001,
      });
      expect(resultDaily.success).toBe(false);
    });

    it("rejects non-numeric strings", () => {
      const result = createQueueSchema.safeParse({
        name: "General Queue",
        maxWaitingTickets: "50",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateQueueSchema", () => {
    it("accepts updating maxWaitingTickets alone", () => {
      const result = updateQueueSchema.safeParse({
        maxWaitingTickets: 25,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxWaitingTickets).toBe(25);
      }
    });

    it("accepts updating maxDailyTickets alone", () => {
      const result = updateQueueSchema.safeParse({
        maxDailyTickets: 500,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxDailyTickets).toBe(500);
      }
    });

    it("accepts clearing capacity limits to null", () => {
      const result = updateQueueSchema.safeParse({
        maxWaitingTickets: null,
        maxDailyTickets: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxWaitingTickets).toBeNull();
        expect(result.data.maxDailyTickets).toBeNull();
      }
    });

    it("rejects empty update object", () => {
      const result = updateQueueSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects invalid capacity values on update", () => {
      const result = updateQueueSchema.safeParse({
        maxWaitingTickets: -5,
      });
      expect(result.success).toBe(false);
    });
  });
});
