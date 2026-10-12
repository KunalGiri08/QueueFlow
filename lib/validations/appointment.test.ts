import { describe, expect, it } from "vitest";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "./appointment";

describe("Appointment validation", () => {
  it("rejects an empty service ID", () => {
    const result = createAppointmentSchema.safeParse({
      serviceId: "",
      scheduledAt: new Date(Date.now() + 60_000),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a future appointment time", () => {
    const result = createAppointmentSchema.safeParse({
      serviceId: "service-123",
      scheduledAt: new Date(Date.now() + 60_000),
    });

    expect(result.success).toBe(true);
  });

  it("rejects an appointment scheduled in the past", () => {
    const result = updateAppointmentSchema.safeParse({
      scheduledAt: new Date(Date.now() - 60_000),
    });

    expect(result.success).toBe(false);
  });
});
