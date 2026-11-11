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
  durationMinutes: z
    .number()
    .int({ message: "Duration minutes must be an integer" })
    .min(5, { message: "Duration must be at least 5 minutes" })
    .max(480, { message: "Duration cannot exceed 480 minutes (8 hours)" })
    .optional(),
  bufferMinutes: z
    .number()
    .int({ message: "Buffer minutes must be an integer" })
    .min(0, { message: "Buffer minutes cannot be negative" })
    .max(240, { message: "Buffer cannot exceed 240 minutes (4 hours)" })
    .optional(),
  minNoticeHours: z
    .number()
    .int({ message: "Minimum notice hours must be an integer" })
    .min(0, { message: "Minimum notice cannot be negative" })
    .max(168, { message: "Minimum notice cannot exceed 168 hours (7 days)" })
    .optional(),
  maxAdvanceDays: z
    .number()
    .int({ message: "Maximum advance days must be an integer" })
    .min(1, { message: "Maximum advance days must be at least 1" })
    .max(365, { message: "Maximum advance days cannot exceed 365" })
    .optional(),
  slotCapacity: z
    .number()
    .int({ message: "Slot capacity must be an integer" })
    .min(1, { message: "Slot capacity must be at least 1" })
    .max(50, { message: "Slot capacity cannot exceed 50" })
    .optional(),
  cancellationNoticeHours: z
    .number()
    .int({ message: "Cancellation notice hours must be an integer" })
    .min(0, { message: "Cancellation notice cannot be negative" })
    .max(168, { message: "Cancellation notice cannot exceed 168 hours (7 days)" })
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
    durationMinutes: z
      .number()
      .int({ message: "Duration minutes must be an integer" })
      .min(5, { message: "Duration must be at least 5 minutes" })
      .max(480, { message: "Duration cannot exceed 480 minutes (8 hours)" })
      .optional(),
    bufferMinutes: z
      .number()
      .int({ message: "Buffer minutes must be an integer" })
      .min(0, { message: "Buffer minutes cannot be negative" })
      .max(240, { message: "Buffer cannot exceed 240 minutes (4 hours)" })
      .optional(),
    minNoticeHours: z
      .number()
      .int({ message: "Minimum notice hours must be an integer" })
      .min(0, { message: "Minimum notice cannot be negative" })
      .max(168, { message: "Minimum notice cannot exceed 168 hours (7 days)" })
      .optional(),
    maxAdvanceDays: z
      .number()
      .int({ message: "Maximum advance days must be an integer" })
      .min(1, { message: "Maximum advance days must be at least 1" })
      .max(365, { message: "Maximum advance days cannot exceed 365" })
      .optional(),
    slotCapacity: z
      .number()
      .int({ message: "Slot capacity must be an integer" })
      .min(1, { message: "Slot capacity must be at least 1" })
      .max(50, { message: "Slot capacity cannot exceed 50" })
      .optional(),
    cancellationNoticeHours: z
      .number()
      .int({ message: "Cancellation notice hours must be an integer" })
      .min(0, { message: "Cancellation notice cannot be negative" })
      .max(168, { message: "Cancellation notice cannot exceed 168 hours (7 days)" })
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.isActive !== undefined ||
      data.admissionCutoffMinutes !== undefined ||
      data.durationMinutes !== undefined ||
      data.bufferMinutes !== undefined ||
      data.minNoticeHours !== undefined ||
      data.maxAdvanceDays !== undefined ||
      data.slotCapacity !== undefined ||
      data.cancellationNoticeHours !== undefined,
    {
      message: "At least one field is required",
    },
  );
