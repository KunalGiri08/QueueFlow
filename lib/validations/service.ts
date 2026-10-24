import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().min(1, "Service name is required"),
  description: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  admissionCutoffMinutes: z
    .number()
    .int({ message: "Admission cutoff minutes must be an integer" })
    .min(0, { message: "Admission cutoff minutes cannot be negative" })
    .max(480, { message: "Admission cutoff minutes cannot exceed 480 (8 hours)" })
    .nullable()
    .optional(),
});

export const updateServiceSchema = z
  .object({
    name: z.string().min(1, "Service name is required").optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
    admissionCutoffMinutes: z
      .number()
      .int({ message: "Admission cutoff minutes must be an integer" })
      .min(0, { message: "Admission cutoff minutes cannot be negative" })
      .max(480, { message: "Admission cutoff minutes cannot exceed 480 (8 hours)" })
      .nullable()
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.isActive !== undefined ||
      data.admissionCutoffMinutes !== undefined,
    {
      message: "At least one field is required",
    },
  );
