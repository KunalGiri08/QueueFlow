import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_APPOINTMENT_ADVANCE_DAYS,
  MAX_APPOINTMENT_ADVANCE_MS,
  createAppointmentSchema,
  updateAppointmentSchema,
} from "./appointment";

const BASE_TIME = new Date("2026-10-13T12:00:00.000Z");

describe("Appointment validation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createAppointmentSchema", () => {
    it("rejects an empty service ID", () => {
      const result = createAppointmentSchema.safeParse({
        serviceId: "",
        scheduledAt: new Date(BASE_TIME.getTime() + 60_000).toISOString(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.serviceId).toContain(
          "Service ID is required",
        );
      }
    });

    it("accepts a valid UTC Z timestamp", () => {
      const scheduledIso = "2026-10-14T15:30:00Z";
      const result = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: scheduledIso,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scheduledAt).toBeInstanceOf(Date);
        expect(result.data.scheduledAt.getTime()).toBe(
          new Date(scheduledIso).getTime(),
        );
      }
    });

    it("accepts valid explicit numeric timezone offsets (+05:30, -04:00, +00:00)", () => {
      const positiveOffset = "2026-10-14T21:00:00+05:30";
      const negativeOffset = "2026-10-14T11:30:00-04:00";
      const zeroOffset = "2026-10-14T15:30:00+00:00";

      const r1 = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: positiveOffset,
      });
      const r2 = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: negativeOffset,
      });
      const r3 = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: zeroOffset,
      });

      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);

      if (r1.success && r2.success && r3.success) {
        expect(r1.data.scheduledAt.toISOString()).toBe("2026-10-14T15:30:00.000Z");
        expect(r2.data.scheduledAt.toISOString()).toBe("2026-10-14T15:30:00.000Z");
        expect(r3.data.scheduledAt.toISOString()).toBe("2026-10-14T15:30:00.000Z");
      }
    });

    it("rejects timezone-less datetime strings", () => {
      const timezoneLessStrings = [
        "2026-10-14T15:30:00",
        "2026-10-14 15:30:00",
        "2026-10-14",
      ];

      for (const scheduledAt of timezoneLessStrings) {
        const result = createAppointmentSchema.safeParse({
          serviceId: "service-123",
          scheduledAt,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.flatten().fieldErrors.scheduledAt).toContain(
            "Invalid ISO datetime",
          );
        }
      }
    });

    it("rejects invalid date values and formats", () => {
      const invalidValues = [
        "not-a-date",
        "2026-02-30T12:00:00Z",
        "2026-02-29T12:00:00Z",
        "2026-13-01T12:00:00Z",
        "2026-10-14T25:00:00Z",
        "2026-10-14T12:65:00Z",
        "2026-10-14T12:00:65Z",
        "2026-10-14T12:00:00+25:00",
      ];

      for (const scheduledAt of invalidValues) {
        const result = createAppointmentSchema.safeParse({
          serviceId: "service-123",
          scheduledAt,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.flatten().fieldErrors.scheduledAt).toContain(
            "Invalid ISO datetime",
          );
        }
      }
    });

    it("rejects non-string values", () => {
      const nonStrings = [123456789, null, true, {}];

      for (const scheduledAt of nonStrings) {
        const result = createAppointmentSchema.safeParse({
          serviceId: "service-123",
          scheduledAt,
        });

        expect(result.success).toBe(false);
      }
    });

    it("rejects an appointment scheduled in the past or exactly at current server time", () => {
      const pastResult = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: new Date(BASE_TIME.getTime() - 60_000).toISOString(),
      });
      expect(pastResult.success).toBe(false);
      if (!pastResult.success) {
        expect(pastResult.error.flatten().fieldErrors.scheduledAt).toContain(
          "Appointment must be scheduled in the future",
        );
      }

      const nowResult = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: BASE_TIME.toISOString(),
      });
      expect(nowResult.success).toBe(false);
      if (!nowResult.success) {
        expect(nowResult.error.flatten().fieldErrors.scheduledAt).toContain(
          "Appointment must be scheduled in the future",
        );
      }
    });

    it("accepts an appointment at the exact 365-day boundary", () => {
      const boundaryDate = new Date(
        BASE_TIME.getTime() + MAX_APPOINTMENT_ADVANCE_MS,
      );
      const result = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: boundaryDate.toISOString(),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scheduledAt.getTime()).toBe(boundaryDate.getTime());
      }
    });

    it("rejects an appointment scheduled beyond 365 days", () => {
      const beyondBoundary = new Date(
        BASE_TIME.getTime() + MAX_APPOINTMENT_ADVANCE_MS + 1,
      );
      const result = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: beyondBoundary.toISOString(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.scheduledAt).toContain(
          `Appointment cannot be scheduled more than ${MAX_APPOINTMENT_ADVANCE_DAYS} days in advance`,
        );
      }
    });

    it("preserves exact seconds and milliseconds precision without rounding", () => {
      const scheduledWithMs = "2026-10-14T15:30:45.678Z";
      const result = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: scheduledWithMs,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scheduledAt.getUTCSeconds()).toBe(45);
        expect(result.data.scheduledAt.getUTCMilliseconds()).toBe(678);
        expect(result.data.scheduledAt.toISOString()).toBe(scheduledWithMs);
      }

      const offsetWithMs = "2026-10-14T21:00:45.678+05:30";
      const offsetResult = createAppointmentSchema.safeParse({
        serviceId: "service-123",
        scheduledAt: offsetWithMs,
      });

      expect(offsetResult.success).toBe(true);
      if (offsetResult.success) {
        expect(offsetResult.data.scheduledAt.getUTCSeconds()).toBe(45);
        expect(offsetResult.data.scheduledAt.getUTCMilliseconds()).toBe(678);
        expect(offsetResult.data.scheduledAt.toISOString()).toBe(
          "2026-10-14T15:30:45.678Z",
        );
      }
    });
  });

  describe("updateAppointmentSchema (rescheduling)", () => {
    it("accepts a valid UTC Z timestamp", () => {
      const result = updateAppointmentSchema.safeParse({
        scheduledAt: "2026-10-14T15:30:00Z",
      });

      expect(result.success).toBe(true);
    });

    it("accepts valid explicit numeric timezone offsets", () => {
      const result = updateAppointmentSchema.safeParse({
        scheduledAt: "2026-10-14T21:00:00+05:30",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scheduledAt.toISOString()).toBe(
          "2026-10-14T15:30:00.000Z",
        );
      }
    });

    it("rejects timezone-less datetime strings", () => {
      const result = updateAppointmentSchema.safeParse({
        scheduledAt: "2026-10-14T15:30:00",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.scheduledAt).toContain(
          "Invalid ISO datetime",
        );
      }
    });

    it("rejects invalid date values", () => {
      const result = updateAppointmentSchema.safeParse({
        scheduledAt: "not-a-date",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.scheduledAt).toContain(
          "Invalid ISO datetime",
        );
      }
    });

    it("rejects an appointment scheduled in the past or at current server time", () => {
      const pastResult = updateAppointmentSchema.safeParse({
        scheduledAt: new Date(BASE_TIME.getTime() - 60_000).toISOString(),
      });
      expect(pastResult.success).toBe(false);
      if (!pastResult.success) {
        expect(pastResult.error.flatten().fieldErrors.scheduledAt).toContain(
          "Appointment must be scheduled in the future",
        );
      }

      const nowResult = updateAppointmentSchema.safeParse({
        scheduledAt: BASE_TIME.toISOString(),
      });
      expect(nowResult.success).toBe(false);
      if (!nowResult.success) {
        expect(nowResult.error.flatten().fieldErrors.scheduledAt).toContain(
          "Appointment must be scheduled in the future",
        );
      }
    });

    it("accepts at the 365-day boundary", () => {
      const boundaryDate = new Date(
        BASE_TIME.getTime() + MAX_APPOINTMENT_ADVANCE_MS,
      );
      const result = updateAppointmentSchema.safeParse({
        scheduledAt: boundaryDate.toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it("rejects beyond 365 days", () => {
      const beyondBoundary = new Date(
        BASE_TIME.getTime() + MAX_APPOINTMENT_ADVANCE_MS + 1,
      );
      const result = updateAppointmentSchema.safeParse({
        scheduledAt: beyondBoundary.toISOString(),
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.scheduledAt).toContain(
          `Appointment cannot be scheduled more than ${MAX_APPOINTMENT_ADVANCE_DAYS} days in advance`,
        );
      }
    });

    it("preserves exact seconds and milliseconds precision", () => {
      const scheduledWithMs = "2026-10-14T15:30:45.678Z";
      const result = updateAppointmentSchema.safeParse({
        scheduledAt: scheduledWithMs,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scheduledAt.getUTCSeconds()).toBe(45);
        expect(result.data.scheduledAt.getUTCMilliseconds()).toBe(678);
      }
    });
  });
});

