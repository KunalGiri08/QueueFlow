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
  });

  describe("updateServiceSchema", () => {
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
