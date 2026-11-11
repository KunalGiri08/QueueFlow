import { describe, expect, it } from "vitest";
import { createServiceSchema, updateServiceSchema } from "./service";

describe("Service Validations (lib/validations/service.ts)", () => {
  describe("createServiceSchema", () => {
    it("accepts valid service without admissionCutoffMinutes (defaults to undefined)", () => {
      const result = createServiceSchema.safeParse({ name: "General Inquiry" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("General Inquiry");
        expect(result.data.isActive).toBe(true);
        expect(result.data.admissionCutoffMinutes).toBeUndefined();
      }
    });

    it("accepts valid service with null admissionCutoffMinutes", () => {
      const result = createServiceSchema.safeParse({
        name: "General Inquiry",
        admissionCutoffMinutes: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.admissionCutoffMinutes).toBeNull();
      }
    });

    it("accepts valid service with 0 admissionCutoffMinutes", () => {
      const result = createServiceSchema.safeParse({
        name: "General Inquiry",
        admissionCutoffMinutes: 0,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.admissionCutoffMinutes).toBe(0);
      }
    });

    it("accepts valid positive integer up to 480", () => {
      const result30 = createServiceSchema.safeParse({
        name: "General Inquiry",
        admissionCutoffMinutes: 30,
      });
      expect(result30.success).toBe(true);

      const result480 = createServiceSchema.safeParse({
        name: "General Inquiry",
        admissionCutoffMinutes: 480,
      });
      expect(result480.success).toBe(true);
    });

    it("rejects negative admissionCutoffMinutes", () => {
      const result = createServiceSchema.safeParse({
        name: "General Inquiry",
        admissionCutoffMinutes: -5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.admissionCutoffMinutes).toContain(
          "Admission cutoff minutes cannot be negative",
        );
      }
    });

    it("rejects admissionCutoffMinutes exceeding 480", () => {
      const result = createServiceSchema.safeParse({
        name: "General Inquiry",
        admissionCutoffMinutes: 481,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.admissionCutoffMinutes).toContain(
          "Admission cutoff minutes cannot exceed 480 (8 hours)",
        );
      }
    });

    it("rejects decimal admissionCutoffMinutes", () => {
      const result = createServiceSchema.safeParse({
        name: "General Inquiry",
        admissionCutoffMinutes: 15.5,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.admissionCutoffMinutes).toContain(
          "Admission cutoff minutes must be an integer",
        );
      }
    });

    it("rejects non-numeric string admissionCutoffMinutes", () => {
      const result = createServiceSchema.safeParse({
        name: "General Inquiry",
        admissionCutoffMinutes: "30",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid service without scheduling fields (defaults to undefined in zod parse)", () => {
      const result = createServiceSchema.safeParse({ name: "Consultation" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.durationMinutes).toBeUndefined();
        expect(result.data.bufferMinutes).toBeUndefined();
        expect(result.data.minNoticeHours).toBeUndefined();
        expect(result.data.maxAdvanceDays).toBeUndefined();
        expect(result.data.slotCapacity).toBeUndefined();
        expect(result.data.cancellationNoticeHours).toBeUndefined();
      }
    });

    it("accepts custom valid scheduling fields", () => {
      const result = createServiceSchema.safeParse({
        name: "VIP Meeting",
        durationMinutes: 60,
        bufferMinutes: 15,
        minNoticeHours: 4,
        maxAdvanceDays: 60,
        slotCapacity: 3,
        cancellationNoticeHours: 6,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.durationMinutes).toBe(60);
        expect(result.data.bufferMinutes).toBe(15);
        expect(result.data.minNoticeHours).toBe(4);
        expect(result.data.maxAdvanceDays).toBe(60);
        expect(result.data.slotCapacity).toBe(3);
        expect(result.data.cancellationNoticeHours).toBe(6);
      }
    });

    it("rejects durationMinutes below 5 or above 480", () => {
      expect(
        createServiceSchema.safeParse({ name: "Test", durationMinutes: 4 }).success,
      ).toBe(false);
      expect(
        createServiceSchema.safeParse({ name: "Test", durationMinutes: 481 }).success,
      ).toBe(false);
    });

    it("rejects bufferMinutes below 0 or above 240", () => {
      expect(
        createServiceSchema.safeParse({ name: "Test", bufferMinutes: -1 }).success,
      ).toBe(false);
      expect(
        createServiceSchema.safeParse({ name: "Test", bufferMinutes: 241 }).success,
      ).toBe(false);
    });

    it("rejects minNoticeHours below 0 or above 168", () => {
      expect(
        createServiceSchema.safeParse({ name: "Test", minNoticeHours: -1 }).success,
      ).toBe(false);
      expect(
        createServiceSchema.safeParse({ name: "Test", minNoticeHours: 169 }).success,
      ).toBe(false);
    });

    it("rejects maxAdvanceDays below 1 or above 365", () => {
      expect(
        createServiceSchema.safeParse({ name: "Test", maxAdvanceDays: 0 }).success,
      ).toBe(false);
      expect(
        createServiceSchema.safeParse({ name: "Test", maxAdvanceDays: 366 }).success,
      ).toBe(false);
    });

    it("rejects slotCapacity below 1 or above 50", () => {
      expect(
        createServiceSchema.safeParse({ name: "Test", slotCapacity: 0 }).success,
      ).toBe(false);
      expect(
        createServiceSchema.safeParse({ name: "Test", slotCapacity: 51 }).success,
      ).toBe(false);
    });

    it("rejects cancellationNoticeHours below 0 or above 168", () => {
      expect(
        createServiceSchema.safeParse({ name: "Test", cancellationNoticeHours: -1 }).success,
      ).toBe(false);
      expect(
        createServiceSchema.safeParse({ name: "Test", cancellationNoticeHours: 169 }).success,
      ).toBe(false);
    });
  });

  describe("updateServiceSchema", () => {
    it("accepts updating scheduling fields independently", () => {
      const result = updateServiceSchema.safeParse({
        durationMinutes: 45,
        slotCapacity: 2,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.durationMinutes).toBe(45);
        expect(result.data.slotCapacity).toBe(2);
      }
    });
    it("accepts updating admissionCutoffMinutes alone", () => {
      const result = updateServiceSchema.safeParse({
        admissionCutoffMinutes: 45,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.admissionCutoffMinutes).toBe(45);
      }
    });

    it("accepts resetting admissionCutoffMinutes to null", () => {
      const result = updateServiceSchema.safeParse({
        admissionCutoffMinutes: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.admissionCutoffMinutes).toBeNull();
      }
    });

    it("rejects empty update object", () => {
      const result = updateServiceSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects invalid admissionCutoffMinutes on update", () => {
      const result = updateServiceSchema.safeParse({
        admissionCutoffMinutes: -1,
      });
      expect(result.success).toBe(false);
    });
  });
});
