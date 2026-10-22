import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateServiceSchema = z
  .object({
    name: z.string().min(1, "Service name is required").optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.isActive !== undefined,
    {
      message: "At least one field is required",
    },
  );
