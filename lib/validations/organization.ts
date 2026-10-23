import { z } from "zod";
import { ianaTimezoneSchema } from "./schedule";

export const createOrganizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(100, "Organization name must be 100 characters or fewer"),
  slug: z
    .string()
    .trim()
    .min(1, "Organization slug is required")
    .max(50, "Organization slug must be 50 characters or fewer")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen",
    ),
  timezone: ianaTimezoneSchema.optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Organization name is required")
      .max(100, "Organization name must be 100 characters or fewer")
      .optional(),
    timezone: ianaTimezoneSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.timezone !== undefined, {
    message: "At least one field must be provided",
  });

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
