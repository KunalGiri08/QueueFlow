import { z } from "zod";

export const createAppointmentSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
  scheduledAt: z.coerce
    .date()
    .refine(
      (date) => date.getTime() > Date.now(),
      "Appointment must be scheduled in the future",
    ),
});

export const updateAppointmentSchema = z.object({
  scheduledAt: z.coerce
    .date()
    .refine(
      (date) => date.getTime() > Date.now(),
      "Appointment must be scheduled in the future",
    ),
});
