import { z } from "zod";

export const MAX_APPOINTMENT_ADVANCE_DAYS = 365;
export const MAX_APPOINTMENT_ADVANCE_MS =
  MAX_APPOINTMENT_ADVANCE_DAYS * 24 * 60 * 60 * 1000;

export const appointmentScheduledAtSchema = z
  .string()
  .datetime({ offset: true, message: "Invalid ISO datetime" })
  .transform((str) => new Date(str))
  .superRefine((date, ctx) => {
    const now = Date.now();

    if (date.getTime() <= now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Appointment must be scheduled in the future",
      });
      return;
    }

    if (date.getTime() > now + MAX_APPOINTMENT_ADVANCE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Appointment cannot be scheduled more than ${MAX_APPOINTMENT_ADVANCE_DAYS} days in advance`,
      });
    }
  });

export const createAppointmentSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  scheduledAt: appointmentScheduledAtSchema,
});

export const updateAppointmentSchema = z.object({
  scheduledAt: appointmentScheduledAtSchema,
});

