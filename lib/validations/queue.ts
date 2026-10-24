import { z } from "zod";

export const createQueueSchema = z.object({
  name: z.string().min(1, "Queue name is required"),
  maxWaitingTickets: z
    .number()
    .int({ message: "Max waiting tickets must be an integer" })
    .min(1, { message: "Max waiting tickets must be at least 1" })
    .max(10000, { message: "Max waiting tickets cannot exceed 10,000" })
    .nullable()
    .optional(),
  maxDailyTickets: z
    .number()
    .int({ message: "Max daily tickets must be an integer" })
    .min(1, { message: "Max daily tickets must be at least 1" })
    .max(100000, { message: "Max daily tickets cannot exceed 100,000" })
    .nullable()
    .optional(),
});

export const updateQueueSchema = z
  .object({
    name: z.string().min(1, "Queue name is required").optional(),
    isActive: z.boolean().optional(),
    maxWaitingTickets: z
      .number()
      .int({ message: "Max waiting tickets must be an integer" })
      .min(1, { message: "Max waiting tickets must be at least 1" })
      .max(10000, { message: "Max waiting tickets cannot exceed 10,000" })
      .nullable()
      .optional(),
    maxDailyTickets: z
      .number()
      .int({ message: "Max daily tickets must be an integer" })
      .min(1, { message: "Max daily tickets must be at least 1" })
      .max(100000, { message: "Max daily tickets cannot exceed 100,000" })
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.isActive !== undefined ||
      data.maxWaitingTickets !== undefined ||
      data.maxDailyTickets !== undefined,
    {
      message: "At least one field is required",
    },
  );

export const callNextTicketSchema = z.object({
  counterId: z.string().trim().min(1, "Counter ID is required"),
});
