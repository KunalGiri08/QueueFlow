import { z } from "zod";

export const createQueueSchema = z.object({
  name: z.string().min(1, "Queue name is required"),
});

export const updateQueueSchema = z
  .object({
    name: z.string().min(1, "Queue name is required").optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.name !== undefined || data.isActive !== undefined, {
    message: "At least one field is required",
  });
